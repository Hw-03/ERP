"""services/inv_calc.py 단위 테스트 — 집계·동기화 + 음수 방어망(DB CHECK, R2-4).

R2-4("_sync_total 음수 무검증")는 실제로는 DB CHECK 제약 4중으로 이미 방어된다:
Inventory.quantity/warehouse_qty/pending ≥ 0, InventoryLocation.quantity ≥ 0.
따라서 _sync_total 의 입력(warehouse + Σlocation)은 항상 ≥ 0 이고, 음수를 set 해도
flush 시 ck_inventory_quantity_nonneg 가 막는다. 아래 테스트가 그 방어망을 고정한다.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import (
    DepartmentEnum,
    LocationStatusEnum,
    ShippingAllocation,
    ShippingRequest,
)
from app.services import inv_calc

D = Decimal


def test_sync_total_combines_warehouse_and_locations(make_item, make_location, db_session):
    item = make_item(warehouse_qty=D("10"))
    make_location(item.item_id, status=LocationStatusEnum.PRODUCTION, quantity=D("5"))
    make_location(item.item_id, status=LocationStatusEnum.DEFECTIVE, quantity=D("3"))
    inv = item.inventory
    inv_calc._sync_total(db_session, inv)
    assert inv.quantity == D("18")  # 10 + 5 + 3


def test_sync_total_zero_is_allowed(make_item, db_session):
    item = make_item(warehouse_qty=D("0"))
    inv = item.inventory
    inv_calc._sync_total(db_session, inv)
    assert inv.quantity == D("0")


def test_db_check_blocks_negative_location(make_item, make_location, db_session):
    """InventoryLocation.quantity 음수는 DB CHECK(ck_invloc_quantity_nonneg)가 차단."""
    item = make_item()
    with pytest.raises(IntegrityError):
        make_location(item.item_id, status=LocationStatusEnum.PRODUCTION, quantity=D("-1"))


def test_db_check_blocks_negative_warehouse(make_item):
    """Inventory.warehouse_qty 음수는 DB CHECK(ck_inventory_warehouse_nonneg)가 차단."""
    with pytest.raises(IntegrityError):
        make_item(warehouse_qty=D("-1"))


def test_production_total_sums_only_production(make_item, make_location, db_session):
    item = make_item()
    make_location(item.item_id, status=LocationStatusEnum.PRODUCTION, quantity=D("4"))
    make_location(item.item_id, status=LocationStatusEnum.DEFECTIVE, quantity=D("9"))
    assert inv_calc.production_total(db_session, item.item_id) == D("4")


def test_defective_total_sums_only_defective(make_item, make_location, db_session):
    item = make_item()
    make_location(item.item_id, status=LocationStatusEnum.DEFECTIVE, quantity=D("7"))
    make_location(item.item_id, status=LocationStatusEnum.PRODUCTION, quantity=D("2"))
    assert inv_calc.defective_total(db_session, item.item_id) == D("7")


def test_available_excludes_defective_and_pending(make_item, make_location, db_session):
    item = make_item(warehouse_qty=D("10"), pending=D("2"))
    production = make_location(
        item.item_id, status=LocationStatusEnum.PRODUCTION, quantity=D("5")
    )
    production.pending_quantity = D("3")
    defective = make_location(
        item.item_id, status=LocationStatusEnum.DEFECTIVE, quantity=D("100")
    )
    defective.pending_quantity = D("90")
    request = ShippingRequest(
        base_pf_item_id=item.item_id,
        request_quantity=1,
        requested_by_name="inv-calc-test",
    )
    db_session.add(request)
    db_session.flush()
    db_session.add_all(
        (
            ShippingAllocation(
                request_id=request.request_id,
                item_id=item.item_id,
                quantity=D("2"),
                department=None,
                status="RESERVED",
            ),
            ShippingAllocation(
                request_id=request.request_id,
                item_id=item.item_id,
                quantity=D("1"),
                department=DepartmentEnum.ASSEMBLY.value,
                status="RESERVED",
            ),
        )
    )
    db_session.flush()
    inv = item.inventory
    assert inv_calc.available(inv, db=db_session) == D("7")


def test_available_requires_db_for_canonical_reservations(make_item, db_session):
    item = make_item(warehouse_qty=D("8"), pending=D("3"))
    inv = item.inventory
    with pytest.raises(TypeError):
        inv_calc.available(inv)
