"""직원 PIN 인증·변경·초기화 계약."""

from __future__ import annotations

from app.models import AdminAuditLog, DepartmentEnum, Employee, EmployeeLevelEnum
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin, verify_pin


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
        pin_requires_change=pin_hash in (None, DEFAULT_PIN_HASH),
    )
    db.add(emp)
    db.flush()
    return emp


def test_default_pin_is_0000(db_session, client):
    """기본 PIN은 작업 세션 대신 최초 변경 challenge만 발급한다."""
    emp = _make_employee(db_session, pin_hash=DEFAULT_PIN_HASH)
    db_session.commit()

    resp = client.post(f"/api/employees/{emp.employee_id}/verify-pin", json={"pin": "0000"})
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "PIN_CHANGE_REQUIRED"


def test_null_pin_hash_uses_default(db_session, client):
    """미설정 PIN도 작업 세션 없이 최초 변경 challenge로 제한한다."""
    emp = _make_employee(db_session, pin_hash=None)
    db_session.commit()

    resp = client.post(f"/api/employees/{emp.employee_id}/verify-pin", json={"pin": "0000"})
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "PIN_CHANGE_REQUIRED"


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
    """잘못된 PIN은 직원 존재 여부를 숨긴 동일한 401을 반환한다."""
    emp = _make_employee(db_session, pin_hash=DEFAULT_PIN_HASH)
    db_session.commit()

    resp = client.post(f"/api/employees/{emp.employee_id}/verify-pin", json={"pin": "9999"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "INVALID_CREDENTIALS"


def test_inactive_employee_blocked(db_session, client):
    """비활성 직원은 PIN이 맞아도 403을 반환한다."""
    emp = _make_employee(db_session, pin_hash=DEFAULT_PIN_HASH, is_active="false", code="E98")
    db_session.commit()

    resp = client.post(f"/api/employees/{emp.employee_id}/verify-pin", json={"pin": "0000"})
    assert resp.status_code == 403
    detail = resp.json()["detail"]
    assert "비활성" in detail["message"]


def test_employee_not_found(db_session, client):
    """존재하지 않는 직원도 잘못된 PIN과 동일한 401을 반환한다."""
    import uuid
    resp = client.post(f"/api/employees/{uuid.uuid4()}/verify-pin", json={"pin": "0000"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "INVALID_CREDENTIALS"


# ───────────────────────── reset-pin (W9-C) ─────────────────────────


def test_reset_employee_pin_success(db_session, client):
    """올바른 관리자 PIN(pin 필드)으로 reset → 204, 이후 기본 PIN 0000 검증 통과."""
    emp = _make_employee(db_session, pin_hash=hash_pin("9999"), code="E95")
    db_session.commit()

    resp = client.post(
        f"/api/employees/{emp.employee_id}/reset-pin",
        json={"pin": "0000"},
        headers={"X-Admin-Pin": "0000"},
    )
    assert resp.status_code == 204, resp.text

    # 초기화 후 기본 PIN은 작업 세션 없이 최초 변경 challenge만 허용
    verify = client.post(
        f"/api/employees/{emp.employee_id}/verify-pin",
        json={"pin": "0000"},
    )
    assert verify.status_code == 409
    assert verify.json()["detail"]["code"] == "PIN_CHANGE_REQUIRED"


def test_reset_employee_pin_wrong_admin_pin_403(db_session, client):
    """잘못된 관리자 PIN → 403 FORBIDDEN."""
    emp = _make_employee(db_session, pin_hash=DEFAULT_PIN_HASH, code="E96")
    db_session.commit()

    resp = client.post(
        f"/api/employees/{emp.employee_id}/reset-pin",
        json={"pin": "9999"},
    )
    assert resp.status_code == 403, resp.text


def test_reset_employee_pin_rejects_mismatched_body_pin_without_changes(db_session, client):
    """헤더 인증 후에도 body PIN이 틀리면 초기화와 감사 기록을 남기지 않는다."""
    original_pin = "2468"
    emp = _make_employee(db_session, pin_hash=hash_pin(original_pin), code="E97")
    employee_id = emp.employee_id
    db_session.commit()
    audit_count_before = db_session.query(AdminAuditLog).count()

    resp = client.post(
        f"/api/employees/{employee_id}/reset-pin",
        json={"pin": "9999"},
        headers={"X-Admin-Pin": "0000"},
    )

    db_session.expire_all()
    stored_employee = db_session.query(Employee).filter(Employee.employee_id == employee_id).one()
    audit_count_after = db_session.query(AdminAuditLog).count()
    assert (
        resp.status_code,
        verify_pin(stored_employee.pin_hash, original_pin),
        audit_count_after - audit_count_before,
    ) == (403, True, 0), resp.text
