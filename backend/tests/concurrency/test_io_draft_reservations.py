"""File SQLite contention uses distinct connections and the production write mode."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy

import pytest

from app.models import DepartmentEnum, Employee, Inventory, IoBatch, IoDraftReservation, Item, TransactionLog
from app.schemas.io import IoDraftUpsert
from app.services.io_draft import save_draft, delete_draft
from app.services.work_reservation_errors import WorkReservationError
from tests.services.test_io_draft_reservations import draft_payload


def setup_payload(make_session):
    with make_session() as db:
        owner = Employee(employee_code="CONCURRENT-WORK", name="Owner", role="staff",
                         department=DepartmentEnum.ASSEMBLY, is_active=True)
        item = Item(item_name="Concurrent", process_type_code="AR", model_symbol="9", serial_no=1, unit="EA")
        db.add_all([owner, item])
        db.flush()
        db.add(Inventory(item_id=item.item_id, quantity=1, warehouse_qty=1, pending_quantity=0))
        db.commit()
        return draft_payload(owner, item, 1)


def run_save(make_session, payload):
    with make_session() as db:
        try:
            result = save_draft(db, IoDraftUpsert.model_validate(payload))
            db.commit()
            return str(result["batch_id"])
        except WorkReservationError as exc:
            db.rollback()
            return exc.code


@pytest.mark.parametrize("same_key", [False, True])
def test_last_unit_or_same_create_key_has_only_one_ledger(make_session, same_key):
    import uuid
    payload = setup_payload(make_session)
    other = deepcopy(payload)
    if not same_key:
        other["client_request_id"] = str(uuid.uuid4())
        other["bundles"][0]["bundle_id"] = str(uuid.uuid4())
        other["bundles"][0]["lines"][0]["line_id"] = str(uuid.uuid4())
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(run_save, make_session, request) for request in [payload, other]]
        results = [future.result() for future in futures]
    if same_key:
        assert results[0] == results[1]
    else:
        assert len(set(results)) == 2
    with make_session() as db:
        batches = db.query(IoBatch).all()
        assert len(batches) == (1 if same_key else 2)
        assert sum(batch.reservation_issue is not None for batch in batches) == (0 if same_key else 1)
        if not same_key:
            shortage = next(batch.reservation_issue for batch in batches if batch.reservation_issue)
            assert shortage["code"] == "stock_shortage"
            assert shortage["shortages"][0]["shortage_quantity"] == 1
        assert db.query(IoDraftReservation).one().quantity == 1
        assert db.query(Inventory).one().pending_quantity == 1
        assert db.query(Inventory).one().warehouse_qty == 1
        assert db.query(TransactionLog).count() == 0


def test_same_revision_edit_delete_only_one_commits(make_session):
    import uuid
    payload = setup_payload(make_session)
    batch_id = run_save(make_session, payload)
    payload.update(batch_id=batch_id, expected_revision=1, notes="updated")

    def remove():
        with make_session() as db:
            try:
                delete_draft(db, batch_id=uuid.UUID(batch_id),
                    requester_employee_id=uuid.UUID(payload["requester_employee_id"]), expected_revision=1)
                db.commit()
                return "deleted"
            except WorkReservationError as exc:
                db.rollback()
                return exc.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(run_save, make_session, payload), pool.submit(remove)]
        results = [future.result() for future in futures]
    assert results.count("WORK_REVISION_CONFLICT") == 1
    with make_session() as db:
        batch = db.query(IoBatch).one()
        assert batch.revision == 2
        expected = 0 if batch.status == "cancelled" else 1
        assert db.query(Inventory).one().pending_quantity == expected
        assert db.query(IoDraftReservation).count() == expected
