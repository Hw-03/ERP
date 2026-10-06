"""POST /api/items — 초기 재고 부서별 분배 테스트."""

from __future__ import annotations

from decimal import Decimal
from datetime import UTC, date, datetime, timedelta
from http.cookies import SimpleCookie
from zoneinfo import ZoneInfo

import pytest
from fastapi import Response
from sqlalchemy import text

from app.models import (
    Employee, Item, ProductSymbol, InventoryOperation, TransactionLog,
    WeeklyInventorySnapshot,
)
from app.services.weekly_report_contract import classify_inventory_activity
from app.services.weekly_report_contract import build_verified_weekly_report
from app.services.f704_02_ledger import collect_entries
from app.services.f705_02_production_log import collect_daily_quantities
from app.services.inventory_operation_cancellation import preview_cancellation, cancel_operation
from app.services.inventory_integrity import diagnose_inventory_integrity
from app.services.audit_actor_session import AUDIT_ACTOR_COOKIE, set_audit_actor_cookie
from app.utils.mes_code import refresh_symbol_cache


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


def test_multichar_model_survives_list_detail_and_flag_update(client, db_session):
    db_session.add(ProductSymbol(slot=1, symbol="QF1", model_name="QA", is_reserved=False))
    db_session.commit()
    refresh_symbol_cache(db_session)
    created = _create_item(client, initial_quantity=0)
    assert created.status_code == 201, created.text
    item_id = created.json()["item_id"]
    assert created.json()["model_symbol"] == "QF1"
    listed = client.get("/api/items")
    detail = client.get(f"/api/items/{item_id}")
    updated = client.put(
        f"/api/items/{item_id}", headers=ADMIN_HEADERS,
        json={"sales_review_required": True},
    )
    for response, body in [(listed, listed.json()[0]), (detail, detail.json()), (updated, updated.json())]:
        assert response.status_code == 200, response.text
        assert body["model_slots"] == [1]
        assert body["model_symbol"] == "QF1"


def test_item_write_rejects_duplicate_and_unregistered_model_slots(client, db_session):
    db_session.add(ProductSymbol(slot=1, symbol="QF1", model_name="QA", is_reserved=False))
    db_session.commit()
    refresh_symbol_cache(db_session)
    for slots in ([1, 1], [1, 99]):
        response = _create_item(client, name=f"invalid-{slots}", model_slots=slots, initial_quantity=0)
        assert response.status_code == 422, response.text


def test_item_write_rejects_model_prefix_longer_than_storage_column(client, db_session):
    db_session.add_all([
        ProductSymbol(slot=index, symbol=letter * 5, model_name=f"MODEL-{letter}", is_reserved=False)
        for index, letter in enumerate("ABCDE", start=1)
    ])
    db_session.commit()
    refresh_symbol_cache(db_session)
    created = _create_item(client, name="길이 내 모델", model_slots=[1, 2, 3, 4], initial_quantity=0)
    assert created.status_code == 201, created.text
    item_id = created.json()["item_id"]
    assert _create_item(client, name="과한 모델", model_slots=[1, 2, 3, 4, 5], initial_quantity=0).status_code == 422
    changed = client.put(f"/api/items/{item_id}", headers=ADMIN_HEADERS, json={"model_slots": [1, 2, 3, 4, 5]})
    assert changed.status_code == 422, changed.text
    assert _get_item(client, item_id).json()["model_slots"] == [1, 2, 3, 4]


def test_ambiguous_model_prefix_is_409_on_read_and_422_on_write(client, db_session):
    db_session.add_all([
        ProductSymbol(slot=1, symbol="A", model_name="A", is_reserved=False),
        ProductSymbol(slot=2, symbol="AB", model_name="AB", is_reserved=False),
        ProductSymbol(slot=3, symbol="B", model_name="B", is_reserved=False),
    ])
    db_session.commit()
    refresh_symbol_cache(db_session)
    assert _create_item(client, name="모호한 쓰기", model_slots=[2], initial_quantity=0).status_code == 422
    item = Item(item_name="기존 모호 코드", process_type_code="HR", model_symbol="AB", serial_no=1)
    db_session.add(item)
    db_session.commit()
    assert client.get(f"/api/items/{item.item_id}").status_code == 409
    assert client.get("/api/items").status_code == 409


def test_ambiguous_model_selection_is_rejected_on_update(client, db_session):
    db_session.add_all([
        ProductSymbol(slot=1, symbol="A", model_name="A", is_reserved=False),
        ProductSymbol(slot=2, symbol="AB", model_name="AB", is_reserved=False),
        ProductSymbol(slot=3, symbol="B", model_name="B", is_reserved=False),
    ])
    db_session.commit()
    refresh_symbol_cache(db_session)
    created = _create_item(client, name="수정 전 유일", model_slots=[1], initial_quantity=0)
    assert created.status_code == 201, created.text
    response = client.put(f"/api/items/{created.json()['item_id']}", headers=ADMIN_HEADERS, json={"model_slots": [2]})
    assert response.status_code == 422, response.text
    assert client.get(f"/api/items/{created.json()['item_id']}").json()["model_slots"] == [1]


