"""StockRequest mutation의 requester/approver가 세션 actor에 고정되는 계약."""

from __future__ import annotations

import inspect
import uuid

import pytest

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    StockRequest,
)
from app.services import sr_draft
from app.services.pin_auth import hash_pin


@pytest.fixture()
def client(auth_client):
    """이 파일은 test-only compat override 없이 실제 쿠키 인증 경계를 검증한다."""
    return auth_client


def _employee(db_session, *, code: str) -> Employee:
    employee = Employee(
        employee_code=code,
        name=f"재고요청 작업자 {code}",
        role="작업자",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    db_session.add(employee)
    db_session.commit()
    return employee


def _login(client, employee: Employee) -> None:
    response = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
    )
    assert response.status_code == 200, response.text


def _draft_payload(employee: Employee) -> dict:
    return {
        "requester_employee_id": str(employee.employee_id),
        "request_type": "dept_internal",
        "lines": [],
    }


def test_stock_request_draft_rejects_spoofed_requester_before_any_write(
    db_session,
    client,
) -> None:
    actor = _employee(db_session, code="SR-ACTOR-01")
    victim = _employee(db_session, code="SR-VICTIM-01")
    _login(client, actor)

    response = client.put("/api/stock-requests/draft", json=_draft_payload(victim))

    assert response.status_code == 403, response.text
    assert response.json()["detail"]["code"] == "ACTOR_MISMATCH"
    db_session.expire_all()
    assert db_session.query(StockRequest).count() == 0


def test_every_stock_request_action_claim_rejects_spoof_before_request_lookup(
    db_session,
    client,
) -> None:
    actor = _employee(db_session, code="SR-ACTOR-ALL")
    victim = _employee(db_session, code="SR-VICTIM-ALL")
    _login(client, actor)
    request_id = uuid.uuid4()
    victim_id = str(victim.employee_id)

    for suffix in (
        "approve",
        "reject",
        "department-approve",
        "department-reject",
        "cancel",
        "revert-to-draft",
    ):
        response = client.post(
            f"/api/stock-requests/{request_id}/{suffix}",
            json={
                "actor_employee_id": victim_id,
                "pin": "2468",
                "reason": "스푸핑 거부 테스트",
            },
        )
        assert response.status_code == 403, (suffix, response.text)
        assert response.json()["detail"]["code"] == "ACTOR_MISMATCH"

    submitted = client.post(
        f"/api/stock-requests/{request_id}/submit",
        json={"requester_employee_id": victim_id},
    )
    deleted = client.delete(
        f"/api/stock-requests/draft/{request_id}",
        params={"requester_employee_id": victim_id},
    )
    for response in (submitted, deleted):
        assert response.status_code == 403, response.text
        assert response.json()["detail"]["code"] == "ACTOR_MISMATCH"

    db_session.expire_all()
    assert db_session.query(StockRequest).count() == 0


def test_stock_request_draft_persists_verified_session_actor(db_session, client) -> None:
    actor = _employee(db_session, code="SR-ACTOR-02")
    _login(client, actor)

    response = client.put("/api/stock-requests/draft", json=_draft_payload(actor))

    assert response.status_code == 200, response.text
    db_session.expire_all()
    request = db_session.query(StockRequest).one()
    assert request.requester_employee_id == actor.employee_id
    assert request.requester_name == actor.name


def test_stock_request_draft_services_require_explicit_server_actor() -> None:
    for function in (sr_draft.delete_draft_request, sr_draft.submit_draft_request):
        parameter = inspect.signature(function).parameters["requester"]
        assert parameter.default is inspect.Parameter.empty
        assert parameter.kind is inspect.Parameter.KEYWORD_ONLY
