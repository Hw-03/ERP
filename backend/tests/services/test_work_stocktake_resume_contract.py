"""Resume metadata must not change durable pre-feature creation idempotency."""
from types import SimpleNamespace
import uuid
from starlette.requests import Request

from app import models
from app.schemas.io import IoDraftUpsert
from app.services.io_reservations import creation_hash
from tests.services.test_io_draft_reservations import owner


def test_creation_fingerprint_stays_compatible_without_resume_field():
    payload = IoDraftUpsert(requester_employee_id=uuid.uuid4(), work_type="warehouse_io",
        sub_type="warehouse_to_dept", client_request_id="preserved-key", bundles=[])
    old = payload.model_dump(mode="json", exclude={"stocktake_resume_token"})
    previous_payload = SimpleNamespace(model_dump=lambda **kwargs: old)
    assert creation_hash(payload) == creation_hash(previous_payload)
    payload.stocktake_resume_token = uuid.uuid4()
    assert creation_hash(payload) == creation_hash(previous_payload)


def test_admin_cancel_clears_pause_without_changing_counted_stock(db_session, make_item, owner):
    from app.services.work_reservation_admin import cancel_work_reservation
    from tests.services.test_work_stocktake_pause import start_with_work
    item, _, saved, _ = start_with_work(db_session, make_item, owner)
    batch = db_session.get(models.IoBatch, saved["batch_id"])
    cancel_work_reservation(db_session, batch_id=batch.batch_id, expected_revision=batch.revision,
        reason="already counted", request=Request({"type": "http", "headers": []}))
    db_session.commit()
    assert db_session.get(models.StocktakeWorkPause, ("io", batch.batch_id)) is None
    assert db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == 10


def test_paused_save_and_creation_retry_return_the_same_pause(db_session, make_item, owner):
    from app.services import io_draft
    from tests.services.test_io_draft_reservations import draft_payload
    from tests.services.test_work_stocktake_pause import start_with_work
    item, _, _, _ = start_with_work(db_session, make_item, owner)
    payload = IoDraftUpsert.model_validate(draft_payload(owner, item))
    saved = io_draft.save_draft(db_session, payload)
    db_session.commit()
    assert saved["stocktake_pause"]["state"] == "blocked"
    retry = io_draft.save_draft(db_session, payload)
    assert retry["stocktake_pause"] == saved["stocktake_pause"]


def test_rejection_returning_to_draft_gets_a_stocktake_pause(db_session, make_item):
    from app.services.io_persist import sync_batch_from_stock_requests
    from tests.services.test_stocktake_counts import setup_round
    _, owner, item, round_, _ = setup_round(db_session, make_item)
    batch = models.IoBatch(work_type="process", sub_type="adjust_in", status="submitted",
        requester_employee_id=owner.employee_id, requester_name=owner.name, requester_department="튜브",
        effective_plan={"effects": [{"item_id": str(item.item_id), "from": None,
            "to": {"bucket": "production", "department": "튜브"}}]})
    db_session.add(batch)
    db_session.flush()
    request = models.StockRequest(requester_employee_id=owner.employee_id, requester_name=owner.name,
        requester_department="튜브", request_type=models.StockRequestTypeEnum.MANUAL_ADJUSTMENT,
        status=models.StockRequestStatusEnum.REJECTED, requires_department_approval=True,
        requires_warehouse_approval=False, operation_batch_id=batch.batch_id)
    db_session.add(request)
    db_session.flush()
    sync_batch_from_stock_requests(db_session, batch, [request])
    assert batch.status == "draft"
    pause = db_session.get(models.StocktakeWorkPause, ("io", batch.batch_id))
    assert pause is not None and str(pause.round_id) == round_["round_id"]