def test_multichar_shared_item_survives_list_detail_and_flag_update(client, db_session):
    db_session.add_all([
        ProductSymbol(slot=1, symbol="QF1", model_name="QA", is_reserved=False),
        ProductSymbol(slot=2, symbol="Z", model_name="Z", is_reserved=False),
    ])
    db_session.commit()
    refresh_symbol_cache(db_session)
    created = _create_item(client, name="다글자 공용", model_slots=[1, 2], initial_quantity=0)
    assert created.status_code == 201, created.text
    item_id = created.json()["item_id"]
    listed = client.get("/api/items")
    detail = client.get(f"/api/items/{item_id}")
    updated = client.put(f"/api/items/{item_id}", headers=ADMIN_HEADERS, json={"bom_stock_exempt": True})
    for response, body in [(listed, listed.json()[0]), (detail, detail.json()), (updated, updated.json())]:
        assert response.status_code == 200, response.text
        assert body["model_symbol"] == "QF1Z"
        assert body["model_slots"] == [1, 2]


@pytest.mark.parametrize(("locations", "warehouse", "departments"), [
    ([], 12, {}),
    ([{"department": "고압", "quantity": 12}], 0, {"고압": 12}),
    ([{"department": "고압", "quantity": 3}, {"department": "진공", "quantity": 4}], 5, {"고압": 3, "진공": 4}),
])
def test_initial_stock_has_one_operation_and_one_receive_per_destination(
    client, db_session, seed_symbol, locations, warehouse, departments,
):
    created = _create_item(client, name=f"초기원장-{warehouse}-{len(locations)}", initial_quantity=12, initial_locations=locations)
    assert created.status_code == 201, created.text
    item_id = created.json()["item_id"]
    logs = db_session.query(TransactionLog).filter_by(item_id=item_id).all()
    assert len(logs) == (warehouse > 0) + len(departments)
    operation = db_session.query(InventoryOperation).one()
    assert {log.operation_id for log in logs} == {operation.operation_id}
    assert (operation.domain, operation.action, operation.display_label, operation.actor_name) == (
        "item", "initial_stock", "초기 재고 등록", "관리자",
    )
    assert all(log.created_at >= operation.effective_at and log.produced_by == operation.actor_name for log in logs)
    assert len({log.created_at for log in logs}) == len(logs)
    ordered = sorted(logs, key=lambda log: log.created_at)
    warehouse_running = department_running = 0
    for log in ordered:
        assert (log.warehouse_qty_before, log.department_qty_before) == (warehouse_running, department_running)
        if log.department == "창고":
            warehouse_running += log.quantity_change
        else:
            department_running += log.quantity_change
        assert (log.warehouse_qty_after, log.department_qty_after) == (warehouse_running, department_running)
    history = client.get("/api/inventory/transactions", params={"item_id": item_id})
    assert history.status_code == 200, history.text
    rows = history.json()
    assert len(rows) == len(logs)
    assert all(row["request_order_stock"]["status"] == "available" for row in rows)
    assert rows[0]["request_order_stock"]["warehouse_qty_after"] == warehouse
    assert rows[0]["request_order_stock"]["department_qty_after"] == sum(departments.values())
    assert all(log.transaction_type.value == "RECEIVE" and log.operation_role.value == "PRIMARY" for log in logs)
    assert all(log.quantity_change == sum(effect["delta"] for effect in log.inventory_effect) for log in logs)
    observed = {
        (effect["scope"], effect.get("department")): effect["delta"]
        for log in logs for effect in log.inventory_effect
    }
    expected = {("location", department): quantity for department, quantity in departments.items()}
    if warehouse:
        expected[("warehouse", None)] = warehouse
    assert observed == expected
    assert sum(classify_inventory_activity(log).receive_qty for log in logs) == 12
    assert sum(classify_inventory_activity(log).produce_qty for log in logs) == 0
    f704 = [entry for entry in collect_entries(db_session, db_session.query(InventoryOperation).one().effective_at.year)
            if entry.item_code == created.json()["mes_code"]]
    assert sum(entry.quantity for entry in f704) == warehouse
    assert all(entry.counterpart == "초기 재고 등록" or entry.remark == "초기 재고 등록" for entry in f704)
    body = _get_item(client, item_id).json()
    assert body["warehouse_qty"] == warehouse
    assert {row["department"]: row["quantity"] for row in body["locations"]} == departments
    assert diagnose_inventory_integrity(db_session).is_consistent


