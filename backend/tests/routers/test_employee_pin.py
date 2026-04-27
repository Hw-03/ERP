"""직원 PIN 검증 테스트.

작업자 식별용 PIN 로그인 — 실제 보안 인증이 아님.
"""

from __future__ import annotations

import pytest
from app.models import DepartmentEnum, Employee, EmployeeLevelEnum
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin


def _make_employee(db, *, name="홍길동", code="E99", pin_hash=None, is_active="true"):
    emp = Employee(
        employee_code=code,
        name=name,
        role="테스트/사원",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        display_order=99,
        is_active=is_active,
        pin_hash=pin_hash,
    )
    db.add(emp)
    db.flush()
    return emp


def test_default_pin_is_0000(db_session, client):
    """pin_hash가 설정된 직원은 0000으로 검증된다."""
    emp = _make_employee(db_session, pin_hash=DEFAULT_PIN_HASH)
    db_session.commit()

    resp = client.post(f"/api/employees/{emp.employee_id}/verify-pin", json={"pin": "0000"})
    assert resp.status_code == 200
    assert resp.json()["employee_id"] == str(emp.employee_id)


def test_null_pin_hash_uses_default(db_session, client):
    """pin_hash가 None이면 기본 PIN 0000으로 검증된다."""
    emp = _make_employee(db_session, pin_hash=None)
    db_session.commit()

    resp = client.post(f"/api/employees/{emp.employee_id}/verify-pin", json={"pin": "0000"})
    assert resp.status_code == 200


def test_verify_pin_success(db_session, client):
    """올바른 PIN은 200과 직원 정보를 반환한다."""
    emp = _make_employee(db_session, pin_hash=hash_pin("1234"))
    db_session.commit()

    resp = client.post(f"/api/employees/{emp.employee_id}/verify-pin", json={"pin": "1234"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "홍길동"
    assert "pin_hash" not in data  # PIN 해시는 응답에 포함되면 안 됨


def test_verify_pin_wrong_fails(db_session, client):
    """잘못된 PIN은 403을 반환한다."""
    emp = _make_employee(db_session, pin_hash=DEFAULT_PIN_HASH)
    db_session.commit()

    resp = client.post(f"/api/employees/{emp.employee_id}/verify-pin", json={"pin": "9999"})
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "FORBIDDEN"


def test_inactive_employee_blocked(db_session, client):
    """비활성 직원은 PIN이 맞아도 403을 반환한다."""
    emp = _make_employee(db_session, pin_hash=DEFAULT_PIN_HASH, is_active="false", code="E98")
    db_session.commit()

    resp = client.post(f"/api/employees/{emp.employee_id}/verify-pin", json={"pin": "0000"})
    assert resp.status_code == 403
    detail = resp.json()["detail"]
    assert "비활성" in detail["message"]


def test_employee_not_found(db_session, client):
    """존재하지 않는 직원은 404를 반환한다."""
    import uuid
    resp = client.post(f"/api/employees/{uuid.uuid4()}/verify-pin", json={"pin": "0000"})
    assert resp.status_code == 404
