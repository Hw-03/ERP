"""직원별 품목 표시 순서 커스터마이징 통합 테스트.

픽스처: conftest.py 의 client / db_session / make_item 사용.
"""

from __future__ import annotations

import uuid

import pytest

from app.models import Employee, EmployeeLevelEnum
from app.services.pin_auth import DEFAULT_PIN_HASH


# ---------------------------------------------------------------------------
# 헬퍼
# ---------------------------------------------------------------------------


def _make_employee(db_session, *, code: str = "EMP001") -> Employee:
    emp = Employee(
        employee_code=code,
        name="테스트직원",
        role="staff",
        department="기타",
        level=EmployeeLevelEnum.STAFF,
        warehouse_role="none",
        department_role="none",
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(emp)
    db_session.flush()
    return emp


# ---------------------------------------------------------------------------
# GET — 행 없을 때 빈 배열
# ---------------------------------------------------------------------------


def test_get_empty_when_no_rows(client, db_session):
    emp = _make_employee(db_session)
    db_session.commit()

    resp = client.get(f"/api/items/my-order?employee_id={emp.employee_id}")
    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# PUT 후 GET → display_order 오름차순 반환
# ---------------------------------------------------------------------------


def test_put_then_get_returns_ordered(client, db_session, make_item):
    emp = _make_employee(db_session)
    item_a = make_item(name="품목A", process_type_code="TR", model_symbol="3", serial_no=1)
    item_b = make_item(name="품목B", process_type_code="TR", model_symbol="3", serial_no=2)
    db_session.commit()

    put_resp = client.put(
        "/api/items/my-order",
        json={
            "employee_id": str(emp.employee_id),
            "items": [
                {"item_id": str(item_b.item_id), "display_order": 1},
                {"item_id": str(item_a.item_id), "display_order": 0},
            ],
        },
    )
    assert put_resp.status_code == 200
    assert put_resp.json() == {"ok": True}

    get_resp = client.get(f"/api/items/my-order?employee_id={emp.employee_id}")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert len(data) == 2
    assert data[0]["display_order"] == 0
    assert data[1]["display_order"] == 1


# ---------------------------------------------------------------------------
# 재 PUT → 덮어쓰기 확인
# ---------------------------------------------------------------------------


def test_put_overwrite(client, db_session, make_item):
    emp = _make_employee(db_session)
    item_a = make_item(name="품목A", process_type_code="TR", model_symbol="3", serial_no=1)
    item_b = make_item(name="품목B", process_type_code="TR", model_symbol="3", serial_no=2)
    db_session.commit()

    # 1차 저장
    client.put(
        "/api/items/my-order",
        json={
            "employee_id": str(emp.employee_id),
            "items": [
                {"item_id": str(item_a.item_id), "display_order": 0},
                {"item_id": str(item_b.item_id), "display_order": 1},
            ],
        },
    )

    # 2차: 순서 반전
    client.put(
        "/api/items/my-order",
        json={
            "employee_id": str(emp.employee_id),
            "items": [
                {"item_id": str(item_b.item_id), "display_order": 0},
                {"item_id": str(item_a.item_id), "display_order": 1},
            ],
        },
    )

    data = client.get(f"/api/items/my-order?employee_id={emp.employee_id}").json()
    assert len(data) == 2
    assert str(data[0]["item_id"]).replace("-", "") == item_b.item_id.hex


# ---------------------------------------------------------------------------
# 존재하지 않는 item_id 포함 PUT → skip 되고 200
# ---------------------------------------------------------------------------


def test_put_skips_nonexistent_item(client, db_session, make_item):
    emp = _make_employee(db_session)
    item_a = make_item(name="품목A", process_type_code="TR", model_symbol="3", serial_no=1)
    ghost_id = str(uuid.uuid4())
    db_session.commit()

    resp = client.put(
        "/api/items/my-order",
        json={
            "employee_id": str(emp.employee_id),
            "items": [
                {"item_id": str(item_a.item_id), "display_order": 0},
                {"item_id": ghost_id, "display_order": 1},
            ],
        },
    )
    assert resp.status_code == 200

    data = client.get(f"/api/items/my-order?employee_id={emp.employee_id}").json()
    assert len(data) == 1
    assert str(data[0]["item_id"]).replace("-", "") == item_a.item_id.hex


# ---------------------------------------------------------------------------
# DELETE 후 GET → 빈 배열
# ---------------------------------------------------------------------------


def test_delete_clears_all(client, db_session, make_item):
    emp = _make_employee(db_session)
    item_a = make_item(name="품목A", process_type_code="TR", model_symbol="3", serial_no=1)
    db_session.commit()

    client.put(
        "/api/items/my-order",
        json={
            "employee_id": str(emp.employee_id),
            "items": [{"item_id": str(item_a.item_id), "display_order": 0}],
        },
    )

    del_resp = client.delete(f"/api/items/my-order?employee_id={emp.employee_id}")
    assert del_resp.status_code == 200
    assert del_resp.json() == {"ok": True}

    data = client.get(f"/api/items/my-order?employee_id={emp.employee_id}").json()
    assert data == []


# ---------------------------------------------------------------------------
# 존재하지 않는 employee_id → GET/PUT/DELETE 404
# ---------------------------------------------------------------------------


def test_nonexistent_employee_get_404(client):
    fake_id = str(uuid.uuid4())
    resp = client.get(f"/api/items/my-order?employee_id={fake_id}")
    assert resp.status_code == 404


def test_nonexistent_employee_put_404(client):
    fake_id = str(uuid.uuid4())
    resp = client.put(
        "/api/items/my-order",
        json={"employee_id": fake_id, "items": []},
    )
    assert resp.status_code == 404


def test_nonexistent_employee_delete_404(client):
    fake_id = str(uuid.uuid4())
    resp = client.delete(f"/api/items/my-order?employee_id={fake_id}")
    assert resp.status_code == 404
