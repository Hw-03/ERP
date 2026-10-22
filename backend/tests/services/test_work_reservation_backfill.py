"""Legacy conversion uses synthetic data and never promises the same stock twice."""
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import event

from app.models import Inventory, IoDraftReservation, IoWorkReservationEvent, TransactionLog
from app.schemas.io import IoDraftUpsert
from app.services.io_persist import _persist_batch
from tests.services.test_io_draft_reservations import draft_payload, owner  # noqa: F401


def legacy_batch(db, owner, item, quantity=3, *, age=0):
    """Persist an old draft without running the new reservation save command."""
    batch = _persist_batch(db, requester=owner,
        payload=IoDraftUpsert.model_validate(draft_payload(owner, item, quantity)), status="draft")
    batch.bundles[0].lines[0].mes_code_snapshot = item.mes_code
    batch.created_at = datetime(2020, 1, 1) + timedelta(seconds=age)
    batch.revision = 0
    batch.reservation_status = "inactive"
    batch.reservation_issue = None
    db.commit()
    return batch


def run(db, *, apply=False):
    from app.services.work_reservation_backfill import backfill_work_reservations
    return backfill_work_reservations(db, apply=apply)


def test_dry_run_consumes_virtual_stock_oldest_first_without_sql_writes(db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(5))
    newer = legacy_batch(db_session, owner, item, age=2)
    older = legacy_batch(db_session, owner, item, age=1)
    writes = []
    def capture(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().split()[0].upper() in {"INSERT", "UPDATE", "DELETE"}:
            writes.append(statement)
    event.listen(db_session.bind, "before_cursor_execute", capture)
    try:
        result = run(db_session)
    finally:
        event.remove(db_session.bind, "before_cursor_execute", capture)
    assert [(row["batch_id"], row["status"]) for row in result] == [
        (str(older.batch_id), "would_reserve"), (str(newer.batch_id), "blocked")]
    assert result[1]["issue"] == "stock_shortage"
    assert writes == []
    assert db_session.query(IoDraftReservation).count() == 0
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 0
    assert older.revision == newer.revision == 0


def test_apply_and_repeat_are_idempotent_and_keep_inactive_owners_reservation(db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(5))
    first = legacy_batch(db_session, owner, item, age=1)
    second = legacy_batch(db_session, owner, item, age=2)
    result = run(db_session, apply=True)
    assert [row["status"] for row in result] == ["reserved", "blocked"]
    assert first.revision == 1 and second.revision == 0
    assert second.reservation_status == "inactive"
    assert second.reservation_issue is None
    assert result[1]["issue"] == "stock_shortage"
    events = db_session.query(IoWorkReservationEvent).count()
    assert [row["status"] for row in run(db_session, apply=True)] == ["unchanged", "blocked"]
    assert db_session.query(IoWorkReservationEvent).count() == events
    owner.is_active = False
    db_session.commit()
    result = run(db_session, apply=True)
    assert result[0]["status"] == "unchanged"
    assert first.reservation_status == "reserved" and first.revision == 1
    assert result[1]["issue"] == "inactive_owner"
    assert second.reservation_issue is None and second.revision == 0
    assert db_session.query(IoDraftReservation).one().quantity == 3
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert (inventory.warehouse_qty, inventory.pending_quantity) == (5, 3)
    assert db_session.query(TransactionLog).count() == 0


@pytest.mark.parametrize("invalid,issue", [("inactive", "inactive_owner"),
    ("defective", "unsupported_source"), ("quantity", "plan_invalid"),
    ("source_kind", "plan_invalid"), ("deleted_item", "plan_invalid")])
def test_invalid_legacy_input_is_reported_without_partial_ledger(client, db_session, make_item, owner, invalid, issue):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(10))
    batch = legacy_batch(db_session, owner, item)
    line = batch.bundles[0].lines[0]
    if invalid == "inactive":
        owner.is_active = False
    elif invalid == "defective":
        line.from_bucket = "defective"
        line.from_department = "조립"
    elif invalid == "quantity":
        line.quantity = 0
    elif invalid == "source_kind":
        batch.work_type = "process"
        batch.sub_type = "produce"
        batch.bundles[0].source_kind = "unsupported"
    else:
        item.deleted_at = datetime.utcnow()
    db_session.commit()
    assert run(db_session)[0]["issue"] == issue
    assert batch.revision == 0
    assert run(db_session, apply=True)[0]["issue"] == issue
    assert batch.reservation_status == "inactive" and batch.revision == 0
    assert batch.reservation_issue is None
    for path, headers in [(f"/api/io/{batch.batch_id}", {}),
                          (f"/api/admin/work-reservations/{batch.batch_id}", {"X-Admin-Pin": "0000"})]:
        response = client.get(path, headers=headers)
        assert response.status_code == 200, response.text
        assert response.json()["reservation_issue"] is None
    assert db_session.query(IoDraftReservation).count() == 0
    assert db_session.query(TransactionLog).count() == 0


def test_one_failed_apply_rolls_back_ledger_and_continues(db_session, make_item, owner, monkeypatch):
    from app.services import io_reservations
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(10))
    first = legacy_batch(db_session, owner, item, age=1)
    second = legacy_batch(db_session, owner, item, age=2)
    first_id = first.batch_id
    original = io_reservations.record_event
    def fail_first(db, batch, *args, **kwargs):
        if batch.batch_id == first_id:
            raise RuntimeError("synthetic event failure")
        return original(db, batch, *args, **kwargs)
    monkeypatch.setattr(io_reservations, "record_event", fail_first)
    result = run(db_session, apply=True)
    assert [row["status"] for row in result] == ["error", "reserved"]
    assert first.revision == 0 and first.reservation_status == "inactive"
    assert db_session.query(IoDraftReservation).one().batch_id == second.batch_id
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 3


