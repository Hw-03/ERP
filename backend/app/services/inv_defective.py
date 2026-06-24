"""inv_defective.py — 불량 등록/복귀/폐기/공급업체 반품 함수.

의존성: inv_base → inv_calc → inv_transfer → (이 모듈). 역방향 import 없음.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
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
    _lock_location,
    get_or_create_inventory,
)
from app.services.inv_calc import _sync_total
from app.repositories import inventory_repository
from app.services.inv_transfer import consume_warehouse


# ---------------------------------------------------------------------------
# 옵션 객체 (인자 묶음)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ReasonContext:
    """사유·감사 묶음 (reason_category/reason_memo/actor/batch_id).

    unmark_defective / scrap_defective / scrap_normal /
    return_to_supplier_from_normal 공통.
    """

    category: str
    memo: str = ""
    actor: str = ""
    batch_id: Optional[uuid.UUID] = None


@dataclass(frozen=True)
class DefectSource:
    """불량 등록(mark_defective) 출처·격리 부서 묶음.

    kind="warehouse" → 창고 차감.
    kind="production" → source_dept 의 PRODUCTION 차감 (source_dept 필수).
    target_dept → 격리(DEFECTIVE)될 부서.
    """

    kind: str
    target_dept: DepartmentEnum
    source_dept: Optional[DepartmentEnum] = None


@dataclass(frozen=True)
class NormalSource:
    """정상 재고 직접 처리(scrap_normal/return_to_supplier_from_normal) 출처 묶음.

    kind="warehouse" → warehouse_qty 차감.
    kind="production" → dept_or_warehouse 의 PRODUCTION 차감.
    supplier_name 은 공급처 반품 시 참고용 (재고 계산에는 미사용).
    """

    kind: str
    dept_or_warehouse: DepartmentEnum
    supplier_name: str = ""


def mark_defective(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    source: DefectSource,
) -> Inventory:
    """불량 등록. 총량 변동 없음 (위치만 이동)."""
    kind = source.kind
    target_dept = source.target_dept
    source_dept = source.source_dept
    if qty <= 0:
        raise ValueError("불량 수량은 0보다 커야 합니다.")
    if kind == "production" and source_dept is None:
        raise ValueError("source=production일 때 source_dept는 필수입니다.")
    if kind not in ("warehouse", "production"):
        raise ValueError(f"알 수 없는 source: {kind} (warehouse 또는 production)")

    get_or_create_inventory(db, item_id)
    _lock_location(db, item_id, target_dept, LocationStatusEnum.DEFECTIVE)
    if kind == "production":
        _lock_location(db, item_id, source_dept, LocationStatusEnum.PRODUCTION)
    db.flush()

    if kind == "warehouse":
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
                f"창고 가용 재고 부족 (창고 {wh}, 예약중 {pending}, 불량 처리 요청 {qty})."
            )
    else:  # source == "production"
        result = db.execute(
            sa_update(InventoryLocation)
            .where(InventoryLocation.item_id == item_id)
            .where(InventoryLocation.department == source_dept)
            .where(InventoryLocation.status == LocationStatusEnum.PRODUCTION)
            .where(InventoryLocation.quantity >= qty)
            .values(quantity=InventoryLocation.quantity - qty)
            .execution_options(synchronize_session=False)
        )
        db.flush()
        if result.rowcount == 0:
            src_check = db.query(InventoryLocation).filter(
                InventoryLocation.item_id == item_id,
                InventoryLocation.department == source_dept,
                InventoryLocation.status == LocationStatusEnum.PRODUCTION,
            ).first()
            cur = src_check.quantity if src_check else Decimal("0")
            raise ValueError(f"{source_dept.value} 생산 재고 부족 (현재 {cur}, 요청 {qty}).")

    db.execute(
        sa_update(InventoryLocation)
        .where(InventoryLocation.item_id == item_id)
        .where(InventoryLocation.department == target_dept)
        .where(InventoryLocation.status == LocationStatusEnum.DEFECTIVE)
        .values(
            quantity=func.coalesce(InventoryLocation.quantity, 0) + qty,
            defective_at=func.coalesce(InventoryLocation.defective_at, datetime.utcnow()),
        )
        .execution_options(synchronize_session=False)
    )
    db.flush()
    db.expire_all()
    inv = inventory_repository.get(db, item_id)
    _sync_total(db, inv)
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
    get_or_create_inventory(db, item_id)
    _lock_location(db, item_id, from_dept, LocationStatusEnum.DEFECTIVE)
    db.flush()

    result = db.execute(
        sa_update(InventoryLocation)
        .where(InventoryLocation.item_id == item_id)
        .where(InventoryLocation.department == from_dept)
        .where(InventoryLocation.status == LocationStatusEnum.DEFECTIVE)
        .where(InventoryLocation.quantity >= qty)
        .values(quantity=InventoryLocation.quantity - qty)
        .execution_options(synchronize_session=False)
    )
    db.flush()
    if result.rowcount == 0:
        loc_check = db.query(InventoryLocation).filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == from_dept,
            InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
        ).first()
        cur = loc_check.quantity if loc_check else Decimal("0")
        raise ValueError(f"{from_dept.value} 불량 재고 부족 (현재 {cur}, 요청 {qty}).")

    db.expire_all()
    inv = inventory_repository.get(db, item_id)
    _sync_total(db, inv)
    return inv


def unmark_defective(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    dept: DepartmentEnum,
    reason: ReasonContext,
) -> Inventory:
    """불량 → 정상 복귀. 같은 부서 DEFECTIVE → PRODUCTION 이동. 총량 변동 없음.

    defective_at NULL 로 초기화.
    """
    if qty <= 0:
        raise ValueError("복귀 수량은 0보다 커야 합니다.")

    get_or_create_inventory(db, item_id)
    defective_loc = _lock_location(db, item_id, dept, LocationStatusEnum.DEFECTIVE)
    _lock_location(db, item_id, dept, LocationStatusEnum.PRODUCTION)
    db.flush()

    result = db.execute(
        sa_update(InventoryLocation)
        .where(InventoryLocation.item_id == item_id)
        .where(InventoryLocation.department == dept)
        .where(InventoryLocation.status == LocationStatusEnum.DEFECTIVE)
        .where(InventoryLocation.quantity >= qty)
        .values(quantity=InventoryLocation.quantity - qty, defective_at=None)
        .execution_options(synchronize_session=False)
    )
    db.flush()
    if result.rowcount == 0:
        cur = defective_loc.quantity if defective_loc else Decimal("0")
        raise ValueError(f"{dept.value} 불량 재고 부족 (현재 {cur}, 요청 {qty}).")

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


def scrap_defective(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    dept: DepartmentEnum,
    reason: ReasonContext,
) -> Inventory:
    """불량 재고 폐기. DEFECTIVE 차감 + 총량 감소."""
    if qty <= 0:
        raise ValueError("폐기 수량은 0보다 커야 합니다.")

    get_or_create_inventory(db, item_id)
    defective_loc = _lock_location(db, item_id, dept, LocationStatusEnum.DEFECTIVE)
    db.flush()

    result = db.execute(
        sa_update(InventoryLocation)
        .where(InventoryLocation.item_id == item_id)
        .where(InventoryLocation.department == dept)
        .where(InventoryLocation.status == LocationStatusEnum.DEFECTIVE)
        .where(InventoryLocation.quantity >= qty)
        .values(quantity=InventoryLocation.quantity - qty)
        .execution_options(synchronize_session=False)
    )
    db.flush()
    if result.rowcount == 0:
        cur = defective_loc.quantity if defective_loc else Decimal("0")
        dept_label = getattr(dept, "value", str(dept))
        raise ValueError(f"{dept_label} 불량 재고 부족 (현재 {cur}, 요청 {qty}).")

    db.expire_all()
    inv = inventory_repository.get(db, item_id)
    _sync_total(db, inv)
    return inv


def receive_defective(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    dept: DepartmentEnum,
    reason: ReasonContext,
) -> Inventory:
    """분해 등으로 '생성'되는 자식을 격리(DEFECTIVE)로 신규 적재. 총량 증가.

    mark_defective 와 달리 출처(PRODUCTION/창고) 차감이 없다 — 분해 시점에
    자식 재고는 아직 존재하지 않으므로, keep_qty 의 PRODUCTION 신규 입고
    (receive_confirmed)와 대칭으로 DEFECTIVE 버킷에 신규 적재한다.
    defective_at 기록.
    """
    if qty <= 0:
        raise ValueError("격리 수량은 0보다 커야 합니다.")

    get_or_create_inventory(db, item_id)
    _lock_location(db, item_id, dept, LocationStatusEnum.DEFECTIVE)
    db.flush()

    db.execute(
        sa_update(InventoryLocation)
        .where(InventoryLocation.item_id == item_id)
        .where(InventoryLocation.department == dept)
        .where(InventoryLocation.status == LocationStatusEnum.DEFECTIVE)
        .values(
            quantity=func.coalesce(InventoryLocation.quantity, 0) + qty,
            defective_at=func.coalesce(InventoryLocation.defective_at, datetime.utcnow()),
        )
        .execution_options(synchronize_session=False)
    )
    db.flush()
    db.expire_all()
    inv = inventory_repository.get(db, item_id)
    _sync_total(db, inv)
    return inv


def _consume_normal_source(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    source: str,
    dept_or_warehouse: DepartmentEnum,
) -> Inventory:
    """정상 재고 source(창고/생산) 차감 후 총량 재동기화.

    source="warehouse" → warehouse_qty 차감.
    source="production" → 해당 부서 PRODUCTION 차감 (부족 시 ValueError).
    scrap_normal / return_to_supplier_from_normal 공통 본문.
    """
    if source == "warehouse":
        consume_warehouse(db, item_id, qty)
    else:
        _lock_location(db, item_id, dept_or_warehouse, LocationStatusEnum.PRODUCTION)
        db.flush()
        result = db.execute(
            sa_update(InventoryLocation)
            .where(InventoryLocation.item_id == item_id)
            .where(InventoryLocation.department == dept_or_warehouse)
            .where(InventoryLocation.status == LocationStatusEnum.PRODUCTION)
            .where(InventoryLocation.quantity >= qty)
            .values(quantity=InventoryLocation.quantity - qty)
            .execution_options(synchronize_session=False)
        )
        db.flush()
        if result.rowcount == 0:
            loc = db.query(InventoryLocation).filter(
                InventoryLocation.item_id == item_id,
                InventoryLocation.department == dept_or_warehouse,
                InventoryLocation.status == LocationStatusEnum.PRODUCTION,
            ).first()
            cur = loc.quantity if loc else Decimal("0")
            raise ValueError(
                f"{dept_or_warehouse.value} 생산 재고 부족 (현재 {cur}, 요청 {qty})."
            )

    db.expire_all()
    inv = inventory_repository.get(db, item_id)
    _sync_total(db, inv)
    return inv


def scrap_normal(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    source: NormalSource,
    reason: ReasonContext,
) -> Inventory:
    """R 원자재 정상 재고에서 직접 폐기. 총량 감소.

    source.kind="warehouse" → warehouse_qty 차감.
    source.kind="production" → 해당 부서 PRODUCTION 차감.
    """
    if qty <= 0:
        raise ValueError("폐기 수량은 0보다 커야 합니다.")
    if source.kind not in ("warehouse", "production"):
        raise ValueError(f"알 수 없는 source: {source.kind} (warehouse 또는 production)")

    get_or_create_inventory(db, item_id)
    return _consume_normal_source(db, item_id, qty, source.kind, source.dept_or_warehouse)


def return_to_supplier_from_normal(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    source: NormalSource,
    reason: ReasonContext,
) -> Inventory:
    """R 원자재 정상 재고에서 직접 공급처 반품. 총량 감소.

    source.kind="warehouse" → warehouse_qty 차감.
    source.kind="production" → 해당 부서 PRODUCTION 차감.
    """
    if qty <= 0:
        raise ValueError("반품 수량은 0보다 커야 합니다.")
    if source.kind not in ("warehouse", "production"):
        raise ValueError(f"알 수 없는 source: {source.kind} (warehouse 또는 production)")

    get_or_create_inventory(db, item_id)
    return _consume_normal_source(db, item_id, qty, source.kind, source.dept_or_warehouse)
