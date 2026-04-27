"""Inventory service helpers.

3-bucket 모델:
- warehouse_qty (창고)
- production: InventoryLocation rows where status=PRODUCTION (부서별)
- defective: InventoryLocation rows where status=DEFECTIVE (부서별)

Inventory.quantity = warehouse_qty + Σ InventoryLocation.quantity (불변식).
가용 재고 available = warehouse_qty + Σ(PRODUCTION) − pending_quantity. 불량 제외.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    CategoryEnum,
    DepartmentEnum,
    Employee,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
)


# ---------------------------------------------------------------------------
# 카테고리 → 부서 자동 매핑 (PRODUCE 결과물 적재용)
# ---------------------------------------------------------------------------
CATEGORY_TO_DEPT: dict[CategoryEnum, DepartmentEnum] = {
    CategoryEnum.TA: DepartmentEnum.TUBE,
    CategoryEnum.TF: DepartmentEnum.TUBE,
    CategoryEnum.HA: DepartmentEnum.HIGH_VOLTAGE,
    CategoryEnum.HF: DepartmentEnum.HIGH_VOLTAGE,
    CategoryEnum.VA: DepartmentEnum.VACUUM,
    CategoryEnum.VF: DepartmentEnum.VACUUM,
    CategoryEnum.AA: DepartmentEnum.ASSEMBLY,
    CategoryEnum.AF: DepartmentEnum.ASSEMBLY,
    CategoryEnum.FG: DepartmentEnum.SHIPPING,
}


def dept_for_category(category: CategoryEnum) -> Optional[DepartmentEnum]:
    """PRODUCE 결과 자동 적재 부서. 매핑 없으면 None (warehouse fallback)."""
    return CATEGORY_TO_DEPT.get(category)


# ---------------------------------------------------------------------------
# Inventory / InventoryLocation 헬퍼
# ---------------------------------------------------------------------------


def get_or_create_inventory(db: Session, item_id: uuid.UUID) -> Inventory:
    inv = db.query(Inventory).filter(Inventory.item_id == item_id).first()
    if inv is None:
        inv = Inventory(
            item_id=item_id,
            quantity=Decimal("0"),
            warehouse_qty=Decimal("0"),
            pending_quantity=Decimal("0"),
        )
        db.add(inv)
        db.flush()
    return inv


def _get_or_create_location(
    db: Session,
    item_id: uuid.UUID,
    dept: DepartmentEnum,
    status: LocationStatusEnum,
) -> InventoryLocation:
    loc = (
        db.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == status,
        )
        .first()
    )
    if loc is None:
        loc = InventoryLocation(
            item_id=item_id,
            department=dept,
            status=status,
            quantity=Decimal("0"),
        )
        db.add(loc)
        db.flush()
    return loc


def production_total(db: Session, item_id: uuid.UUID) -> Decimal:
    """모든 부서 PRODUCTION 합계."""
    val = (
        db.query(func.coalesce(func.sum(InventoryLocation.quantity), 0))
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .scalar()
    )
    return Decimal(str(val or 0))


def defective_total(db: Session, item_id: uuid.UUID) -> Decimal:
    """모든 부서 DEFECTIVE 합계."""
    val = (
        db.query(func.coalesce(func.sum(InventoryLocation.quantity), 0))
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
        )
        .scalar()
    )
    return Decimal(str(val or 0))


def available(inv: Inventory, *, db: Optional[Session] = None) -> Decimal:
    """Available = warehouse_qty + production_total − pending. 불량 제외.

    db가 주어지면 production_total을 실시간 계산. 없으면 warehouse만 (예약 검사용 안전 기준)."""
    pending = inv.pending_quantity or Decimal("0")
    wh = inv.warehouse_qty or Decimal("0")
    prod = production_total(db, inv.item_id) if db is not None else Decimal("0")
    return wh + prod - pending


def _sync_total(db: Session, item_id: uuid.UUID) -> None:
    """Inventory.quantity 를 warehouse + 모든 location 합으로 동기화.

    SessionLocal 이 autoflush=False 이므로 SUM 쿼리 전에 명시적으로 flush 한다.
    wh/loc 양쪽을 동시에 수정하는 경로(transfer 등) 에서도 최신 값을 읽도록 보장.
    """
    db.flush()
    inv = db.query(Inventory).filter(Inventory.item_id == item_id).first()
    if inv is None:
        return
    loc_sum = (
        db.query(func.coalesce(func.sum(InventoryLocation.quantity), 0))
        .filter(InventoryLocation.item_id == item_id)
        .scalar()
    ) or 0
    inv.quantity = (inv.warehouse_qty or Decimal("0")) + Decimal(str(loc_sum))


# ---------------------------------------------------------------------------
# Pending 예약 (큐 배치 OUT line — warehouse_qty 대비)
# ---------------------------------------------------------------------------


def reserve(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    *,
    employee: Optional[Employee] = None,
    employee_name: Optional[str] = None,
) -> Inventory:
    """warehouse_qty 가용분에서 예약(Pending). 부족 시 ValueError."""
    if qty <= 0:
        raise ValueError("예약 수량은 0보다 커야 합니다.")

    inv = get_or_create_inventory(db, item_id)
    wh = inv.warehouse_qty or Decimal("0")
    pending = inv.pending_quantity or Decimal("0")
    avail_wh = wh - pending
    if avail_wh < qty:
        raise ValueError(
            f"창고 가용 재고 부족 (창고 {wh}, 예약중 {pending}, 가용 {avail_wh}, 요청 {qty})."
        )
    inv.pending_quantity = pending + qty
    if employee is not None:
        inv.last_reserver_employee_id = employee.employee_id
        inv.last_reserver_name = employee.name
    elif employee_name:
        inv.last_reserver_employee_id = None
        inv.last_reserver_name = employee_name
    return inv


def release(db: Session, item_id: uuid.UUID, qty: Decimal) -> Inventory:
    """예약 해제 (Pending 차감)."""
    if qty <= 0:
        raise ValueError("해제 수량은 0보다 커야 합니다.")

    inv = get_or_create_inventory(db, item_id)
    current = inv.pending_quantity or Decimal("0")
    if current < qty:
        raise ValueError(f"예약된 수량이 부족합니다 (Pending {current}, 요청 {qty}).")
    inv.pending_quantity = current - qty
    return inv


def consume_pending(db: Session, item_id: uuid.UUID, qty: Decimal) -> Inventory:
    """배치 confirm (OUT): warehouse_qty와 pending_quantity 동시 차감."""
    if qty <= 0:
        raise ValueError("차감 수량은 0보다 커야 합니다.")

    inv = get_or_create_inventory(db, item_id)
    pending = inv.pending_quantity or Decimal("0")
    wh = inv.warehouse_qty or Decimal("0")
    if pending < qty:
        raise ValueError(f"예약 수량이 부족합니다 (Pending {pending}, 차감 요청 {qty}).")
    if wh < qty:
        raise ValueError(f"창고 재고가 부족합니다 (Warehouse {wh}, 차감 요청 {qty}).")
    inv.pending_quantity = pending - qty
    inv.warehouse_qty = wh - qty
    _sync_total(db, item_id)
    return inv


# ---------------------------------------------------------------------------
# 입고 (RECEIVE / PRODUCE 결과)
# ---------------------------------------------------------------------------


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
    inv = get_or_create_inventory(db, item_id)

    if bucket == "production" and dept is not None:
        loc = _get_or_create_location(db, item_id, dept, LocationStatusEnum.PRODUCTION)
        loc.quantity = (loc.quantity or Decimal("0")) + qty
    else:
        inv.warehouse_qty = (inv.warehouse_qty or Decimal("0")) + qty

    _sync_total(db, item_id)
    return inv


# ---------------------------------------------------------------------------
# 신규: 이동 / 불량 / 공급업체 반품
# ---------------------------------------------------------------------------


def transfer_to_production(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    dept: DepartmentEnum,
) -> Inventory:
    """창고 → 부서 PRODUCTION 이동. 총량 변동 없음."""
    if qty <= 0:
        raise ValueError("이동 수량은 0보다 커야 합니다.")
    inv = get_or_create_inventory(db, item_id)
    wh = inv.warehouse_qty or Decimal("0")
    pending = inv.pending_quantity or Decimal("0")
    if wh - pending < qty:
        raise ValueError(
            f"창고 가용 재고 부족 (창고 {wh}, 예약중 {pending}, 이동 요청 {qty})."
        )
    inv.warehouse_qty = wh - qty
    loc = _get_or_create_location(db, item_id, dept, LocationStatusEnum.PRODUCTION)
    loc.quantity = (loc.quantity or Decimal("0")) + qty
    _sync_total(db, item_id)
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
    inv = get_or_create_inventory(db, item_id)
    loc = _get_or_create_location(db, item_id, dept, LocationStatusEnum.PRODUCTION)
    cur = loc.quantity or Decimal("0")
    if cur < qty:
        raise ValueError(f"{dept.value} 생산 재고 부족 (현재 {cur}, 요청 {qty}).")
    loc.quantity = cur - qty
    inv.warehouse_qty = (inv.warehouse_qty or Decimal("0")) + qty
    _sync_total(db, item_id)
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
    inv = get_or_create_inventory(db, item_id)
    src = _get_or_create_location(db, item_id, from_dept, LocationStatusEnum.PRODUCTION)
    cur = src.quantity or Decimal("0")
    if cur < qty:
        raise ValueError(f"{from_dept.value} 생산 재고 부족 (현재 {cur}, 요청 {qty}).")
    src.quantity = cur - qty
    dst = _get_or_create_location(db, item_id, to_dept, LocationStatusEnum.PRODUCTION)
    dst.quantity = (dst.quantity or Decimal("0")) + qty
    _sync_total(db, item_id)
    return inv


def mark_defective(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    *,
    source: str,                                # "warehouse" 또는 "production"
    target_dept: DepartmentEnum,                # 불량 격리될 부서
    source_dept: Optional[DepartmentEnum] = None,  # source=production일 때 필수
) -> Inventory:
    """불량 등록. 총량 변동 없음 (위치만 이동)."""
    if qty <= 0:
        raise ValueError("불량 수량은 0보다 커야 합니다.")
    inv = get_or_create_inventory(db, item_id)

    if source == "warehouse":
        wh = inv.warehouse_qty or Decimal("0")
        pending = inv.pending_quantity or Decimal("0")
        if wh - pending < qty:
            raise ValueError(
                f"창고 가용 재고 부족 (창고 {wh}, 예약중 {pending}, 불량 처리 요청 {qty})."
            )
        inv.warehouse_qty = wh - qty
    elif source == "production":
        if source_dept is None:
            raise ValueError("source=production일 때 source_dept는 필수입니다.")
        src_loc = _get_or_create_location(db, item_id, source_dept, LocationStatusEnum.PRODUCTION)
        cur = src_loc.quantity or Decimal("0")
        if cur < qty:
            raise ValueError(f"{source_dept.value} 생산 재고 부족 (현재 {cur}, 요청 {qty}).")
        src_loc.quantity = cur - qty
    else:
        raise ValueError(f"알 수 없는 source: {source} (warehouse 또는 production)")

    dst = _get_or_create_location(db, item_id, target_dept, LocationStatusEnum.DEFECTIVE)
    dst.quantity = (dst.quantity or Decimal("0")) + qty
    _sync_total(db, item_id)
    return inv


def return_to_supplier(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    from_dept: DepartmentEnum,
) -> Inventory:
    """공급업체 반품: 부서별 DEFECTIVE 차감, 총량 감소."""
    if qty <= 0:
        raise ValueError("반품 수량은 0보다 커야 합니다.")
    inv = get_or_create_inventory(db, item_id)
    loc = _get_or_create_location(db, item_id, from_dept, LocationStatusEnum.DEFECTIVE)
    cur = loc.quantity or Decimal("0")
    if cur < qty:
        raise ValueError(f"{from_dept.value} 불량 재고 부족 (현재 {cur}, 요청 {qty}).")
    loc.quantity = cur - qty
    _sync_total(db, item_id)
    return inv


def consume_from_department(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    dept: DepartmentEnum,
) -> Inventory:
    """특정 부서 PRODUCTION에서 직접 차감 (출고/부서출고용). 총량 감소."""
    if qty <= 0:
        raise ValueError("차감 수량은 0보다 커야 합니다.")
    inv = get_or_create_inventory(db, item_id)
    loc = _get_or_create_location(db, item_id, dept, LocationStatusEnum.PRODUCTION)
    cur = loc.quantity or Decimal("0")
    if cur < qty:
        raise ValueError(f"{dept.value} 생산 재고 부족 (현재 {cur}, 요청 {qty}).")
    loc.quantity = cur - qty
    _sync_total(db, item_id)
    return inv


# ---------------------------------------------------------------------------
# 창고 전용 헬퍼 (라우터가 warehouse_qty 를 직접 건드리지 않도록)
# ---------------------------------------------------------------------------
def adjust_warehouse(
    db: Session,
    item_id: uuid.UUID,
    new_warehouse_qty: Decimal,
    *,
    location: Optional[str] = None,
) -> tuple[Inventory, Decimal, Decimal]:
    """창고 재고를 절대값으로 지정 (ADJUST 용).

    Returns:
        (inventory, qty_before, delta) — qty_before 는 조정 전 Inventory.quantity (총량),
        delta 는 warehouse_qty 변화량. 라우터가 TransactionLog 에 사용.
    """
    if new_warehouse_qty < 0:
        raise ValueError("창고 수량은 음수일 수 없습니다.")
    inv = get_or_create_inventory(db, item_id)
    qty_before = inv.quantity or Decimal("0")
    wh_before = inv.warehouse_qty or Decimal("0")
    delta = new_warehouse_qty - wh_before
    inv.warehouse_qty = new_warehouse_qty
    if location is not None:
        inv.location = location
    _sync_total(db, item_id)
    return inv, qty_before, delta


def consume_warehouse(db: Session, item_id: uuid.UUID, qty: Decimal) -> tuple[Inventory, Decimal]:
    """창고에서 qty 만큼 차감 (BACKFLUSH / 비예약 창고 출고용).

    Pending 과 무관하게 warehouse_qty 만 건드린다 (사전 feasibility 는 호출측 책임).

    Returns:
        (inventory, qty_before) — qty_before 는 차감 전 Inventory.quantity (총량).
    """
    if qty <= 0:
        raise ValueError("차감 수량은 0보다 커야 합니다.")
    inv = get_or_create_inventory(db, item_id)
    qty_before = inv.quantity or Decimal("0")
    wh = inv.warehouse_qty or Decimal("0")
    if wh < qty:
        raise ValueError(f"창고 재고 부족 (창고 {wh}, 차감 요청 {qty}).")
    inv.warehouse_qty = wh - qty
    _sync_total(db, item_id)
    return inv, qty_before
