"""services/inv_transfer.py 회귀 그물 단위 테스트.

현재 동작을 고정하는 회귀 테스트. 서비스 코드는 수정하지 않는다.

검증 초점:
- transfer_to_production (창고 → 부서 PRODUCTION)
- transfer_to_warehouse (부서 PRODUCTION → 창고)
- transfer_between_departments (부서 ↔ 부서)
- consume_warehouse (창고 차감)
- receive_confirmed (입고)

불변식: 이동(transfer) 후 총량 불변 — warehouse + production + defective == Inventory.quantity.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import DepartmentEnum, Inventory, InventoryLocation, LocationStatusEnum
from app.services import inv_transfer as svc

D = Decimal
ASSEMBLY = DepartmentEnum.ASSEMBLY
TUBE = DepartmentEnum.TUBE


# ──────────────────────────── helpers ────────────────────────────

def _inv(db_session, item_id) -> Inventory:
    # flush(): 서비스가 in-memory 에만 반영한 quantity 변경을 DB 로 내보낸 뒤 동일 객체를 읽는다.
    # expire_all() 을 쓰면 아직 flush 되지 않은 quantity 동기화 값이 버려져 stale 값을 읽게 됨.
    db_session.flush()
    return db_session.query(Inventory).filter(Inventory.item_id == item_id).first()


def _loc_qty(db_session, item_id, dept, status=LocationStatusEnum.PRODUCTION) -> Decimal:
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == status,
        )
        .first()
    )
    return loc.quantity if loc else D("0")


def _production_total(db_session, item_id) -> Decimal:
    total = D("0")
    rows = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .all()
    )
    for r in rows:
        total += r.quantity or D("0")
    return total


def _defective_total(db_session, item_id) -> Decimal:
    total = D("0")
    rows = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
        )
        .all()
    )
    for r in rows:
        total += r.quantity or D("0")
    return total


def _assert_invariant(db_session, item_id) -> None:
    """창고 + 생산 + 불량 == Inventory.quantity (총량 불변식)."""
    inv = _inv(db_session, item_id)
    wh = inv.warehouse_qty or D("0")
    prod = _production_total(db_session, item_id)
    defect = _defective_total(db_session, item_id)
    assert wh + prod + defect == inv.quantity


# ──────────────────────────── transfer_to_production ────────────────────────────

def test_transfer_to_production_basic(make_item, db_session):
    """창고 → 부서: 창고 감소, 부서 생산 증가, 총량 불변."""
    item = make_item(name="X", warehouse_qty=D("10"))

    svc.transfer_to_production(db_session, item.item_id, D("4"), ASSEMBLY)

    inv = _inv(db_session, item.item_id)
    assert inv.warehouse_qty == D("6")
    assert _loc_qty(db_session, item.item_id, ASSEMBLY) == D("4")
    assert inv.quantity == D("10")  # 총량 불변
    _assert_invariant(db_session, item.item_id)


def test_transfer_to_production_full(make_item, db_session):
    """창고 전량 이동 — 경계: 정확히 가용량만큼."""
    item = make_item(name="X", warehouse_qty=D("5"))

    svc.transfer_to_production(db_session, item.item_id, D("5"), ASSEMBLY)

    inv = _inv(db_session, item.item_id)
    assert inv.warehouse_qty == D("0")
    assert _loc_qty(db_session, item.item_id, ASSEMBLY) == D("5")
    assert inv.quantity == D("5")
    _assert_invariant(db_session, item.item_id)


def test_transfer_to_production_insufficient_raises(make_item, db_session):
    """창고 가용 재고 부족 → ValueError, 재고 변동 없음."""
    item = make_item(name="X", warehouse_qty=D("3"))

    with pytest.raises(ValueError, match="가용 재고 부족"):
        svc.transfer_to_production(db_session, item.item_id, D("5"), ASSEMBLY)

    inv = _inv(db_session, item.item_id)
    assert inv.warehouse_qty == D("3")
    assert _loc_qty(db_session, item.item_id, ASSEMBLY) == D("0")


def test_transfer_to_production_pending_reduces_available(make_item, db_session):
    """예약중(pending) 수량은 가용에서 제외 — warehouse 10, pending 8 이면 3 이동 불가."""
    item = make_item(name="X", warehouse_qty=D("10"), pending=D("8"))

    # 가용 = 10 - 8 = 2 이므로 3 이동 불가
    with pytest.raises(ValueError, match="가용 재고 부족"):
        svc.transfer_to_production(db_session, item.item_id, D("3"), ASSEMBLY)

    # 가용 2 이내(2)는 가능
    svc.transfer_to_production(db_session, item.item_id, D("2"), ASSEMBLY)
    inv = _inv(db_session, item.item_id)
    assert inv.warehouse_qty == D("8")
    assert _loc_qty(db_session, item.item_id, ASSEMBLY) == D("2")
    assert inv.quantity == D("10")


def test_transfer_to_production_zero_qty_raises(make_item, db_session):
    item = make_item(name="X", warehouse_qty=D("10"))
    with pytest.raises(ValueError, match="0보다 커야"):
        svc.transfer_to_production(db_session, item.item_id, D("0"), ASSEMBLY)


# ──────────────────────────── transfer_to_warehouse ────────────────────────────

def test_transfer_to_warehouse_basic(make_item, make_location, db_session):
    """부서 → 창고: 부서 생산 감소, 창고 증가, 총량 불변."""
    item = make_item(name="X", warehouse_qty=D("2"))
    make_location(item.item_id, department=ASSEMBLY, quantity=D("7"))
    # 총량 동기화 (warehouse 2 + prod 7 = 9)
    from app.services.inv_calc import _sync_total
    _sync_total(db_session, _inv(db_session, item.item_id))

    svc.transfer_to_warehouse(db_session, item.item_id, D("3"), ASSEMBLY)

    inv = _inv(db_session, item.item_id)
    assert inv.warehouse_qty == D("5")
    assert _loc_qty(db_session, item.item_id, ASSEMBLY) == D("4")
    assert inv.quantity == D("9")  # 총량 불변
    _assert_invariant(db_session, item.item_id)


def test_transfer_to_warehouse_insufficient_raises(make_item, make_location, db_session):
    """부서 생산 재고 부족 → ValueError, 변동 없음."""
    item = make_item(name="X", warehouse_qty=D("2"))
    make_location(item.item_id, department=ASSEMBLY, quantity=D("3"))

    with pytest.raises(ValueError, match="생산 재고 부족"):
        svc.transfer_to_warehouse(db_session, item.item_id, D("5"), ASSEMBLY)

    inv = _inv(db_session, item.item_id)
    assert inv.warehouse_qty == D("2")
    assert _loc_qty(db_session, item.item_id, ASSEMBLY) == D("3")


def test_transfer_to_warehouse_zero_qty_raises(make_item, db_session):
    item = make_item(name="X", warehouse_qty=D("0"))
    with pytest.raises(ValueError, match="0보다 커야"):
        svc.transfer_to_warehouse(db_session, item.item_id, D("0"), ASSEMBLY)


# ──────────────────────────── transfer_between_departments ────────────────────────────

def test_transfer_between_departments_basic(make_item, make_location, db_session):
    """부서 ↔ 부서: from 감소, to 증가, 창고/총량 불변."""
    item = make_item(name="X", warehouse_qty=D("1"))
    make_location(item.item_id, department=ASSEMBLY, quantity=D("8"))
    make_location(item.item_id, department=TUBE, quantity=D("2"))
    from app.services.inv_calc import _sync_total
    _sync_total(db_session, _inv(db_session, item.item_id))  # 총량 1+8+2 = 11

    svc.transfer_between_departments(db_session, item.item_id, D("5"), ASSEMBLY, TUBE)

    inv = _inv(db_session, item.item_id)
    assert _loc_qty(db_session, item.item_id, ASSEMBLY) == D("3")  # 8 - 5
    assert _loc_qty(db_session, item.item_id, TUBE) == D("7")      # 2 + 5
    assert inv.warehouse_qty == D("1")  # 창고 불변
    assert inv.quantity == D("11")      # 총량 불변
    _assert_invariant(db_session, item.item_id)


def test_transfer_between_departments_insufficient_raises(make_item, make_location, db_session):
    """from 부서 재고 부족 → ValueError, 변동 없음."""
    item = make_item(name="X", warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY, quantity=D("2"))
    make_location(item.item_id, department=TUBE, quantity=D("0"))

    with pytest.raises(ValueError, match="생산 재고 부족"):
        svc.transfer_between_departments(db_session, item.item_id, D("5"), ASSEMBLY, TUBE)

    assert _loc_qty(db_session, item.item_id, ASSEMBLY) == D("2")
    assert _loc_qty(db_session, item.item_id, TUBE) == D("0")


def test_transfer_between_departments_same_dept_raises(make_item, make_location, db_session):
    item = make_item(name="X", warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    with pytest.raises(ValueError, match="동일"):
        svc.transfer_between_departments(db_session, item.item_id, D("1"), ASSEMBLY, ASSEMBLY)


def test_transfer_between_departments_zero_qty_raises(make_item, db_session):
    item = make_item(name="X", warehouse_qty=D("0"))
    with pytest.raises(ValueError, match="0보다 커야"):
        svc.transfer_between_departments(db_session, item.item_id, D("0"), ASSEMBLY, TUBE)


# ──────────────────────────── consume_warehouse ────────────────────────────

def test_consume_warehouse_basic(make_item, db_session):
    """창고 차감: 총량 감소, qty_before 는 차감 전 총량."""
    item = make_item(name="X", warehouse_qty=D("10"))

    inv, qty_before = svc.consume_warehouse(db_session, item.item_id, D("4"))

    assert inv.warehouse_qty == D("6")
    assert inv.quantity == D("6")
    assert qty_before == D("10")  # 차감 전 총량


def test_consume_warehouse_insufficient_raises(make_item, db_session):
    item = make_item(name="X", warehouse_qty=D("3"))
    with pytest.raises(ValueError, match="창고 재고 부족"):
        svc.consume_warehouse(db_session, item.item_id, D("5"))

    inv = _inv(db_session, item.item_id)
    assert inv.warehouse_qty == D("3")


def test_consume_warehouse_zero_qty_raises(make_item, db_session):
    item = make_item(name="X", warehouse_qty=D("10"))
    with pytest.raises(ValueError, match="0보다 커야"):
        svc.consume_warehouse(db_session, item.item_id, D("0"))


# ──────────────────────────── receive_confirmed ────────────────────────────

def test_receive_confirmed_warehouse(make_item, db_session):
    """창고 입고: warehouse + qty, 총량 증가."""
    item = make_item(name="X", warehouse_qty=D("2"))

    svc.receive_confirmed(db_session, item.item_id, D("5"))

    inv = _inv(db_session, item.item_id)
    assert inv.warehouse_qty == D("7")
    assert inv.quantity == D("7")


def test_receive_confirmed_production(make_item, db_session):
    """생산 입고(bucket=production, dept 지정): 부서 PRODUCTION 적재, 창고 불변."""
    item = make_item(name="X", warehouse_qty=D("2"))

    svc.receive_confirmed(
        db_session, item.item_id, D("3"), bucket="production", dept=ASSEMBLY
    )

    inv = _inv(db_session, item.item_id)
    assert inv.warehouse_qty == D("2")  # 창고 불변
    assert _loc_qty(db_session, item.item_id, ASSEMBLY) == D("3")
    assert inv.quantity == D("5")  # 2 + 3
    _assert_invariant(db_session, item.item_id)


def test_receive_confirmed_production_without_dept_falls_back_to_warehouse(make_item, db_session):
    """bucket=production 이지만 dept None 이면 창고로 폴백."""
    item = make_item(name="X", warehouse_qty=D("2"))

    svc.receive_confirmed(db_session, item.item_id, D("3"), bucket="production", dept=None)

    inv = _inv(db_session, item.item_id)
    assert inv.warehouse_qty == D("5")  # 창고로 폴백
    assert _loc_qty(db_session, item.item_id, ASSEMBLY) == D("0")
    assert inv.quantity == D("5")


def test_receive_confirmed_zero_qty_raises(make_item, db_session):
    item = make_item(name="X", warehouse_qty=D("0"))
    with pytest.raises(ValueError, match="0보다 커야"):
        svc.receive_confirmed(db_session, item.item_id, D("0"))


# ──────────────────────────── 라운드트립 불변식 ────────────────────────────

def test_roundtrip_preserves_total(make_item, db_session):
    """창고→부서→타부서→창고 왕복 후 총량 불변, 모든 위치 정합."""
    item = make_item(name="X", warehouse_qty=D("20"))

    svc.transfer_to_production(db_session, item.item_id, D("12"), ASSEMBLY)
    svc.transfer_between_departments(db_session, item.item_id, D("5"), ASSEMBLY, TUBE)
    svc.transfer_to_warehouse(db_session, item.item_id, D("4"), TUBE)

    inv = _inv(db_session, item.item_id)
    # 창고: 20 - 12 + 4 = 12
    assert inv.warehouse_qty == D("12")
    # ASSEMBLY: 12 - 5 = 7
    assert _loc_qty(db_session, item.item_id, ASSEMBLY) == D("7")
    # TUBE: 5 - 4 = 1
    assert _loc_qty(db_session, item.item_id, TUBE) == D("1")
    # 총량 불변
    assert inv.quantity == D("20")
    _assert_invariant(db_session, item.item_id)
