"""Remaining work uses live physical sources and current stocktake boundaries."""
from copy import deepcopy
from decimal import Decimal
import json
import uuid

import pytest
from sqlalchemy import event

from app import models
from app.services import sr_draft
from app.services.sr_validation import LineInput
from tests.services.test_io_draft_reservations import owner  # noqa: F401
from tests.services.test_stocktake_counts import setup_round
from tests.services.test_work_reservation_backfill import legacy_batch
from tests.services.test_work_stocktake_pause import mark_applied


@pytest.mark.parametrize("physical,pending,shipping,quantities", [
    (1, 0, 0, [3]), (5, 0, 0, [3, 3]), (5, 3, 0, [3]), (5, 0, 3, [3]),
])
def test_legacy_resume_rejects_aggregate_warehouse_shortage(
    db_session, make_item, physical, pending, shipping, quantities,
):
    from app.services.work_stocktake_pause import pause_payload
    db_session.add(models.Department(name="튜브", is_active=True))
    _, actor, item, round_, _ = setup_round(db_session, make_item)
    args = dict(requester=actor, request_type=models.StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        reference_no="original", notes="original notes", lines_input=[LineInput(
            item_id=item.item_id, quantity=1, from_bucket=models.RequestBucketEnum.WAREHOUSE,
            from_department=None, to_bucket=models.RequestBucketEnum.PRODUCTION, to_department="튜브")])
    request = sr_draft.upsert_draft_request(db_session, **args)
    db_session.commit()
    mark_applied(db_session, round_["round_id"], item.item_id, scopes=("warehouse", "tube"))
    inventory = db_session.query(models.Inventory).filter_by(item_id=item.item_id).one()
    inventory.warehouse_qty, inventory.pending_quantity = physical, pending
    if shipping:
        shipment = models.ShippingRequest(base_pf_item_id=item.item_id, request_quantity=1)
        db_session.add(shipment)
        db_session.flush()
        db_session.add(models.ShippingAllocation(request_id=shipment.request_id,
            item_id=item.item_id, department=None, quantity=shipping, status="RESERVED"))
    db_session.commit()
    pause = pause_payload(db_session, "stock_request", request.request_id)
    assert pause["state"] == "ready"
    new_lines = [deepcopy(args["lines_input"][0]) for _ in quantities]
    for line, quantity in zip(new_lines, quantities):
        line.quantity = Decimal(quantity)
    with pytest.raises(ValueError, match="부족"):
        sr_draft.upsert_draft_request(db_session, **{**args, "lines_input": new_lines,
            "notes": "must roll back", "stocktake_resume_token": uuid.UUID(pause["token"])})
    db_session.rollback()
    assert request.notes == "original notes" and request.lines[0].quantity == 1
    assert len(request.lines) == 1
    assert pause_payload(db_session, "stock_request", request.request_id)["token"] == pause["token"]


@pytest.mark.parametrize("request_type", [models.StockRequestTypeEnum.SCRAP_NORMAL,
    models.StockRequestTypeEnum.REWORK_NORMAL, models.StockRequestTypeEnum.DEPT_TO_WAREHOUSE])
