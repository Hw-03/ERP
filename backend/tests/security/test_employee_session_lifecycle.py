"""직원 credential·활성 상태 변경과 operator session 폐기의 원자 계약."""

from __future__ import annotations

import inspect
import uuid

import pytest
from fastapi.testclient import TestClient

from app.models import DepartmentEnum, Employee, EmployeeLevelEnum, OperatorSession, SystemSetting
from app.routers import employees as employees_router
from app.services.pin_auth import hash_pin, verify_pin


@pytest.fixture()
def client(auth_client):
    return auth_client


def _employee(
    db_session,
    *,
    code: str,
    pin: str = "2468",
    warehouse_role: str = "none",
) -> Employee:
    employee = Employee(
        employee_code=code,
        name=f"작업자 {code}",
        role="작업자",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        pin_hash=hash_pin(pin),
        pin_requires_change=False,
        warehouse_role=warehouse_role,
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


def test_admin_lifecycle_routes_lock_actor_and_target_in_one_verified_boundary() -> None:
    assert not hasattr(employees_router, "_get_employee_for_lifecycle_change")

    for route in (
        employees_router.update_employee,
        employees_router.delete_employee,
        employees_router.reset_employee_pin,
    ):
        assert getattr(route, "__dexcowin_lifecycle_target_employee__", False) is True
        source = inspect.getsource(route)
        assert source.count("_locked_lifecycle_target(") == 1
        assert "_get_employee_for_lifecycle_change(" not in source


def test_personal_preference_path_cannot_target_another_employee(db_session, client) -> None:
    actor = _employee(db_session, code="LIFE-01")
    victim = _employee(db_session, code="LIFE-02")
    _login(client, actor)

    response = client.put(
        f"/api/employees/{victim.employee_id}/theme",
        json={"theme": "dark"},
    )

    assert response.status_code == 403, response.text
    assert response.json()["detail"]["code"] == "ACTOR_MISMATCH"
    db_session.expire_all()
    assert db_session.get(Employee, victim.employee_id).theme is None


def test_pin_change_rejects_default_and_revokes_current_session(db_session, client) -> None:
    employee = _employee(db_session, code="LIFE-03")
    _login(client, employee)

    rejected = client.post(
        f"/api/employees/{employee.employee_id}/change-pin",
        json={"current_pin": "2468", "new_pin": "0000"},
    )
    assert rejected.status_code == 422, rejected.text

    changed = client.post(
        f"/api/employees/{employee.employee_id}/change-pin",
        json={"current_pin": "2468", "new_pin": "1357"},
    )

    assert changed.status_code == 204, changed.text
    assert changed.headers.get_list("set-cookie") == []
    db_session.expire_all()
    stored = db_session.get(Employee, employee.employee_id)
    assert stored is not None
    assert stored.pin_requires_change is False
    assert verify_pin(stored.pin_hash, "1357")
    assert all(row.revoked_at is not None for row in db_session.query(OperatorSession))
    assert client.get("/api/operator-session").status_code == 401


def test_personal_pin_change_is_rate_limited_by_actor_and_client_ip(
    db_session,
    client,
) -> None:
    employee = _employee(db_session, code="LIFE-PIN-RATE")
    _login(client, employee)
    path = f"/api/employees/{employee.employee_id}/change-pin"

    for _ in range(10):
        response = client.post(
            path,
            json={"current_pin": "9999", "new_pin": "1357"},
        )
        assert response.status_code == 403, response.text

    blocked = client.post(
        path,
        json={"current_pin": "2468", "new_pin": "1357"},
    )

    assert blocked.status_code == 429, blocked.text
    assert blocked.json()["detail"]["code"] == "TOO_MANY_REQUESTS"
    db_session.expire_all()
    assert verify_pin(db_session.get(Employee, employee.employee_id).pin_hash, "2468")


def _wrong_personal_step_up(client, employee: Employee, attempt: int) -> int:
    """서로 다른 거래/창고 endpoint를 번갈아 호출한다."""
    if attempt % 2:
        response = client.post(
            "/api/warehouse-map/angles",
            json={"label": f"rate-{attempt}", "rows": 1, "layers": 1, "jaris_per_cell": 1},
            headers={
                "X-Employee-Code": employee.employee_code,
                "X-Operator-Pin": "9999",
            },
        )
    else:
        response = client.post(
            f"/api/inventory/transactions/{uuid.uuid4()}/meta-edit",
            json={
                "notes": "rate-limit",
                "reason": "rate-limit",
                "edited_by_employee_id": str(employee.employee_id),
                "edited_by_pin": "9999",
            },
        )
    return response.status_code


def test_personal_step_up_failures_share_actor_ip_key_across_routes(
    db_session,
    client,
) -> None:
    employee = _employee(
        db_session,
        code="LIFE-STEP-RATE",
        warehouse_role="primary",
    )
    _login(client, employee)

    for attempt in range(10):
        assert _wrong_personal_step_up(client, employee, attempt) == 403

    blocked = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
    )
    assert blocked.status_code == 429, blocked.text
    assert blocked.json()["detail"]["code"] == "TOO_MANY_REQUESTS"