def test_initial_stock_uses_verified_audit_actor(client, db_session, seed_symbol):
    actor = Employee(employee_code="QA-ADMIN", name="검증된 관리자", role="관리자", department="창고")
    db_session.add(actor)
    db_session.commit()
    response = Response()
    set_audit_actor_cookie(response, actor.employee_code)
    cookie = SimpleCookie()
    cookie.load(response.headers["set-cookie"])
    client.cookies.set(AUDIT_ACTOR_COOKIE, cookie[AUDIT_ACTOR_COOKIE].value)

    created = _create_item(client, name="작업자 증빙", initial_quantity=12)
    assert created.status_code == 201, created.text
    operation = db_session.query(InventoryOperation).one()
    log = db_session.query(TransactionLog).one()
    assert (operation.actor_name, operation.actor_employee_id) == (actor.name, actor.employee_id)
    assert (log.produced_by, log.producer_employee_id) == (actor.name, actor.employee_id)
    history = client.get("/api/inventory/transactions", params={"item_id": created.json()["item_id"]})
    assert history.status_code == 200, history.text
    assert history.json()[0]["executor_name"] == actor.name


def test_zero_initial_stock_has_no_operation_or_log(client, db_session, seed_symbol):
    created = _create_item(client, name="초기원장 없음", initial_quantity=0)
    assert created.status_code == 201, created.text
    assert db_session.query(InventoryOperation).count() == 0
    assert db_session.query(TransactionLog).count() == 0


def test_initial_stock_cancellation_restores_all_destinations(client, db_session, seed_symbol):
    created = _create_item(client, name="초기 재고 취소", initial_quantity=12, initial_locations=[
        {"department": "고압", "quantity": 3}, {"department": "진공", "quantity": 4},
    ])
    assert created.status_code == 201, created.text
    operation = db_session.query(InventoryOperation).one()
    assert collect_daily_quantities(db_session, operation.effective_at.year) == {}
    actor = Employee(employee_code="E901", name="취소자", role="직원", department="창고", is_active="true")
    db_session.add(actor)
    db_session.commit()
    plan = preview_cancellation(db_session, operation.operation_id)
    assert plan.can_cancel, plan.blockers
    cancel_operation(
        db_session, operation_id=operation.operation_id, canceller=actor,
        reason="초기 재고 취소", plan_hash=plan.plan_hash,
    )
    db_session.commit()
    item_id = created.json()["item_id"]
    body = _get_item(client, item_id).json()
    assert body["quantity"] == 0
    assert body["warehouse_qty"] == 0
    assert body["production_total"] == 0


def test_initial_stock_is_valid_weekly_receive_not_production(client, db_session, seed_symbol):
    today = datetime.now(ZoneInfo("Asia/Seoul")).date()
    week_start = today - timedelta(days=today.weekday())
    db_session.add(WeeklyInventorySnapshot(
        week_end=week_start - timedelta(days=1), as_of_utc=datetime.utcnow(),
        capture_source="test", basis_version=2, item_count=0, total_quantity=0,
        normal_total_quantity=0, defective_total_quantity=0,
    ))
    db_session.commit()
    created = _create_item(client, name="주간 초기재고", process_type_code="PF", initial_quantity=12,
                           initial_locations=[{"department": "고압", "quantity": 3}])
    assert created.status_code == 201, created.text
    report = build_verified_weekly_report(
        db_session, week_start=week_start, week_end=week_start + timedelta(days=6), today=today,
    )
    assert report.validation.status == "verified", report.validation.failures
    row = next(row for group in report.groups for row in group.items if row.item_id == created.json()["item_id"])
    assert row.receive_qty == 12
    assert row.produce_qty == 0


def test_initial_stock_logs_stay_in_same_week_at_sunday_boundary(client, db_session, seed_symbol, monkeypatch):
    from importlib import import_module

    item_router = import_module("app.routers.items")
    boundary = datetime(2026, 10, 4, 14, 59, 59, 999999, tzinfo=UTC)

    class BoundaryDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return boundary if tz == UTC else boundary.astimezone(tz)

    monkeypatch.setattr(item_router, "datetime", BoundaryDatetime)
    db_session.add(WeeklyInventorySnapshot(
        week_end=date(2026, 9, 27), as_of_utc=datetime.utcnow(),
        capture_source="test", basis_version=2, item_count=0, total_quantity=0,
        normal_total_quantity=0, defective_total_quantity=0,
    ))
    db_session.commit()
    created = _create_item(client, name="주말 경계 초기재고", process_type_code="PF", initial_quantity=12,
                           initial_locations=[{"department": "고압", "quantity": 3}, {"department": "진공", "quantity": 4}])
    assert created.status_code == 201, created.text
    operation = db_session.query(InventoryOperation).one()
    logs = db_session.query(TransactionLog).filter_by(item_id=created.json()["item_id"]).all()
    assert operation.effective_at == datetime(2026, 10, 4, 14, 59, 59)
    assert len(logs) == 3
    assert all(log.created_at.replace(tzinfo=UTC).astimezone(ZoneInfo("Asia/Seoul")).date() == date(2026, 10, 4)
               for log in logs)
    report = build_verified_weekly_report(
        db_session, week_start=date(2026, 9, 28), week_end=date(2026, 10, 4), today=date(2026, 10, 4),
    )
    assert report.validation.status == "verified", report.validation.failures
    row = next(row for group in report.groups for row in group.items if row.item_id == created.json()["item_id"])
    assert row.receive_qty == 12
