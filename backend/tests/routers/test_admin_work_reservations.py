"""PIN-gated cancellation preserves snapshots and trusts only signed audit sessions."""
import uuid
from decimal import Decimal

import pytest
from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.database import get_db
from app.models import Inventory, IoBatch, IoDraftReservation, IoWorkReservationEvent, SystemSetting, TransactionLog
from app.schemas.io import IoDraftUpsert
from app.services.io_draft import save_draft
from app.services.work_reservation_errors import WorkReservationError
from tests.services.test_io_draft_reservations import draft_payload, owner  # noqa: F401
from tests.concurrency.conftest import concurrent_engine, make_session  # noqa: F401


@pytest.fixture
def admin_client(db_session):
    from app.routers.admin_work_reservations import router
    app = FastAPI()
    app.include_router(router, prefix="/api/admin/work-reservations")
    app.dependency_overrides[get_db] = lambda: db_session
    @app.exception_handler(WorkReservationError)
    async def error_handler(request, exc):
        return JSONResponse(status_code=exc.status_code,
            content={"detail": {"code": exc.code, "message": str(exc), "extra": exc.extra}})
    with TestClient(app) as client:
        yield client


@pytest.fixture
def saved(db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(10))
    body = save_draft(db_session, IoDraftUpsert.model_validate(draft_payload(owner, item)))
    db_session.commit()
    return item, db_session.get(IoBatch, body["batch_id"])


def test_each_read_requires_pin_without_initializing_settings(admin_client, db_session, saved):
    _, batch = saved
    for path in ("", f"/{batch.batch_id}"):
        assert admin_client.get(f"/api/admin/work-reservations{path}").status_code == 400
        assert admin_client.get(f"/api/admin/work-reservations{path}", headers={"X-Admin-Pin": "bad"}).status_code == 403
        response = admin_client.get(f"/api/admin/work-reservations{path}", headers={"X-Admin-Pin": "0000"})
        assert response.status_code == 200, response.text
    assert db_session.query(SystemSetting).filter_by(setting_key="admin_pin").count() == 0
    assert batch.revision == 1 and db_session.query(IoDraftReservation).count() == 1


def test_admin_list_contract_has_only_work_filters_and_pagination(admin_client, saved) -> None:
    """Administrator work rows retain internal status without status classification controls."""
    _, batch = saved
    operation = admin_client.app.openapi()["paths"]["/api/admin/work-reservations"]["get"]
    query_parameters = {parameter["name"] for parameter in operation["parameters"] if parameter["in"] == "query"}
    assert query_parameters == {"search", "requester_department", "requester_employee_id", "skip", "limit", "pin"}

    response = admin_client.get("/api/admin/work-reservations",
        params={"reservation_status": "inactive", "view": "cancelled", "owner_active": False, "sort": "updated_desc"},
        headers={"X-Admin-Pin": "0000"})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert set(payload) == {"items", "total", "skip", "limit"}
    assert payload["total"] == 1
    assert payload["items"][0]["batch_id"] == str(batch.batch_id)
    assert payload["items"][0]["reservation_status"] == "reserved"


def test_public_contract_rejects_removed_reservation_values() -> None:
    """Outdated state and legacy issue values cannot enter current public DTOs."""
    from pydantic import TypeAdapter, ValidationError
    from app.schemas.work_reservations import WorkReservationIssue, WorkReservationStatus

    with pytest.raises(ValidationError):
        TypeAdapter(WorkReservationStatus).validate_python("needs_reservation")
    with pytest.raises(ValidationError):
        WorkReservationIssue(code="legacy_unprocessed", message="Obsolete", shortages=[])


def test_cancel_replays_only_same_revision_reason_and_ignores_forged_actor(admin_client, db_session, saved):
    item, batch = saved
    path = f"/api/admin/work-reservations/{batch.batch_id}/cancel"
    snapshot = batch.effective_plan
    headers = {"X-Admin-Pin": "0000", "X-Actor-Name": "forged", "X-Employee-Code": "WORK-OWNER"}
    payload = {"expected_revision": 1, "reason": "  정리 사유  "}
    assert admin_client.post(path, json=payload).status_code == 400
    assert admin_client.post(path, json=payload, headers={"X-Admin-Pin": "bad"}).status_code == 403
    for _ in range(2):
        response = admin_client.post(path, json=payload, headers=headers)
        assert response.status_code == 200, response.text
    db_session.refresh(batch)
    assert batch.status == "cancelled" and batch.revision == 2
    assert batch.effective_plan == snapshot and batch.reservation_status == "inactive"
    event = db_session.query(IoWorkReservationEvent).filter_by(action="admin_cancelled").one()
    assert event.reason == "정리 사유" and event.actor_employee_id is None and event.actor_name == "공유 관리자"
    assert db_session.query(IoDraftReservation).count() == 0
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert (inventory.warehouse_qty, inventory.pending_quantity) == (10, 0)
    assert db_session.query(TransactionLog).count() == 0
    assert admin_client.post(path, json={**payload, "reason": "다른 사유"}, headers=headers).status_code == 409


@pytest.mark.parametrize("body", [{"expected_revision": 1, "reason": "  "},
    {"expected_revision": 1, "reason": "x" * 1001}, {"expected_revision": True, "reason": "valid"},
    {"expected_revision": 1.0, "reason": "valid"}, {"expected_revision": -1, "reason": "valid"},
    {"reason": "valid"}])
def test_invalid_command_never_changes_reservation(admin_client, db_session, saved, body):
    _, batch = saved
    response = admin_client.post(f"/api/admin/work-reservations/{batch.batch_id}/cancel",
        json=body, headers={"X-Admin-Pin": "0000"})
    assert response.status_code == 422
    assert batch.revision == 1 and db_session.query(IoDraftReservation).count() == 1


