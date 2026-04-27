---
type: code-note
project: ERP
layer: backend
source_path: backend/app/services/inventory.py
status: active
updated: 2026-04-27
source_sha: b035b9320d7c
tags:
  - erp
  - backend
  - service
  - py
---

# inventory.py

> [!summary] 역할
> 라우터에서 직접 처리하기 무거운 `inventory` 비즈니스 로직과 계산 책임을 분리해 담는다.

## 원본 위치

- Source: `backend/app/services/inventory.py`
- Layer: `backend`
- Kind: `service`
- Size: `16360` bytes

## 연결

- Parent hub: [[backend/app/services/services|backend/app/services]]
- Related: [[backend/backend]]

## 읽는 포인트

- 서비스는 라우터보다 안쪽의 업무 규칙을 담는다.
- 재고 수량이나 BOM 계산은 화면 표시와 실제 거래가 일치해야 한다.

## 원본 발췌

> 전체 445줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````python
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
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
