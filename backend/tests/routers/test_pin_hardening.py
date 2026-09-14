"""WS7 — PIN 하드닝 테스트.

1) 작업자 PIN 검증 실패-시도 레이트 리미터 (429, 성공 시 리셋).
2) 관리자 PIN 을 query 가 아닌 request body 로 전달하는 하위호환 경로.
"""

from __future__ import annotations

import pytest
from app.models import Department, DepartmentEnum, Employee, EmployeeLevelEnum
from app.services import rate_limit
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin


def _make_employee(db, *, name="홍길동", code="E77", pin_hash=DEFAULT_PIN_HASH):
    emp = Employee(
        employee_code=code,
        name=name,
        role="테스트/사원",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        display_order=77,
        is_active="true",
        pin_hash=pin_hash,
    )
    db.add(emp)
    db.flush()
    return emp


# ───────────────────────── rate limiter ─────────────────────────


def test_repeated_wrong_pin_eventually_429(db_session, client):
    """실패가 임계치(10) 에 도달하면 429 를 반환한다."""
    emp = _make_employee(db_session, pin_hash=hash_pin("1234"))
    db_session.commit()
    url = f"/api/employees/{emp.employee_id}/verify-pin"

    # 10 회 실패 → 403, 그 다음부터 429
    for _ in range(10):
        r = client.post(url, json={"pin": "0000"})
        assert r.status_code == 403, r.text

    r = client.post(url, json={"pin": "0000"})
    assert r.status_code == 429
    assert r.json()["detail"]["code"] == "TOO_MANY_REQUESTS"

    # 올바른 PIN 이어도 차단 상태면 429 (시도 전 검사)
    r = client.post(url, json={"pin": "1234"})
    assert r.status_code == 429


def test_success_resets_failure_counter(db_session, client):
    """성공하면 실패 카운터가 초기화되어 다시 시도 가능."""
    emp = _make_employee(db_session, pin_hash=hash_pin("1234"))
    db_session.commit()
    url = f"/api/employees/{emp.employee_id}/verify-pin"

    for _ in range(5):
        assert client.post(url, json={"pin": "0000"}).status_code == 403

    # 성공 → 리셋
    assert client.post(url, json={"pin": "1234"}).status_code == 200

    # 다시 9 회 실패해도 (리셋되었으므로) 아직 차단 안 됨
    for _ in range(9):
        assert client.post(url, json={"pin": "0000"}).status_code == 403
    # 10 회째 실패까지는 여전히 403
    assert client.post(url, json={"pin": "0000"}).status_code == 403
    # 11 회째 → 429
    assert client.post(url, json={"pin": "0000"}).status_code == 429


def test_few_wrong_attempts_do_not_trip(db_session, client):
    """소수 실패(테스트 일반 패턴)는 차단하지 않는다 — 테스트 안전성."""
    emp = _make_employee(db_session, pin_hash=DEFAULT_PIN_HASH)
    db_session.commit()
    url = f"/api/employees/{emp.employee_id}/verify-pin"

    assert client.post(url, json={"pin": "9999"}).status_code == 403
    assert client.post(url, json={"pin": "8888"}).status_code == 403
    # 정상 PIN 은 여전히 통과
    assert client.post(url, json={"pin": "0000"}).status_code == 200


def test_reset_all_clears_state():
    """reset_all() 은 모든 키 상태를 비운다 (fixture 훅)."""
    key = "verify_pin:unit-test"
    for _ in range(rate_limit.DEFAULT_MAX_FAILURES):
        rate_limit.record_failure(key)
    assert rate_limit.is_blocked(key) is True
    rate_limit.reset_all()
    assert rate_limit.is_blocked(key) is False


# ───────────────────────── body PIN (하위호환) ─────────────────────────


def _make_dept(db, name="삭제대상부서"):
    dept = Department(name=name, display_order=50, is_active=True)
    db.add(dept)
    db.flush()
    return dept


def test_delete_department_accepts_body_pin(db_session, client):
    """DELETE /departments/{id} 가 body 의 PIN 을 받는다 (query 없이)."""
    dept = _make_dept(db_session)
    db_session.commit()

    resp = client.request(
        "DELETE", f"/api/departments/{dept.id}", json={"pin": "0000"}
    )
    assert resp.status_code == 204, resp.text


def test_delete_department_query_pin_still_works(db_session, client):
    """하위호환: query string PIN 도 여전히 동작."""
    dept = _make_dept(db_session, name="레거시쿼리부서")
    db_session.commit()

    resp = client.delete(f"/api/departments/{dept.id}?pin=0000")
    assert resp.status_code == 204, resp.text


def test_delete_department_missing_pin_400(db_session, client):
    """body·query 어디에도 PIN 이 없으면 400."""
    dept = _make_dept(db_session, name="핀없음부서")
    db_session.commit()

    resp = client.request("DELETE", f"/api/departments/{dept.id}", json={})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "BAD_REQUEST"


def test_delete_department_wrong_body_pin_403(db_session, client):
    dept = _make_dept(db_session, name="잘못된핀부서")
    db_session.commit()

    resp = client.request(
        "DELETE", f"/api/departments/{dept.id}", json={"pin": "9999"}
    )
    assert resp.status_code == 403


def test_integrity_inventory_get_accepts_body_pin(client, make_item):
    """GET /settings/integrity/inventory 가 body PIN 을 받는다."""
    from decimal import Decimal

    make_item(name="정합성 body GET", warehouse_qty=Decimal("4"))
    resp = client.request(
        "GET", "/api/settings/integrity/inventory", json={"pin": "0000"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["checked"] == 1


def test_integrity_inventory_get_missing_pin_400(client):
    resp = client.request("GET", "/api/settings/integrity/inventory", json={})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "BAD_REQUEST"