@pytest.mark.parametrize("current_quantity,allowed", [(1, False), (5, True)])
def test_legacy_resume_uses_current_department_source(
    db_session, make_item, make_location, make_bom, request_type, current_quantity, allowed,
):
    from app.services.work_stocktake_pause import pause_payload
    db_session.add_all([models.Department(name="튜브", is_active=True),
        models.Department(name="조립", is_active=True),
        models.InventoryScope(scope_key="assembly", physical_department="조립")])
    child = make_item() if request_type == models.StockRequestTypeEnum.REWORK_NORMAL else None
    _, actor, item, round_, _ = setup_round(db_session, make_item)
    notes = "preserve"
    if child is not None:
        make_bom(item.item_id, child.item_id, qty=1)
        notes = json.dumps({"child_decisions": [{"item_id": str(child.item_id),
            "qty": 3, "normal_qty": 3, "defective_qty": 0, "scrap_qty": 0}]})
    make_location(item.item_id, department=models.DepartmentEnum.TUBE, quantity=Decimal(current_quantity))
    make_location(item.item_id, department=models.DepartmentEnum.ASSEMBLY, quantity=Decimal(10 if not allowed else 0))
    args = dict(requester=actor, request_type=request_type, reference_no=None, notes=notes,
        lines_input=[LineInput(item_id=item.item_id, quantity=Decimal(3),
            from_bucket=models.RequestBucketEnum.PRODUCTION, from_department="조립",
            to_bucket=(models.RequestBucketEnum.WAREHOUSE if request_type == models.StockRequestTypeEnum.DEPT_TO_WAREHOUSE
                       else models.RequestBucketEnum.NONE), to_department=None)])
    request = sr_draft.upsert_draft_request(db_session, **args)
    db_session.commit()
    mark_applied(db_session, round_["round_id"], item.item_id, scopes=("warehouse", "tube", "assembly"))
    if child is not None:
        mark_applied(db_session, round_["round_id"], child.item_id, scopes=("tube",))
    pause = pause_payload(db_session, "stock_request", request.request_id)
    assert pause["state"] == "ready"
    if allowed:
        sr_draft.upsert_draft_request(db_session, **args, stocktake_resume_token=uuid.UUID(pause["token"]))
        assert pause_payload(db_session, "stock_request", request.request_id) is None
    else:
        with pytest.raises(ValueError, match="부족"):
            sr_draft.upsert_draft_request(db_session, **args, stocktake_resume_token=uuid.UUID(pause["token"]))
        db_session.rollback()
        assert pause_payload(db_session, "stock_request", request.request_id)["token"] == pause["token"]


@pytest.mark.parametrize("apply", [False, True])
def test_backfill_rechecks_normalized_destination_without_writes(db_session, make_item, owner, apply):
    from app.services.work_reservation_backfill import backfill_work_reservations
    db_session.add_all([models.Department(name="튜브", is_active=True),
        models.Department(name="조립", is_active=True),
        models.InventoryScope(scope_key="assembly", physical_department="조립")])
    _, _, item, round_, _ = setup_round(db_session, make_item)
    # The old assembly destination is applied, but current TR routing leads to tube.
    batch = legacy_batch(db_session, owner, item)
    batch.bundles[0].lines[0].to_department = "조립"
    db_session.commit()
    mark_applied(db_session, round_["round_id"], item.item_id, scopes=("warehouse", "assembly"))
    assert db_session.get(models.StocktakeWorkPause, ("io", batch.batch_id)) is None
    assert not any(g.active_count_id for g in db_session.query(models.StocktakeGate).all())
    writes = []
    def capture(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().split()[0].upper() in {"INSERT", "UPDATE", "DELETE"}:
            writes.append(statement)
    event.listen(db_session.bind, "before_cursor_execute", capture)
    try:
        report = backfill_work_reservations(db_session, apply=apply)
    finally:
        event.remove(db_session.bind, "before_cursor_execute", capture)
    assert report == [{"batch_id": str(batch.batch_id), "status": "skipped", "issue": "stocktake_paused"}]
    assert writes == []
    assert batch.revision == 0 and batch.reservation_status == "inactive"
    assert batch.effective_plan is None
    assert batch.bundles[0].lines[0].to_department == "조립"
    assert db_session.query(models.IoDraftReservation).count() == 0
    assert db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 0


def test_backfill_locked_recheck_reports_pause_after_stale_read(db_session, make_item, owner, monkeypatch):
    from app.services import work_stocktake_pause
    from app.services.work_reservation_backfill import backfill_work_reservations
    db_session.add(models.Department(name="튜브", is_active=True))
    _, _, item, _, _ = setup_round(db_session, make_item)
    batch = legacy_batch(db_session, owner, item)
    # Simulate a stale advisory read; the apply boundary must still inspect locked targets.
    monkeypatch.setattr(work_stocktake_pause, "has_unapplied_cells", lambda db, cells: False)
    assert backfill_work_reservations(db_session, apply=True) == [
        {"batch_id": str(batch.batch_id), "status": "skipped", "issue": "stocktake_paused"}]
    assert batch.revision == 0 and batch.effective_plan is None
    assert db_session.query(models.IoDraftReservation).count() == 0
    assert db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 0
