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
    LocationStatusEnum,
)
from app.services.inv_base import (
    _lock_inventory,
    _lock_location,
    get_or_create_inventory,
)
from app.services.inv_calc import _sync_total
from app.repositories import inventory_repository


def _deplete_boxes_if_tracking(db: Session, item_id: uuid.UUID, qty: Decimal) -> None:
    """창고 박스 추적이 켜져 있으면 warehouse_qty 감소분만큼 박스도 R1 순서로 차감.

    플래그 OFF면 무동작(현행 동작 유지). 박스 합 부족 시 ValueError → 호출 측 롤백.
    순환 import 회피를 위해 warehouse_map 서비스를 지역 import 한다.
    """
    from app.services import warehouse_map as _wm

    if _wm.is_box_tracking_enabled(db):
        _wm.deplete_boxes_by_order(db, item_id, qty)


def receive_confirmed(
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
    inv = _lock_inventory(db, item_id)

    if bucket == "production" and dept is not None:
        loc = _lock_location(db, item_id, dept, LocationStatusEnum.PRODUCTION)
        loc.quantity = (loc.quantity or Decimal("0")) + qty
    else:
        inv.warehouse_qty = (inv.warehouse_qty or Decimal("0")) + qty

    _sync_total(db, inv)
    return inv


def transfer_to_production(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    dept: DepartmentEnum,
) -> Inventory:
    """창고 → 부서 PRODUCTION 이동. 총량 변동 없음."""
    if qty <= 0:
        raise ValueError("이동 수량은 0보다 커야 합니다.")
    get_or_create_inventory(db, item_id)
    _lock_location(db, item_id, dept, LocationStatusEnum.PRODUCTION)
    db.flush()

    result = db.execute(
        sa_update(Inventory)
        .where(Inventory.item_id == item_id)
        .where(
            Inventory.warehouse_qty - func.coalesce(Inventory.pending_quantity, 0) >= qty
        )
        .values(warehouse_qty=Inventory.warehouse_qty - qty)
        .execution_options(synchronize_session=False)
    )
    db.flush()
    if result.rowcount == 0:
        inv_check = inventory_repository.get(db, item_id)
        wh = inv_check.warehouse_qty or Decimal("0")
        pending = inv_check.pending_quantity or Decimal("0")
        raise ValueError(
            f"창고 가용 재고 부족 (창고 {wh}, 예약중 {pending}, 이동 요청 {qty})."
        )

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
    _deplete_boxes_if_tracking(db, item_id, qty)
    return inv


def transfer_to_warehouse(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    dept: DepartmentEnum,
) -> Inventory:
    """부서 PRODUCTION → 창고 복귀. 총량 변동 없음."""
    if qty <= 0:
        raise ValueError("이동 수량은 0보다 커야 합니다.")
    get_or_create_inventory(db, item_id)
    _lock_location(db, item_id, dept, LocationStatusEnum.PRODUCTION)
    db.flush()

    result = db.execute(
        sa_update(InventoryLocation)
        .where(InventoryLocation.item_id == item_id)
        .where(InventoryLocation.department == dept)
        .where(InventoryLocation.status == LocationStatusEnum.PRODUCTION)
        .where(InventoryLocation.quantity >= qty)
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
        raise ValueError(f"{dept.value} 생산 재고 부족 (현재 {cur}, 요청 {qty}).")

    db.execute(
        sa_update(Inventory)
        .where(Inventory.item_id == item_id)
        .values(warehouse_qty=func.coalesce(Inventory.warehouse_qty, 0) + qty)
        .execution_options(synchronize_session=False)
    )
    db.flush()
    db.expire_all()
    inv = inventory_repository.get(db, item_id)
    _sync_total(db, inv)
    return inv


def transfer_between_departments(
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
    get_or_create_inventory(db, item_id)
    for d in sorted([from_dept, to_dept], key=lambda x: x.value if hasattr(x, "value") else str(x)):
        _lock_location(db, item_id, d, LocationStatusEnum.PRODUCTION)
    db.flush()

    result = db.execute(
        sa_update(InventoryLocation)
        .where(InventoryLocation.item_id == item_id)
        .where(InventoryLocation.department == from_dept)
        .where(InventoryLocation.status == LocationStatusEnum.PRODUCTION)
        .where(InventoryLocation.quantity >= qty)
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


def consume_warehouse(db: Session, item_id: uuid.UUID, qty: Decimal) -> tuple[Inventory, Decimal]:
    """창고에서 qty 만큼 차감 (BACKFLUSH / 비예약 창고 출고용). 원자적 조건부 UPDATE.

    Returns:
        (inventory, qty_before) — qty_before 는 차감 전 Inventory.quantity (총량).
    """
    if qty <= 0:
        raise ValueError("차감 수량은 0보다 커야 합니다.")

    get_or_create_inventory(db, item_id)
    db.flush()

    result = db.execute(
        sa_update(Inventory)
        .where(Inventory.item_id == item_id)
        .where(Inventory.warehouse_qty >= qty)
        .values(warehouse_qty=Inventory.warehouse_qty - qty)
        .execution_options(synchronize_session=False)
    )
    db.flush()

    if result.rowcount == 0:
        inv_check = inventory_repository.get(db, item_id)
        wh = inv_check.warehouse_qty if inv_check else Decimal("0")
        raise ValueError(f"창고 재고 부족 (창고 {wh}, 차감 요청 {qty}).")

    db.expire_all()
    inv = inventory_repository.get(db, item_id)
    _sync_total(db, inv)
    _deplete_boxes_if_tracking(db, item_id, qty)
    qty_before = inv.quantity + qty
    return inv, qty_before


def consume_from_department(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    dept: DepartmentEnum,
) -> Inventory:
    """특정 부서 PRODUCTION에서 직접 차감 (출고/부서출고용). 총량 감소. 원자적 조건부 UPDATE."""
    if qty <= 0:
        raise ValueError("차감 수량은 0보다 커야 합니다.")
    _lock_location(db, item_id, dept, LocationStatusEnum.PRODUCTION)
    db.flush()

    result = db.execute(
        sa_update(InventoryLocation)
        .where(InventoryLocation.item_id == item_id)
        .where(InventoryLocation.department == dept)
        .where(InventoryLocation.status == LocationStatusEnum.PRODUCTION)
        .where(InventoryLocation.quantity >= qty)
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
