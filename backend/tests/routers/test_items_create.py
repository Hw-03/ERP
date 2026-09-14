"""POST /api/items — 초기 재고 부서별 분배 테스트."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import text

from app.models import Item, ProductSymbol


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
                 initial_quantity=1, initial_locations=None, sales_review_required=None,
                 legacy_item_type="원자재", min_stock=0, model_slots=[1]):
    payload = {
        "item_name": name,
        "process_type_code": process_type_code,
    }
    if model_slots is not None:
        payload["model_slots"] = model_slots
    if legacy_item_type is not None:
        payload["legacy_item_type"] = legacy_item_type
    if min_stock is not None:
        payload["min_stock"] = min_stock
    if initial_quantity is not None:
        payload["initial_quantity"] = initial_quantity
    if initial_locations is not None:
        payload["initial_locations"] = initial_locations
    if sales_review_required is not None:
        payload["sales_review_required"] = sales_review_required
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


def test_create_zero_initial_quantity_allows_item_creation(client, seed_symbol):
    """초기 재고가 0인 품목도 창고 재고 0으로 등록한다."""
    res = _create_item(client, name="Zero initial stock", initial_quantity=0)
    assert res.status_code == 201, res.text

    body = _get_item(client, res.json()["item_id"]).json()
    assert body["quantity"] == 0
    assert body["warehouse_qty"] == 0
    assert body["locations"] == []


def test_create_item_allows_optional_material_classification_and_minimum_stock(client, seed_symbol):
    missing_material_type = _create_item(client, name="자재분류 없음", legacy_item_type=None)
    assert missing_material_type.status_code == 201, missing_material_type.text

    missing_min_stock = _create_item(client, name="안전재고 없음", min_stock=None)
    assert missing_min_stock.status_code == 201, missing_min_stock.text

    missing_product = _create_item(client, name="사용 제품 없음", model_slots=None)
    assert missing_product.status_code == 422

    missing_initial_stock = _create_item(client, name="초기 재고 없음", initial_quantity=None)
    assert missing_initial_stock.status_code == 422


def test_create_item_rejects_negative_min_stock(client, seed_symbol):
    response = _create_item(client, name="음수 안전재고", min_stock=-1)

    assert response.status_code == 422, response.text


def test_create_item_preserves_explicit_sales_review_and_defaults_af_to_required(client, seed_symbol):
    flagged = _create_item(client, name="Sales review", sales_review_required=True)
    assert flagged.status_code == 201, flagged.text
    assert _get_item(client, flagged.json()["item_id"]).json()["sales_review_required"] is True

    defaulted_af = _create_item(client, name="AF default", process_type_code="AF")
    assert defaulted_af.status_code == 201, defaulted_af.text
    assert _get_item(client, defaulted_af.json()["item_id"]).json()["sales_review_required"] is True

    cleared_af = _create_item(
        client,
        name="AF explicit clear",
        process_type_code="AF",
        sales_review_required=False,
    )
    assert cleared_af.status_code == 201, cleared_af.text
    assert _get_item(client, cleared_af.json()["item_id"]).json()["sales_review_required"] is False

    defaulted_non_af = _create_item(client, name="Non-AF default")
    assert defaulted_non_af.status_code == 201, defaulted_non_af.text
    assert _get_item(client, defaulted_non_af.json()["item_id"]).json()["sales_review_required"] is False


def test_create_item_round_trips_procurement_master_fields(client, seed_symbol):
    response = client.post(
        "/api/items",
        headers=ADMIN_HEADERS,
        json={
            "item_name": "구매 마스터 품목",
            "process_type_code": "HR",
            "model_slots": [1],
            "initial_quantity": 0,
            "supplier": "DEX Supplier",
            "min_stock": 12,
            "supplier_item_code": "SUP-ITEM-001",
            "standard_purchase_price": "1234.50",
            "purchase_price_effective_date": "2026-09-02",
            "procurement_lead_time_days": 14,
            "minimum_order_quantity": 5,
            "reorder_point": 9,
            "purchase_memo": "첫 거래는 현금 결제",
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["supplier"] == "DEX Supplier"
    assert body["min_stock"] == 12
    assert body["supplier_item_code"] == "SUP-ITEM-001"
    assert body["standard_purchase_price"] == "1234.50"
    assert body["purchase_price_effective_date"] == "2026-09-02"
    assert body["procurement_lead_time_days"] == 14
    assert body["minimum_order_quantity"] == 5
    assert body["reorder_point"] == 9
    assert body["purchase_memo"] == "첫 거래는 현금 결제"


def test_create_item_preserves_max_purchase_price_through_api_and_orm(client, db_session, seed_symbol):
    price = "9999999999999999.99"
    response = client.post(
        "/api/items",
        headers=ADMIN_HEADERS,
        json={
            "item_name": "최대 구매단가",
            "process_type_code": "HR",
            "model_slots": [1],
            "initial_quantity": 0,
            "standard_purchase_price": price,
        },
    )

    assert response.status_code == 201, response.text
    item_id = response.json()["item_id"]
    raw_value, raw_type = db_session.execute(
        text(
            "SELECT standard_purchase_price, typeof(standard_purchase_price) "
            "FROM items WHERE item_id = :item_id"
        ),
        {"item_id": item_id.replace("-", "")},
    ).one()
    assert (raw_value, raw_type) == (999999999999999999, "integer")
    assert response.json()["standard_purchase_price"] == price

    db_session.expire_all()
    stored = db_session.query(Item).filter(Item.item_id == item_id).one()
    assert stored.standard_purchase_price == Decimal(price)

    reread = _get_item(client, item_id)
    assert reread.status_code == 200, reread.text
    assert reread.json()["standard_purchase_price"] == price


def test_create_item_omits_procurement_master_fields_as_null(client, seed_symbol):
    response = _create_item(client, name="구매 마스터 미입력")

    assert response.status_code == 201, response.text
    body = response.json()
    for field in (
        "supplier_item_code",
        "standard_purchase_price",
        "purchase_price_effective_date",
        "procurement_lead_time_days",
        "minimum_order_quantity",
        "reorder_point",
        "purchase_memo",
    ):
        assert body[field] is None


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("standard_purchase_price", "-0.01"),
        ("procurement_lead_time_days", -1),
        ("minimum_order_quantity", 0),
        ("reorder_point", -1),
        ("purchase_price_effective_date", "2026-99-99"),
        ("supplier_item_code", "X" * 101),
        ("purchase_memo", "X" * 1001),
    ],
)
def test_create_item_rejects_invalid_procurement_master_fields(client, seed_symbol, field, value):
    response = client.post(
        "/api/items",
        headers=ADMIN_HEADERS,
        json={
            "item_name": f"구매 검증 {field}",
            "process_type_code": "HR",
            "model_slots": [1],
            "initial_quantity": 0,
            field: value,
        },
    )

    assert response.status_code == 422, response.text


def test_create_item_places_new_process_code_in_common_display_order(client, seed_symbol):
    for name, code in [
        ("tube-finished", "TF"),
        ("high-voltage-raw", "HR"),
        ("tube-raw", "TR"),
        ("tube-assembly", "TA"),
    ]:
        response = _create_item(client, name=name, process_type_code=code)
        assert response.status_code == 201, response.text

    listed = client.get("/api/items", params={"limit": 20})

    assert listed.status_code == 200, listed.text
    assert [item["process_type_code"] for item in listed.json()] == ["TR", "TA", "TF", "HR"]


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
