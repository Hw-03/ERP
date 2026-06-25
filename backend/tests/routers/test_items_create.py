"""POST /api/items — 초기 재고 부서별 분배 테스트."""

from __future__ import annotations

import pytest

from app.models import ProductSymbol


ADMIN_HEADERS = {"X-Admin-Pin": "0000"}


@pytest.fixture()
def seed_symbol(db_session):
    """slot=1, symbol="9" ProductSymbol 시드. POST /api/items에 model_slots=[1] 사용 가능하게 함."""
    ps = ProductSymbol(slot=1, symbol="9", model_name="DX3000", is_finished_good=False, is_reserved=False)
    db_session.add(ps)
    db_session.commit()
    from app.utils.mes_code import refresh_symbol_cache
    refresh_symbol_cache(db_session)
    return ps


def _create_item(client, *, name="테스트품목", process_type_code="HR",
                 initial_quantity=None, initial_locations=None):
    payload = {
        "item_name": name,
        "process_type_code": process_type_code,
        "model_slots": [1],
    }
    if initial_quantity is not None:
        payload["initial_quantity"] = initial_quantity
    if initial_locations is not None:
        payload["initial_locations"] = initial_locations
    return client.post("/api/items", headers=ADMIN_HEADERS, json=payload)


def _get_item(client, item_id):
    return client.get(f"/api/items/{item_id}")


# ── 정상 케이스 ───────────────────────────────────────────────────────────────

def test_create_no_locations_all_warehouse(client, seed_symbol):
    """분배 없이 2000 → 전부 창고 (회귀)."""
    res = _create_item(client, initial_quantity=2000)
    assert res.status_code == 201, res.text
    item_id = res.json()["item_id"]

    detail = _get_item(client, item_id)
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["quantity"] == 2000
    assert body["warehouse_qty"] == 2000
    assert body["production_total"] == 0
    assert body["locations"] == []


def test_create_two_departments_split(client, seed_symbol):
    """2000 + [고압1000, 진공1000] → warehouse 0, PRODUCTION 2행, quantity 2000."""
    res = _create_item(
        client,
        initial_quantity=2000,
        initial_locations=[
            {"department": "고압", "quantity": 1000},
            {"department": "진공", "quantity": 1000},
        ],
    )
    assert res.status_code == 201, res.text
    item_id = res.json()["item_id"]

    body = _get_item(client, item_id).json()
    assert body["quantity"] == 2000
    assert body["warehouse_qty"] == 0
    assert body["production_total"] == 2000

    locs = body["locations"]
    assert len(locs) == 2
    by_dept = {l["department"]: l["quantity"] for l in locs}
    assert by_dept["고압"] == 1000
    assert by_dept["진공"] == 1000


def test_create_one_department_remainder_to_warehouse(client, seed_symbol):
    """2000 + [고압1000] → warehouse 1000, loc 1행."""
    res = _create_item(
        client,
        initial_quantity=2000,
        initial_locations=[{"department": "고압", "quantity": 1000}],
    )
    assert res.status_code == 201, res.text
    body = _get_item(client, res.json()["item_id"]).json()
    assert body["warehouse_qty"] == 1000
    assert body["production_total"] == 1000
    assert len(body["locations"]) == 1


def test_create_full_allocation_zero_warehouse(client, seed_symbol):
    """전량 배분 → warehouse 0."""
    res = _create_item(
        client,
        initial_quantity=500,
        initial_locations=[{"department": "조립", "quantity": 500}],
    )
    assert res.status_code == 201, res.text
    body = _get_item(client, res.json()["item_id"]).json()
    assert body["warehouse_qty"] == 0
    assert body["production_total"] == 500


# ── 오류 케이스 ──────────────────────────────────────────────────────────────

def test_create_sum_exceeds_initial_quantity_422(client, seed_symbol):
    """배분 합계 > 초기수량 → 422."""
    res = _create_item(
        client,
        initial_quantity=1000,
        initial_locations=[
            {"department": "고압", "quantity": 600},
            {"department": "진공", "quantity": 600},
        ],
    )
    assert res.status_code == 422, res.text


def test_create_invalid_department_422(client, seed_symbol):
    """유효하지 않은 부서명 → 422."""
    res = _create_item(
        client,
        initial_quantity=100,
        initial_locations=[{"department": "존재하지않는부서", "quantity": 50}],
    )
    assert res.status_code == 422, res.text


def test_create_warehouse_department_422(client, seed_symbol):
    """창고 부서를 명시하면 → 422."""
    res = _create_item(
        client,
        initial_quantity=100,
        initial_locations=[{"department": "창고", "quantity": 50}],
    )
    assert res.status_code == 422, res.text


def test_create_duplicate_department_422(client, seed_symbol):
    """같은 부서 중복 → 422."""
    res = _create_item(
        client,
        initial_quantity=200,
        initial_locations=[
            {"department": "고압", "quantity": 100},
            {"department": "고압", "quantity": 50},
        ],
    )
    assert res.status_code == 422, res.text


def test_create_zero_quantity_in_location_422(client, seed_symbol):
    """배분 수량 0 → 422 (pydantic gt=0)."""
    res = _create_item(
        client,
        initial_quantity=100,
        initial_locations=[{"department": "고압", "quantity": 0}],
    )
    assert res.status_code == 422, res.text