@pytest.mark.parametrize("tab_employee_code,expected_actor", [
    (None, "ADMIN-ACTOR"), ("", "ADMIN-ACTOR"), ("   ", "ADMIN-ACTOR"),
    ("ADMIN-ACTOR", "ADMIN-ACTOR"), ("WORK-OWNER", None),
])
def test_signed_session_identifies_canceller_without_owner_requirement(
    admin_client, db_session, saved, owner, tab_employee_code, expected_actor,
):
    from app.models import Employee
    from app.services.audit_actor_session import AUDIT_ACTOR_COOKIE, set_audit_actor_cookie
    _, batch = saved
    actor = Employee(employee_code="ADMIN-ACTOR", name="다른 관리자", role="staff", department="기타", is_active=True)
    db_session.add(actor)
    db_session.commit()
    response = Response()
    set_audit_actor_cookie(response, actor.employee_code)
    token = response.headers["set-cookie"].split(";", 1)[0].split("=", 1)[1]
    admin_client.cookies.set(AUDIT_ACTOR_COOKIE, token)
    headers = {"X-Admin-Pin": "0000"}
    if tab_employee_code is not None:
        headers["X-MES-Employee-Code"] = tab_employee_code
    response = admin_client.post(f"/api/admin/work-reservations/{batch.batch_id}/cancel",
        json={"expected_revision": 1, "reason": "verified"}, headers=headers)
    assert response.status_code == 200, response.text
    event = db_session.query(IoWorkReservationEvent).filter_by(action="admin_cancelled").one()
    assert event.actor_employee_id == (actor.employee_id if expected_actor else None)
    assert event.actor_name == (actor.name if expected_actor else "공유 관리자")


@pytest.mark.parametrize("cookie", [None, "forged-cookie"])
def test_tab_employee_header_never_identifies_canceller_without_valid_cookie(
    admin_client, db_session, saved, owner, cookie,
):
    from app.services.audit_actor_session import AUDIT_ACTOR_COOKIE
    _, batch = saved
    if cookie:
        admin_client.cookies.set(AUDIT_ACTOR_COOKIE, cookie)
    response = admin_client.post(f"/api/admin/work-reservations/{batch.batch_id}/cancel",
        json={"expected_revision": 1, "reason": "unverified"},
        headers={"X-Admin-Pin": "0000", "X-MES-Employee-Code": owner.employee_code})
    assert response.status_code == 200, response.text
    event = db_session.query(IoWorkReservationEvent).filter_by(action="admin_cancelled").one()
    assert event.actor_employee_id is None and event.actor_name == "공유 관리자"


def test_event_failure_rolls_back_cancel_and_release(admin_client, db_session, saved, monkeypatch):
    from app.services import io_reservations
    item, batch = saved
    def fail(*args, **kwargs):
        raise RuntimeError("synthetic audit failure")
    monkeypatch.setattr(io_reservations, "record_event", fail)
    with pytest.raises(RuntimeError, match="synthetic"):
        admin_client.post(f"/api/admin/work-reservations/{batch.batch_id}/cancel",
            json={"expected_revision": 1, "reason": "rollback"}, headers={"X-Admin-Pin": "0000"})
    db_session.refresh(batch)
    assert batch.status == "draft" and batch.revision == 1
    assert db_session.query(IoDraftReservation).one().quantity == 3
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 3


def test_cancel_and_submit_compete_with_only_one_committed_transition(make_session):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from starlette.requests import Request
    from app.routers.settings import require_admin_readonly
    from app.services.io_actions import submit_existing_draft
    from app.services.work_reservation_admin import cancel_work_reservation
    from tests.concurrency.test_io_draft_reservations import setup_payload, run_save
    payload = setup_payload(make_session)
    batch_id = uuid.UUID(run_save(make_session, payload))
    barrier = Barrier(2)

    def execute(cancel):
        with make_session() as db:
            barrier.wait(timeout=10)
            try:
                if cancel:
                    require_admin_readonly(db, "0000")
                    cancel_work_reservation(db, batch_id=batch_id, expected_revision=1,
                        reason="race", request=Request({"type": "http", "headers": []}))
                    db.commit()
                else:
                    submit_existing_draft(db, batch_id=batch_id, expected_revision=1,
                        requester_employee_id=uuid.UUID(payload["requester_employee_id"]))
                return "success"
            except WorkReservationError as exc:
                db.rollback()
                return exc.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(execute, cancel) for cancel in (True, False)]
        results = [future.result() for future in futures]
    assert sorted(results) == ["WORK_REVISION_CONFLICT", "success"]
    with make_session() as db:
        batch = db.get(IoBatch, batch_id)
        assert batch.revision == 2 and batch.status != "draft"
        assert db.query(IoDraftReservation).count() == 0
        assert db.query(IoWorkReservationEvent).filter(IoWorkReservationEvent.from_revision == 1).count() == 1


def test_admin_cannot_change_legacy_shipping_link(admin_client, db_session, saved):
    from app.models import ShippingRequest
    item, batch = saved
    shipping = ShippingRequest(base_pf_item_id=item.item_id, request_quantity=1)
    db_session.add(shipping)
    db_session.flush()
    batch.shipping_request_id = shipping.request_id
    db_session.commit()
    response = admin_client.post(f"/api/admin/work-reservations/{batch.batch_id}/cancel",
        json={"expected_revision": 1, "reason": "blocked"}, headers={"X-Admin-Pin": "0000"})
    assert response.status_code == 409
    assert batch.revision == 1 and batch.status == "draft"
    assert db_session.query(IoDraftReservation).count() == 1
