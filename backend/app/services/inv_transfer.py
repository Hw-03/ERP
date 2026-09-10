"""inv_transfer.py — 재고 이동 / 입고 / 창고 출고 함수.

의존성: inv_base → inv_calc → (이 모듈). 역방향 import 없음.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional
import uuid

from sqlalchemy import func, update as sa_update
from sqlalchemy.orm import Session

from app.models import (
    DepartmentEnum,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
)
from app.services.inv_base import (
    _lock_inventory,
    _lock_location,
    _get_or_create_inventory,
)
from app.services.inv_calc import _sync_total
from app.services import stock_availability
from app.repositories import inventory_repository


def _apply_warehouse_ledger_delta(
    db: Session,
    item_id: uuid.UUID,
    delta: Decimal,
    *,
    consume_mode: str = "available",
) -> Inventory:
    """Apply W and B/Z/U together without introducing a module import cycle."""
    from app.services import warehouse_map as _wm

    _get_or_create_inventory(db, item_id)
    return _wm._apply_warehouse_ledger_delta(
        db,
        item_id,
        delta,
        consume_mode=consume_mode,
    )


def _receive_confirmed(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    *,
    bucket: str = "warehouse",
    dept: Optional[DepartmentEnum] = None,
) -> Inventory:
    """입고. bucket='warehouse'면 창고 적재, 'production'이면 dept의 PRODUCTION에 적재.

    bucket='production'이고 dept가 None이면 warehouse로 폴백.
    """
    if qty <= 0:
        raise ValueError("입고 수량은 0보다 커야 합니다.")
    if bucket == "production" and dept is not None:
        inv = _lock_inventory(db, item_id)
        loc = _lock_location(db, item_id, dept, LocationStatusEnum.PRODUCTION)
        loc.quantity = (loc.quantity or Decimal("0")) + qty
    else:
        inv = _apply_warehouse_ledger_delta(db, item_id, qty)

    _sync_total(db, inv)
    return inv


def _transfer_to_production(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    dept: DepartmentEnum,
) -> Inventory:
    """창고 → 부서 PRODUCTION 이동. 총량 변동 없음."""
    if qty <= 0:
        raise ValueError("이동 수량은 0보다 커야 합니다.")
    from app.services import warehouse_map as _wm

    _wm._lock_warehouse_ledger(db, item_id)
    _lock_location(db, item_id, dept, LocationStatusEnum.PRODUCTION)
    db.flush()
    inv = _apply_warehouse_ledger_delta(db, item_id, -qty)

    db.execute(
        sa_update(InventoryLocation)
        .where(InventoryLocation.item_id == item_id)
        .where(InventoryLocation.department == dept)
        .where(InventoryLocation.status == LocationStatusEnum.PRODUCTION)
        .values(quantity=func.coalesce(InventoryLocation.quantity, 0) + qty)
        .execution_options(synchronize_session=False)
    )
    db.flush()
    db.expire_all()
    inv = inventory_repository.get(db, item_id)
    _sync_total(db, inv)
    return inv


def _transfer_to_warehouse(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    dept: DepartmentEnum | str,
) -> Inventory:
    """부서 PRODUCTION → 창고 복귀. 총량 변동 없음."""
    if qty <= 0:
        raise ValueError("이동 수량은 0보다 커야 합니다.")
    from app.services import warehouse_map as _wm

    _wm._lock_warehouse_ledger(db, item_id)
    _lock_location(db, item_id, dept, LocationStatusEnum.PRODUCTION)
    db.flush()
    _require_location_available(db, item_id, qty, dept)

    result = db.execute(
        sa_update(InventoryLocation)
        .where(InventoryLocation.item_id == item_id)
        .where(InventoryLocation.department == dept)
        .where(InventoryLocation.status == LocationStatusEnum.PRODUCTION)
        .where(
            InventoryLocation.quantity
            - func.coalesce(InventoryLocation.pending_quantity, 0)
            >= qty
        )
        .values(quantity=InventoryLocation.quantity - qty)
        .execution_options(synchronize_session=False)
    )
    db.flush()
    if result.rowcount == 0:
        loc_check = db.query(InventoryLocation).filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        ).first()
        cur = loc_check.quantity if loc_check else Decimal("0")
        dept_name = dept.value if isinstance(dept, DepartmentEnum) else dept
        raise ValueError(f"{dept_name} 생산 재고 부족 (현재 {cur}, 요청 {qty}).")

    _apply_warehouse_ledger_delta(db, item_id, qty)
    db.flush()
    db.expire_all()
    inv = inventory_repository.get(db, item_id)
    _sync_total(db, inv)
    return inv


def _transfer_between_departments(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    from_dept: DepartmentEnum,
    to_dept: DepartmentEnum,
) -> Inventory:
    """부서간 PRODUCTION 이동."""
    if qty <= 0:
        raise ValueError("이동 수량은 0보다 커야 합니다.")
    if from_dept == to_dept:
        raise ValueError("출발/도착 부서가 동일합니다.")
    _lock_inventory(db, item_id)
    for d in sorted([from_dept, to_dept], key=lambda x: x.value if hasattr(x, "value") else str(x)):
        _lock_location(db, item_id, d, LocationStatusEnum.PRODUCTION)
    db.flush()
    _require_location_available(db, item_id, qty, from_dept)

    result = db.execute(
        sa_update(InventoryLocation)
        .where(InventoryLocation.item_id == item_id)
        .where(InventoryLocation.department == from_dept)
        .where(InventoryLocation.status == LocationStatusEnum.PRODUCTION)
        .where(
            InventoryLocation.quantity
            - func.coalesce(InventoryLocation.pending_quantity, 0)
            >= qty
        )
        .values(quantity=InventoryLocation.quantity - qty)
        .execution_options(synchronize_session=False)
    )
    db.flush()
    if result.rowcount == 0:
        src_check = db.query(InventoryLocation).filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == from_dept,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        ).first()
        cur = src_check.quantity if src_check else Decimal("0")
        raise ValueError(f"{from_dept.value} 생산 재고 부족 (현재 {cur}, 요청 {qty}).")

    db.execute(
        sa_update(InventoryLocation)
        .where(InventoryLocation.item_id == item_id)
        .where(InventoryLocation.department == to_dept)
        .where(InventoryLocation.status == LocationStatusEnum.PRODUCTION)
        .values(quantity=func.coalesce(InventoryLocation.quantity, 0) + qty)
        .execution_options(synchronize_session=False)
    )
    db.flush()
    db.expire_all()
    inv = inventory_repository.get(db, item_id)
    _sync_total(db, inv)
    return inv


def department_for_item(item: Item) -> DepartmentEnum:
    """Return the production department implied by an item's process type."""
    from app.services.inv_base import dept_for_process_type

    dept = dept_for_process_type(item.process_type_code)
    if dept is None:
        code = item.mes_code or str(item.item_id)
        raise ValueError(f"품목코드로 부서를 찾을 수 없습니다: {code} / {item.item_name}")
    return dept


