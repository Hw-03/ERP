"""services/stock_math.py 단위 테스트."""

from __future__ import annotations

from decimal import Decimal

from app.models import DepartmentEnum, LocationStatusEnum
from app.models import Inventory
from app.routers.inventory._shared import to_response
from app.services import stock_math
from app.services.stock_math import bulk_compute, compute_for


D = Decimal


def test_stock_math_does_not_expose_context_free_availability_helper():
    assert not hasattr(stock_math, "figures_from_inventory")


def test_compute_for_inventory_missing(db_session):
    """Inventory 행 없으면 모든 값 0."""
    import uuid as _uuid
    figs = compute_for(db_session, _uuid.uuid4())
    assert figs.warehouse_qty == D("0")
    assert figs.pending == D("0")
    assert figs.production_total == D("0")
    assert figs.defective_total == D("0")
    assert figs.total == D("0")
    assert figs.available == D("0")
    assert figs.warehouse_available == D("0")


def test_compute_for_warehouse_only(make_item, db_session):
    item = make_item(warehouse_qty=D("10"))
    figs = compute_for(db_session, item.item_id)
    assert figs.warehouse_qty == D("10")
    assert figs.production_total == D("0")
    assert figs.defective_total == D("0")
    assert figs.total == D("10")
    assert figs.available == D("10")
    assert figs.warehouse_available == D("10")


def test_compute_for_with_pending(make_item, db_session):
    item = make_item(warehouse_qty=D("10"), pending=D("3"))
    figs = compute_for(db_session, item.item_id)
    assert figs.pending == D("3")
    assert figs.available == D("7")  # wh - pending (no production)
    assert figs.warehouse_available == D("7")


def test_compute_for_with_locations(make_item, make_location, db_session):
    item = make_item(warehouse_qty=D("5"))
    make_location(item.item_id, status=LocationStatusEnum.PRODUCTION,
                  department=DepartmentEnum.ASSEMBLY, quantity=D("4"))
    make_location(item.item_id, status=LocationStatusEnum.DEFECTIVE,
                  department=DepartmentEnum.ASSEMBLY, quantity=D("2"))
    figs = compute_for(db_session, item.item_id)
    assert figs.warehouse_qty == D("5")
    assert figs.production_total == D("4")
    assert figs.defective_total == D("2")
    assert figs.total == D("11")
    assert figs.available == D("9")  # wh + prod - pending(0)


def test_compute_for_subtracts_only_production_location_pending(
    make_item, make_location, db_session
):
    item = make_item(warehouse_qty=D("10"), pending=D("2"))
    production = make_location(
        item.item_id,
        status=LocationStatusEnum.PRODUCTION,
        department=DepartmentEnum.ASSEMBLY,
        quantity=D("7"),
    )
    production.pending_quantity = D("3")
    defective = make_location(
        item.item_id,
        status=LocationStatusEnum.DEFECTIVE,
        department=DepartmentEnum.ASSEMBLY,
        quantity=D("5"),
    )
    defective.pending_quantity = D("4")
    db_session.flush()

    figs = compute_for(db_session, item.item_id)

    assert figs.pending == D("2")
    assert figs.department_pending == D("7")
    assert figs.production_pending == D("3")
    assert figs.available == D("12")  # (10 - 2) + (7 - 3)
    assert figs.total == D("22")


def test_warehouse_available_excludes_production(make_item, make_location, db_session):
    """backflush 검사용 warehouse_available 은 production 위치 무시."""
    item = make_item(warehouse_qty=D("5"), pending=D("1"))
    make_location(item.item_id, status=LocationStatusEnum.PRODUCTION,
                  quantity=D("100"))
    figs = compute_for(db_session, item.item_id)
    assert figs.warehouse_available == D("4")  # 5 - 1 (production 100 무시)


def test_total_invariant_holds(make_item, make_location, db_session):
    """total == warehouse + production + defective."""
    item = make_item(warehouse_qty=D("3"))
    make_location(item.item_id, status=LocationStatusEnum.PRODUCTION,
                  department=DepartmentEnum.HIGH_VOLTAGE, quantity=D("7"))
    make_location(item.item_id, status=LocationStatusEnum.DEFECTIVE,
                  department=DepartmentEnum.HIGH_VOLTAGE, quantity=D("1"))
    figs = compute_for(db_session, item.item_id)
    assert figs.total == figs.warehouse_qty + figs.production_total + figs.defective_total


def test_bulk_compute_empty_input(db_session):
    """빈 iterable 은 빈 dict."""
    assert bulk_compute(db_session, []) == {}


def test_bulk_compute_multiple_items(make_item, make_location, db_session):
    a = make_item(name="A", warehouse_qty=D("2"))
    b = make_item(name="B", warehouse_qty=D("5"), pending=D("1"))
    c = make_item(name="C", warehouse_qty=D("0"))
    make_location(b.item_id, status=LocationStatusEnum.PRODUCTION, quantity=D("3"))

    result = bulk_compute(db_session, [a.item_id, b.item_id, c.item_id])
    assert result[a.item_id].total == D("2")
    assert result[b.item_id].production_total == D("3")
    assert result[b.item_id].available == D("7")  # 5 + 3 - 1
    assert result[c.item_id].total == D("0")


def test_bulk_compute_aggregates_location_pending(make_item, make_location, db_session):
    item = make_item(warehouse_qty=D("2"))
    production = make_location(item.item_id, quantity=D("4"))
    production.pending_quantity = D("1")
    defective = make_location(
        item.item_id,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=D("3"),
    )
    defective.pending_quantity = D("2")
    db_session.flush()

    figures = bulk_compute(db_session, [item.item_id])[item.item_id]

    assert figures.department_pending == D("3")
    assert figures.available == D("5")


def test_inventory_response_exposes_department_and_location_pending(
    make_item, make_location, db_session
):
    item = make_item(warehouse_qty=D("6"), pending=D("1"))
    production = make_location(item.item_id, quantity=D("5"))
    production.pending_quantity = D("2")
    defective = make_location(
        item.item_id,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=D("3"),
    )
    defective.pending_quantity = D("1")
    db_session.flush()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()

    response = to_response(db_session, inv)

    assert response.pending_quantity == 1
    assert response.department_pending_quantity == 3
    assert response.warehouse_available_quantity == 5
    assert response.available_quantity == 8
    by_status = {location.status: location for location in response.locations}
    assert by_status[LocationStatusEnum.PRODUCTION].pending_quantity == 2
    assert by_status[LocationStatusEnum.PRODUCTION].available_quantity == 3
    assert by_status[LocationStatusEnum.DEFECTIVE].pending_quantity == 1
    assert by_status[LocationStatusEnum.DEFECTIVE].available_quantity == 2


def test_bulk_compute_unknown_id_zero_filled(make_item, db_session):
    """Inventory 가 없는 ID 도 결과에 포함되며 모든 값 0."""
    import uuid as _uuid
    a = make_item(warehouse_qty=D("4"))
    unknown = _uuid.uuid4()
    result = bulk_compute(db_session, [a.item_id, unknown])
    assert result[a.item_id].warehouse_qty == D("4")
    assert result[unknown].warehouse_qty == D("0")
    assert result[unknown].total == D("0")
