"""IO mutation이 body 직원 ID 대신 서버 세션 작업자를 정본으로 쓰는 계약."""

from __future__ import annotations

import inspect
import uuid

import pytest

from app.models import DepartmentEnum, Employee, EmployeeLevelEnum, IoBatch
from app.services import io_actions
from app.services.pin_auth import hash_pin


@pytest.fixture()
def client(auth_client):
    """이 파일은 test-only compat override 없이 실제 쿠키 인증 경계를 검증한다."""
    return auth_client


def _employee(db_session, *, code: str) -> Employee:
    employee = Employee(
        employee_code=code,
        name=f"IO 작업자 {code}",
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
        "work_type": "process",
        "sub_type": "produce",
        "to_department": DepartmentEnum.ASSEMBLY.value,
        "bundles": [],
    }


def test_io_draft_rejects_spoofed_requester_before_any_write(db_session, client) -> None:
    actor = _employee(db_session, code="IO-ACTOR-01")
    victim = _employee(db_session, code="IO-VICTIM-01")
    _login(client, actor)

    response = client.put("/api/io/draft", json=_draft_payload(victim))

    assert response.status_code == 403, response.text
    assert response.json()["detail"]["code"] == "ACTOR_MISMATCH"
    db_session.expire_all()
    assert db_session.query(IoBatch).count() == 0


def test_every_io_mutation_claim_rejects_spoof_before_domain_lookup(
    db_session,
    client,
) -> None:
    actor = _employee(db_session, code="IO-ACTOR-ALL")
    victim = _employee(db_session, code="IO-VICTIM-ALL")
    _login(client, actor)
    victim_id = str(victim.employee_id)
    random_id = str(uuid.uuid4())
    cases = (
        (
            "POST",
            "/api/io/item-conversion",
            {
                "requester_employee_id": victim_id,
                "source_item_id": random_id,
                "target_item_id": str(uuid.uuid4()),
                "quantity": 1,
            },
            None,
        ),
        (
            "POST",
            "/api/io/preview",
            {
                "requester_employee_id": victim_id,
                "work_type": "process",
                "sub_type": "produce",
                "targets": [{"item_id": random_id, "quantity": 1}],
            },
            None,
        ),
        ("PUT", "/api/io/draft", _draft_payload(victim), None),
        ("POST", "/api/io/submit", _draft_payload(victim), None),
        (
            "DELETE",
            f"/api/io/draft/{random_id}",
            None,
            {"requester_employee_id": victim_id},
        ),
        (
            "POST",
            f"/api/io/draft/{random_id}/submit",
            None,
            {"requester_employee_id": victim_id},
        ),
    )

    for method, path, payload, params in cases:
        response = client.request(method, path, json=payload, params=params)
        assert response.status_code == 403, (method, path, response.text)
        assert response.json()["detail"]["code"] == "ACTOR_MISMATCH"

    db_session.expire_all()
    assert db_session.query(IoBatch).count() == 0


def test_io_draft_persists_verified_session_actor(db_session, client) -> None:
    actor = _employee(db_session, code="IO-ACTOR-02")
    _login(client, actor)

    response = client.put("/api/io/draft", json=_draft_payload(actor))

    assert response.status_code == 200, response.text
    db_session.expire_all()
    batch = db_session.query(IoBatch).one()
    assert batch.requester_employee_id == actor.employee_id
    assert batch.requester_name == actor.name


def test_io_action_service_requires_explicit_server_actor() -> None:
    parameter = inspect.signature(io_actions.submit).parameters["requester"]
    assert parameter.default is inspect.Parameter.empty
    assert parameter.kind is inspect.Parameter.KEYWORD_ONLY
