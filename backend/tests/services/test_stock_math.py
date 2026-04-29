"""services/stock_math.py 단위 테스트."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import DepartmentEnum, LocationStatusEnum
from app.services.stock_math import (
    StockFigures,
    bulk_compute,
    compute_for,
    figures_from_inventory,
)


D = Decimal


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


def test_bulk_compute_unknown_id_zero_filled(make_item, db_session):
    """Inventory 가 없는 ID 도 결과에 포함되며 모든 값 0."""
    import uuid as _uuid
    a = make_item(warehouse_qty=D("4"))
    unknown = _uuid.uuid4()
    result = bulk_compute(db_session, [a.item_id, unknown])
    assert result[a.item_id].warehouse_qty == D("4")
    assert result[unknown].warehouse_qty == D("0")
    assert result[unknown].total == D("0")


def test_figures_from_inventory_helper_with_none():
    """inv=None 도 안전 (모두 0)."""
    figs = figures_from_inventory(None)
    assert figs.total == D("0")
    assert figs.available == D("0")


def test_figures_from_inventory_with_values():
    """이미 외부에서 prod/defect 계산된 케이스."""
    class _Stub:
        warehouse_qty = D("8")
        pending_quantity = D("2")
    figs = figures_from_inventory(_Stub(), prod=D("3"), defect=D("1"))
    assert figs.warehouse_qty == D("8")
    assert figs.production_total == D("3")
    assert figs.defective_total == D("1")
    assert figs.total == D("12")
    assert figs.warehouse_available == D("6")  # 8 - 2