def test_cli_default_is_read_only_and_requires_explicit_database(tmp_path, capsys):
    import hashlib
    from pathlib import Path
    import runpy
    from sqlalchemy import create_engine
    from app.database import Base
    script = Path(__file__).resolve().parents[2] / "scripts" / "backfill_work_reservations.py"
    assert script.is_file(), "The explicit operational entrypoint is missing"
    main = runpy.run_path(str(script))["main"]
    with pytest.raises(SystemExit) as error:
        main([])
    assert error.value.code == 2
    path = tmp_path / "synthetic.db"
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    Base.metadata.create_all(engine)
    engine.dispose()
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    assert main(["--db-path", str(path)]) == 0
    assert hashlib.sha256(path.read_bytes()).hexdigest() == before
    assert "dry-run" in capsys.readouterr().out


def test_cli_reports_blocked_work_as_incomplete_without_modifying_database(tmp_path, monkeypatch):
    """An operator must not mistake an unresolved legacy draft for a clean rollout."""
    import hashlib
    from pathlib import Path
    import runpy
    from sqlalchemy import create_engine
    from app.models import Base
    from app.services import work_reservation_backfill

    path = tmp_path / "blocked.db"
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    Base.metadata.create_all(engine)
    engine.dispose()
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    monkeypatch.setattr(work_reservation_backfill, "backfill_work_reservations", lambda db, apply: [
        {"batch_id": "blocked-work", "status": "blocked", "issue": "stock_shortage"},
    ])
    main = runpy.run_path(str(Path(__file__).resolve().parents[2] / "scripts/backfill_work_reservations.py"))["main"]
    assert main(["--db-path", str(path)]) == 2
    assert hashlib.sha256(path.read_bytes()).hexdigest() == before


def test_future_only_plan_needs_no_stock_and_replay_is_unchanged(db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(0))
    batch = legacy_batch(db_session, owner, item)
    owner.warehouse_role = "primary"
    batch.work_type = "warehouse_adjust"
    batch.sub_type = "warehouse_adjust_in"
    batch.from_department = batch.to_department = None
    line = batch.bundles[0].lines[0]
    line.direction, line.from_bucket, line.to_bucket = "adjust", "none", "warehouse"
    line.from_department = line.to_department = None
    db_session.commit()
    assert run(db_session, apply=True)[0]["status"] == "not_required"
    assert batch.effective_plan["effects"][0]["kind"] == "in"
    assert run(db_session, apply=True)[0]["status"] == "unchanged"
    assert batch.revision == 1
    assert db_session.query(IoDraftReservation).count() == 0
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == 0


def test_legacy_shipping_link_is_not_converted(db_session, make_item, owner):
    from app.models import ShippingRequest
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(10))
    batch = legacy_batch(db_session, owner, item)
    shipping = ShippingRequest(base_pf_item_id=item.item_id, request_quantity=1)
    db_session.add(shipping)
    db_session.flush()
    batch.shipping_request_id = shipping.request_id
    db_session.commit()
    assert run(db_session, apply=True)[0]["issue"] == "plan_invalid"
    assert db_session.query(IoDraftReservation).count() == 0


def test_blocked_conversion_does_not_create_a_reservation_state_or_audit_event(client, db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(1))
    batch = legacy_batch(db_session, owner, item, quantity=3)
    assert run(db_session, apply=True) == [{"batch_id": str(batch.batch_id), "status": "blocked", "issue": "stock_shortage"}]
    assert batch.revision == 0 and batch.reservation_status == "inactive"
    assert db_session.query(IoWorkReservationEvent).count() == 0
    assert db_session.query(IoDraftReservation).count() == 0
    for path, headers in [(f"/api/io/{batch.batch_id}", {}),
                          (f"/api/admin/work-reservations/{batch.batch_id}", {"X-Admin-Pin": "0000"})]:
        response = client.get(path, headers=headers)
        assert response.status_code == 200, response.text
        assert response.json()["reservation_status"] == "inactive"
        assert response.json()["reservation_issue"] is None


def test_dry_run_missing_bom_secret_never_inserts_or_flushes(db_session, make_item, owner, monkeypatch):
    from app.models import SystemSetting
    from app.services.bom_stock_policy import BOM_AUTO_TOKEN_SETTING_KEY
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(10))
    batch = legacy_batch(db_session, owner, item)
    batch.bundles[0].lines[0].origin = "bom_auto"
    db_session.query(SystemSetting).filter_by(setting_key=BOM_AUTO_TOKEN_SETTING_KEY).delete()
    db_session.commit()
    writes, flushes = [], []
    def capture(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().split()[0].upper() in {"INSERT", "UPDATE", "DELETE"}:
            writes.append(statement)
    def fail_flush(*args, **kwargs):
        flushes.append(True)
        raise AssertionError("A dry run must never flush")
    event.listen(db_session.bind, "before_cursor_execute", capture)
    monkeypatch.setattr(db_session, "flush", fail_flush)
    try:
        result = run(db_session)
    finally:
        event.remove(db_session.bind, "before_cursor_execute", capture)
    assert result == [{"batch_id": str(batch.batch_id), "status": "blocked", "issue": "plan_invalid"}]
    assert writes == flushes == []
    assert db_session.query(SystemSetting).filter_by(setting_key=BOM_AUTO_TOKEN_SETTING_KEY).count() == 0
    assert batch.revision == 0 and not db_session.new and not db_session.dirty