def test_personal_step_up_success_resets_shared_actor_ip_key(
    db_session,
    client,
) -> None:
    employee = _employee(
        db_session,
        code="LIFE-STEP-RESET",
        warehouse_role="primary",
    )
    _login(client, employee)

    for attempt in range(5):
        assert _wrong_personal_step_up(client, employee, attempt) == 403

    # PIN 인증 성공 후 존재하지 않는 거래로 404가 나더라도 credential 실패 이력은 reset된다.
    reset = client.post(
        f"/api/inventory/transactions/{uuid.uuid4()}/meta-edit",
        json={
            "notes": "rate-limit",
            "reason": "rate-limit",
            "edited_by_employee_id": str(employee.employee_id),
            "edited_by_pin": "2468",
        },
    )
    assert reset.status_code == 404, reset.text

    for attempt in range(10):
        assert _wrong_personal_step_up(client, employee, attempt) == 403

    assert client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
    ).status_code == 429


def test_admin_reset_sets_change_required_and_revokes_only_target_sessions(
    db_session,
    client,
) -> None:
    victim = _employee(db_session, code="LIFE-04")
    victim_client = TestClient(client.app)
    try:
        _login(victim_client, victim)
    finally:
        victim_client.close()
    victim_session_id = db_session.query(OperatorSession).one().session_id
    actor = _employee(db_session, code="LIFE-05")
    _login(client, actor)
    actor_session_id = (
        db_session.query(OperatorSession)
        .filter(OperatorSession.employee_id == actor.employee_id)
        .one()
        .session_id
    )
    db_session.add(SystemSetting(setting_key="admin_pin", setting_value=hash_pin("0000")))
    db_session.commit()

    response = client.post(
        f"/api/employees/{victim.employee_id}/reset-pin",
        json={"pin": "0000"},
        headers={"X-Admin-Pin": "0000"},
    )

    assert response.status_code == 204, response.text
    db_session.expire_all()
    stored = db_session.get(Employee, victim.employee_id)
    assert stored is not None
    assert stored.pin_requires_change is True
    assert verify_pin(stored.pin_hash, "0000")
    assert db_session.get(OperatorSession, victim_session_id).revoked_at is not None
    assert db_session.get(OperatorSession, actor_session_id).revoked_at is None


def test_deactivation_revokes_target_sessions_in_same_write(db_session, client) -> None:
    victim = _employee(db_session, code="LIFE-06")
    victim_client = TestClient(client.app)
    try:
        _login(victim_client, victim)
    finally:
        victim_client.close()
    victim_session_id = db_session.query(OperatorSession).one().session_id
    actor = _employee(db_session, code="LIFE-07")
    _login(client, actor)
    db_session.add(SystemSetting(setting_key="admin_pin", setting_value=hash_pin("0000")))
    db_session.commit()

    response = client.put(
        f"/api/employees/{victim.employee_id}",
        json={"is_active": False},
        headers={"X-Admin-Pin": "0000"},
    )

    assert response.status_code == 200, response.text
    db_session.expire_all()
    assert db_session.get(Employee, victim.employee_id).is_active is False
    assert db_session.get(OperatorSession, victim_session_id).revoked_at is not None


def test_hard_delete_removes_target_sessions_and_old_cookie_cannot_restore(
    db_session,
    client,
) -> None:
    victim = _employee(db_session, code="LIFE-08")
    victim_client = TestClient(client.app)
    try:
        _login(victim_client, victim)
        victim_token = victim_client.cookies.get("dexcowin_operator_session")
    finally:
        victim_client.close()
    assert victim_token
    victim_session_id = db_session.query(OperatorSession).one().session_id
    actor = _employee(db_session, code="LIFE-09")
    _login(client, actor)
    db_session.add(SystemSetting(setting_key="admin_pin", setting_value=hash_pin("0000")))
    db_session.commit()

    response = client.delete(
        f"/api/employees/{victim.employee_id}",
        headers={"X-Admin-Pin": "0000"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"result": "deleted"}
    db_session.expire_all()
    assert db_session.get(Employee, victim.employee_id) is None
    assert db_session.get(OperatorSession, victim_session_id) is None

    client.cookies.clear()
    client.cookies.set("dexcowin_operator_session", victim_token)
    assert client.get("/api/operator-session").status_code == 401