def item_department_stock(db: Session, item: Item) -> tuple[DepartmentEnum, Decimal]:
    """Read the item's process-code department PRODUCTION quantity without warehouse fallback."""
    dept = department_for_item(item)
    loc = (
        db.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item.item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    return dept, loc.quantity if loc else Decimal("0")


def format_item_location_shortage(item: Item, dept: DepartmentEnum, current: Decimal, required: Decimal) -> str:
    """Human-readable shortage message for automatic production/shipping flows."""
    code = item.mes_code or str(item.item_id)
    return (
        f"부서 위치 재고 부족: {code} / {item.item_name} / 부서 {dept.value} / "
        f"현재 수량 {current} / 필요 수량 {required}"
    )


def _consume_from_item_department(
    db: Session,
    item: Item,
    qty: Decimal,
    *,
    shipping_owner_request_id: uuid.UUID | None = None,
) -> tuple[Inventory, Decimal, DepartmentEnum]:
    """Consume from the item's process-code PRODUCTION location only."""
    dept, current = item_department_stock(db, item)
    if current < qty:
        raise ValueError(format_item_location_shortage(item, dept, current, qty))
    inv_before = _get_or_create_inventory(db, item.item_id)
    qty_before = inv_before.quantity or Decimal("0")
    inv = _consume_from_department(
        db,
        item.item_id,
        qty,
        dept,
        shipping_owner_request_id=shipping_owner_request_id,
    )
    return inv, qty_before, dept


def _receive_to_item_department(db: Session, item: Item, qty: Decimal) -> tuple[Inventory, Decimal, DepartmentEnum]:
    """Receive into the item's process-code PRODUCTION location only."""
    dept = department_for_item(item)
    inv_before = _get_or_create_inventory(db, item.item_id)
    qty_before = inv_before.quantity or Decimal("0")
    inv = _receive_confirmed(db, item.item_id, qty, bucket="production", dept=dept)
    return inv, qty_before, dept

def _consume_warehouse(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
) -> tuple[Inventory, Decimal]:
    """창고 가용 재고에서 qty 만큼 차감하는 원자적 조건부 UPDATE.

    Returns:
        (inventory, qty_before) — qty_before 는 차감 전 Inventory.quantity (총량).
    """
    if qty <= 0:
        raise ValueError("차감 수량은 0보다 커야 합니다.")

    inv = _apply_warehouse_ledger_delta(db, item_id, -qty)
    db.flush()
    _sync_total(db, inv)
    qty_before = inv.quantity + qty
    return inv, qty_before


def _consume_from_department(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    dept: DepartmentEnum,
    *,
    shipping_owner_request_id: uuid.UUID | None = None,
) -> Inventory:
    """특정 부서 PRODUCTION에서 직접 차감 (출고/부서출고용). 총량 감소. 원자적 조건부 UPDATE."""
    if qty <= 0:
        raise ValueError("차감 수량은 0보다 커야 합니다.")
    _require_location_available(
        db,
        item_id,
        qty,
        dept,
        shipping_owner_request_id=shipping_owner_request_id,
    )

    result = db.execute(
        sa_update(InventoryLocation)
        .where(InventoryLocation.item_id == item_id)
        .where(InventoryLocation.department == dept)
        .where(InventoryLocation.status == LocationStatusEnum.PRODUCTION)
        .where(
            InventoryLocation.quantity
            - func.coalesce(InventoryLocation.pending_quantity, 0)
            >= qty
        )
        .values(quantity=InventoryLocation.quantity - qty)
        .execution_options(synchronize_session=False)
    )
    db.flush()

    if result.rowcount == 0:
        loc = db.query(InventoryLocation).filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        ).first()
        cur = loc.quantity if loc else Decimal("0")
        raise ValueError(f"{dept.value} 생산 재고 부족 (현재 {cur}, 요청 {qty}).")

    db.expire_all()
    inv = _lock_inventory(db, item_id)
    _sync_total(db, inv)
    return inv


def _require_location_available(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    dept: DepartmentEnum | str,
    *,
    shipping_owner_request_id: uuid.UUID | None = None,
) -> stock_availability.AvailabilityFigure:
    """Lock one production cell and reject consumption of either reservation."""
    _lock_location(db, item_id, dept, LocationStatusEnum.PRODUCTION)
    db.flush()
    figure = stock_availability.figure_for_cell(
        db,
        stock_availability.AvailabilityCell.location(
            item_id,
            dept,
            LocationStatusEnum.PRODUCTION,
        ),
        owner_request_id=shipping_owner_request_id,
        lock_allocations=True,
    )
    if figure.available < qty:
        department_name = getattr(dept, "value", str(dept))
        raise ValueError(
            f"{department_name} 생산 재고 부족 "
            f"(물리 {figure.physical}, 요청예약 {figure.stock_request_pending}, "
            f"출하예약 {figure.active_shipping_reserved}, "
            f"가용 {figure.available}, 요청 {qty})."
        )
    return figure
