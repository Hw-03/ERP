"""IC-01 공통 mutation actor 경계."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from app.models import (
    ActivityAuditLog,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    OperatorSession,
)
from app.services.pin_auth import hash_pin


@pytest.fixture()
def client(auth_client):
    return auth_client


def _employee(db_session, *, code: str, pin: str = "2468") -> Employee:
    employee = Employee(
        employee_code=code,
        name=f"작업자 {code}",
        role="작업자",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        pin_hash=hash_pin(pin),
        pin_requires_change=False,
    )
    db_session.add(employee)
    db_session.commit()
    return employee


def _login(client, employee: Employee, pin: str = "2468") -> None:
    response = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": pin},
    )
    assert response.status_code == 200, response.text


def test_mutation_without_operator_session_fails_before_write(db_session, client) -> None:
    employee = _employee(db_session, code="ACTOR-01")

    response = client.put(
        f"/api/employees/{employee.employee_id}/theme",
        json={"theme": "dark"},
    )

    assert response.status_code == 401, response.text
    assert response.json()["detail"]["code"] == "AUTH_REQUIRED"
    db_session.expire_all()
    assert db_session.get(Employee, employee.employee_id).theme is None


@pytest.mark.parametrize(
    "stored_hash",
    [None, hash_pin("0000")],
    ids=["unset", "default-pin"],
)
def test_unset_or_default_pin_challenge_cannot_authorize_mutation(
    db_session,
    client,
    stored_hash: str | None,
) -> None:
    employee = Employee(
        employee_code=f"ACTOR-DEFAULT-{db_session.query(Employee).count()}",
        name="초기 PIN 작업자",
        role="작업자",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        pin_hash=stored_hash,
        pin_requires_change=True,
    )
    db_session.add(employee)
    db_session.commit()

    challenged = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "0000"},
    )
    assert challenged.status_code == 409

    mutation = client.put(
        f"/api/employees/{employee.employee_id}/theme",
        json={"theme": "dark"},
    )
    assert mutation.status_code == 401
    db_session.expire_all()
    assert db_session.get(Employee, employee.employee_id).theme is None


def test_verified_session_allows_mutation_and_ignores_no_browser_storage(
    db_session,
    client,
) -> None:
    employee = _employee(db_session, code="ACTOR-02")
    _login(client, employee)

    response = client.put(
        f"/api/employees/{employee.employee_id}/theme",
        json={"theme": "dark"},
    )

    assert response.status_code == 200, response.text
    db_session.expire_all()
    assert db_session.get(Employee, employee.employee_id).theme == "dark"


def test_forged_employee_code_header_is_rejected_before_write(db_session, client) -> None:
    actor = _employee(db_session, code="ACTOR-03")
    victim = _employee(db_session, code="VICTIM-03")
    _login(client, actor)

    response = client.put(
        f"/api/employees/{actor.employee_id}/theme",
        json={"theme": "dark"},
        headers={"X-MES-Employee-Code": victim.employee_code},
    )

    assert response.status_code == 403, response.text
    assert response.json()["detail"]["code"] == "ACTOR_MISMATCH"
    db_session.expire_all()
    assert db_session.get(Employee, actor.employee_id).theme is None
    failed_audit = (
        db_session.query(ActivityAuditLog)
        .filter(ActivityAuditLog.outcome == "failed")
        .order_by(ActivityAuditLog.occurred_at.desc())
        .first()
    )
    assert failed_audit is not None
    assert failed_audit.actor_employee_code == actor.employee_code


def test_revoked_session_cannot_mutate(db_session, client) -> None:
    employee = _employee(db_session, code="ACTOR-04")
    _login(client, employee)
    token = client.cookies.get("dexcowin_operator_session")
    assert token
    from app.services.operator_session import revoke_session

    revoke_session(db_session, token)
    db_session.commit()

    response = client.put(
        f"/api/employees/{employee.employee_id}/theme",
        json={"theme": "dark"},
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "SESSION_EXPIRED"
    db_session.expire_all()
    assert db_session.get(Employee, employee.employee_id).theme is None


def test_expired_session_cannot_mutate(db_session, client) -> None:
    employee = _employee(db_session, code="ACTOR-05")
    _login(client, employee)
    row = db_session.query(OperatorSession).filter_by(purpose="operator").one()
    row.expires_at = datetime.utcnow() - timedelta(seconds=1)
    db_session.commit()

    response = client.put(
        f"/api/employees/{employee.employee_id}/theme",
        json={"theme": "dark"},
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "SESSION_EXPIRED"
    db_session.expire_all()
    assert db_session.get(Employee, employee.employee_id).theme is None


def test_previous_boot_session_cannot_mutate_after_restart(db_session, client) -> None:
    employee = _employee(db_session, code="ACTOR-06")
    _login(client, employee)
    row = db_session.query(OperatorSession).filter_by(purpose="operator").one()
    row.boot_id = "previous-process-boot"
    db_session.commit()

    response = client.put(
        f"/api/employees/{employee.employee_id}/theme",
        json={"theme": "dark"},
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "SESSION_EXPIRED"
    db_session.expire_all()
    assert db_session.get(Employee, employee.employee_id).theme is None
