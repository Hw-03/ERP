"""인수인계 mutation의 작성자·수령자가 세션 actor에 고정되는 계약."""

from __future__ import annotations

import inspect
import uuid

import pytest

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    HandoverDoc,
    HandoverStatusEnum,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
)
from app.services import handover_actions
from app.services.pin_auth import hash_pin


@pytest.fixture()
def client(auth_client):
    """이 파일은 test-only compat override 없이 실제 쿠키 인증 경계를 검증한다."""
    return auth_client


def _employee(
    db_session,
    *,
    code: str,
    department: DepartmentEnum,
) -> Employee:
    employee = Employee(
        employee_code=code,
        name=f"인수인계 작업자 {code}",
        role="작업자",
        department=department,
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


def _submitted_doc(db_session, *, author: Employee) -> HandoverDoc:
    doc = HandoverDoc(
        handover_code="HO-VERIFIED-ACTOR",
        status=HandoverStatusEnum.SUBMITTED,
        author_employee_id=author.employee_id,
        author_name=author.name,
        from_department=DepartmentEnum.TUBE.value,
        to_department=DepartmentEnum.HIGH_VOLTAGE.value,
        title="행위자 경계 테스트",
    )
    db_session.add(doc)
    db_session.commit()
    return doc


def test_handover_receive_rejects_other_employee_pin_without_state_change(
    db_session,
    client,
) -> None:
    author = _employee(db_session, code="HO-AUTHOR-01", department=DepartmentEnum.TUBE)
    attacker = _employee(
        db_session,
        code="HO-ATTACKER-01",
        department=DepartmentEnum.ASSEMBLY,
    )
    victim = _employee(
        db_session,
        code="HO-VICTIM-01",
        department=DepartmentEnum.HIGH_VOLTAGE,
    )
    doc = _submitted_doc(db_session, author=author)
    _login(client, attacker)

    response = client.post(
        f"/api/handovers/{doc.handover_id}/receive",
        json={"actor_employee_id": str(victim.employee_id), "pin": "2468"},
    )

    assert response.status_code == 403, response.text
    assert response.json()["detail"]["code"] == "ACTOR_MISMATCH"
    db_session.expire_all()
    stored = db_session.get(HandoverDoc, doc.handover_id)
    assert stored is not None
    assert stored.status == HandoverStatusEnum.SUBMITTED
    assert stored.received_by_employee_id is None
    assert db_session.query(TransactionLog).count() == 0


def test_every_handover_author_claim_rejects_spoof_before_document_lookup(
    db_session,
    client,
) -> None:
    actor = _employee(
        db_session,
        code="HO-ACTOR-ALL",
        department=DepartmentEnum.TUBE,
    )
    victim = _employee(
        db_session,
        code="HO-VICTIM-ALL",
        department=DepartmentEnum.TUBE,
    )
    _login(client, actor)
    victim_id = str(victim.employee_id)
    handover_id = uuid.uuid4()
    cases = (
        (
            "POST",
            "/api/handovers",
            {
                "author_employee_id": victim_id,
                "to_department": DepartmentEnum.HIGH_VOLTAGE.value,
                "title": "스푸핑 거부",
                "lines": [],
            },
            None,
        ),
        (
            "PUT",
            "/api/handovers/draft",
            {
                "author_employee_id": victim_id,
                "to_department": DepartmentEnum.HIGH_VOLTAGE.value,
                "title": "스푸핑 거부",
                "lines": [],
            },
            None,
        ),
        (
            "POST",
            f"/api/handovers/{handover_id}/submit",
            {"author_employee_id": victim_id},
            None,
        ),
        (
            "DELETE",
            f"/api/handovers/draft/{handover_id}",
            None,
            {"author_employee_id": victim_id},
        ),
    )

    for method, path, payload, params in cases:
        response = client.request(method, path, json=payload, params=params)
        assert response.status_code == 403, (method, path, response.text)
        assert response.json()["detail"]["code"] == "ACTOR_MISMATCH"

    db_session.expire_all()
    assert db_session.query(HandoverDoc).count() == 0


def test_handover_receive_uses_verified_actor_with_actor_own_step_up_pin(
    db_session,
    client,
) -> None:
    author = _employee(db_session, code="HO-AUTHOR-02", department=DepartmentEnum.TUBE)
    receiver = _employee(
        db_session,
        code="HO-RECEIVER-02",
        department=DepartmentEnum.HIGH_VOLTAGE,
    )
    doc = _submitted_doc(db_session, author=author)
    _login(client, receiver)

    response = client.post(
        f"/api/handovers/{doc.handover_id}/receive",
        json={"actor_employee_id": str(receiver.employee_id), "pin": "2468"},
    )

    assert response.status_code == 200, response.text
    db_session.expire_all()
    stored = db_session.get(HandoverDoc, doc.handover_id)
    assert stored is not None
    assert stored.received_by_employee_id == receiver.employee_id
    assert stored.received_by_name == receiver.name


def test_handover_and_stock_request_pin_failures_share_login_rate_limit(
    db_session,
    client,
) -> None:
    author = _employee(db_session, code="HO-RATE-AUTHOR", department=DepartmentEnum.TUBE)
    actor = _employee(
        db_session,
        code="HO-RATE-ACTOR",
        department=DepartmentEnum.HIGH_VOLTAGE,
    )
    actor.warehouse_role = "primary"
    doc = _submitted_doc(db_session, author=author)
    stock_request = StockRequest(
        requester_employee_id=actor.employee_id,
        requester_name=actor.name,
        requester_department=actor.department,
        request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        status=StockRequestStatusEnum.SUBMITTED,
        requires_warehouse_approval=True,
        requires_department_approval=False,
    )
    db_session.add(stock_request)
    db_session.commit()
    _login(client, actor)

    for _ in range(5):
        response = client.post(
            f"/api/handovers/{doc.handover_id}/receive",
            json={"actor_employee_id": str(actor.employee_id), "pin": "9999"},
        )
        assert response.status_code == 403, response.text

    for _ in range(5):
        response = client.post(
            f"/api/stock-requests/{stock_request.request_id}/reject",
            json={
                "actor_employee_id": str(actor.employee_id),
                "pin": "9999",
                "reason": "rate limit",
            },
        )
        assert response.status_code == 403, response.text

    stock_blocked = client.post(
        f"/api/stock-requests/{stock_request.request_id}/reject",
        json={
            "actor_employee_id": str(actor.employee_id),
            "pin": "2468",
            "reason": "rate limit",
        },
    )
    handover_blocked = client.post(
        f"/api/handovers/{doc.handover_id}/receive",
        json={"actor_employee_id": str(actor.employee_id), "pin": "2468"},
    )
    login_blocked = client.post(
        "/api/operator-session",
        json={"employee_id": str(actor.employee_id), "pin": "2468"},
    )

    for blocked in (stock_blocked, handover_blocked, login_blocked):
        assert blocked.status_code == 429, blocked.text
        assert blocked.json()["detail"]["code"] == "TOO_MANY_REQUESTS"


def test_handover_delete_service_requires_explicit_server_actor() -> None:
    parameter = inspect.signature(
        handover_actions.delete_handover_draft
    ).parameters["author"]
    assert parameter.default is inspect.Parameter.empty
    assert parameter.kind is inspect.Parameter.KEYWORD_ONLY
