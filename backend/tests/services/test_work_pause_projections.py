"""Every saved-work read reports the same current stocktake pause."""
import uuid

import pytest

from app import models
from app.schemas.stock_request import StockRequestResponse
from app.services.io_persist import _batch_to_payload
from app.services.work_drafts import get_work_draft, list_work_drafts
from tests.routers.test_work_drafts import drafts  # noqa: F401
from tests.services.test_io_draft_reservations import owner  # noqa: F401


@pytest.fixture
def paused_work(db_session, drafts, owner):
    """A required cell absent from census targets cannot be treated as applied."""
    batch, legacy, item = drafts
    legacy.operation_batch_id = None
    round_ = models.StocktakeRound(title="Projection pause", epoch=1, started_by=owner.employee_id)
    db_session.add(round_)
    db_session.flush()
    for kind, work_id in (("io", batch.batch_id), ("stock_request", legacy.request_id)):
        db_session.add(models.StocktakeWorkPause(kind=kind, work_id=work_id, round_id=round_.round_id,
            required_cells=[{"item_id": str(item.item_id), "scope_key": "warehouse"}]))
    db_session.commit()
    return batch, legacy, round_


def _assert_blocked(payload: dict | None, round_id: uuid.UUID) -> None:
    """All projections carry the explicit fence rather than inferred reservation state."""
    assert payload is not None, "Saved work must expose the active pause"
    assert str(payload["round_id"]) == str(round_id)
    assert payload["state"] == "blocked"
    assert payload["missing_target_count"] == 1


def test_both_shared_list_and_detail_report_the_pause(db_session, paused_work) -> None:
    batch, legacy, round_ = paused_work
    rows = list_work_drafts(db_session)["items"]
    for row in rows:
        _assert_blocked(row.get("stocktake_pause"), round_.round_id)
    for kind, work_id in (("io", batch.batch_id), ("stock_request", legacy.request_id)):
        _assert_blocked(get_work_draft(db_session, kind, work_id).get("stocktake_pause"), round_.round_id)


def test_io_and_legacy_response_contracts_report_the_same_pause(db_session, paused_work) -> None:
    batch, legacy, round_ = paused_work
    _assert_blocked(_batch_to_payload(batch, db=db_session).get("stocktake_pause"), round_.round_id)
    body = StockRequestResponse.model_validate(legacy).model_dump(mode="json")
    _assert_blocked(body.get("stocktake_pause"), round_.round_id)


def test_work_reservation_details_report_pause(db_session, paused_work) -> None:
    from app.services.work_reservation_queries import batch_detail, list_admin_work_reservations

    batch, _, round_ = paused_work
    _assert_blocked(batch_detail(db_session, batch).get("stocktake_pause"), round_.round_id)
    _assert_blocked(list_admin_work_reservations(db_session)["items"][0].get("stocktake_pause"), round_.round_id)


@pytest.mark.parametrize("action", ["stocktake_paused", "stocktake_resumed"])
def test_admin_history_accepts_stocktake_lifecycle_events(db_session, paused_work, action) -> None:
    from app.schemas.work_reservations import AdminWorkReservationDetail
    from app.services.work_reservation_queries import batch_detail
    batch, _, _ = paused_work
    db_session.add(models.IoWorkReservationEvent(batch_id=batch.batch_id, action=action,
        from_revision=0, to_revision=1, actor_name="Census"))
    db_session.flush()
    response = AdminWorkReservationDetail.model_validate(batch_detail(db_session, batch, include_history=True))
    assert response.history[-1].action == action
