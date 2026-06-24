"""Inventory service — 공개 API.

3-bucket 모델:
- warehouse_qty (창고)
- production: InventoryLocation rows where status=PRODUCTION (부서별)
- defective: InventoryLocation rows where status=DEFECTIVE (부서별)

Inventory.quantity = warehouse_qty + Σ InventoryLocation.quantity (불변식).
가용 재고 available = warehouse_qty + Σ(PRODUCTION) − pending_quantity. 불량 제외.

내부 구현은 하위 모듈로 분리됨:
  inv_base.py      — 기반 헬퍼 + 부서 매핑
  inv_calc.py      — 집계 계산
  inv_transfer.py  — 이동 / 입고 / 창고 출고
  inv_defective.py — 불량 등록/복귀/폐기/반품

라우터는 이 모듈만 import하면 된다 (`from app.services import inventory as inventory_svc`).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional
import uuid

from sqlalchemy import update as sa_update
from sqlalchemy.orm import Session

from app._evt import emit as _evt_emit
from app.repositories import inventory_repository
from app.models import (
    Employee,
    Inventory,
)

# ---------------------------------------------------------------------------
# Re-exports from sub-modules (라우터 호환성 유지)
# ---------------------------------------------------------------------------
from app.services.inv_base import (  # noqa: F401
    PROCESS_TYPE_TO_DEPT,
    dept_for_process_type,
    get_or_create_inventory,
    _lock_inventory,
    _lock_location,
    _get_or_create_location,
    lock_inventories,
)
from app.services.inv_calc import (  # noqa: F401
    production_total,
    defective_total,
    available,
    _sync_total,
)
from app.services.inv_transfer import (  # noqa: F401
    receive_confirmed,
    transfer_to_production,
    transfer_to_warehouse,
    transfer_between_departments,
    consume_warehouse,
    consume_from_department,
)
from app.services.inv_defective import (  # noqa: F401
    DefectSource,
    NormalSource,
    ReasonContext,
    mark_defective,
    unmark_defective,
    receive_defective,
    scrap_defective,
    scrap_normal,
    return_to_supplier,
    return_to_supplier_from_normal,
)


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
    """warehouse_qty 가용분에서 예약(Pending). 부족 시 ValueError.

    원자적 조건부 UPDATE를 사용 — SQLite/PostgreSQL 모두 check-then-act 경쟁 없음.
    """
    if qty <= 0:
        raise ValueError("예약 수량은 0보다 커야 합니다.")

    get_or_create_inventory(db, item_id)
    db.flush()

    result = db.execute(
        sa_update(Inventory)
        .where(
            Inventory.item_id == item_id,
            Inventory.warehouse_qty - Inventory.pending_quantity >= qty,
        )
        .values(pending_quantity=Inventory.pending_quantity + qty)
        .execution_options(synchronize_session=False)
    )
    db.flush()

    if result.rowcount == 0:
        inv = inventory_repository.get(db, item_id)
        wh = inv.warehouse_qty or Decimal("0")
        pending = inv.pending_quantity or Decimal("0")
        avail_wh = wh - pending
        raise ValueError(
            f"창고 가용 재고 부족 (창고 {wh}, 예약중 {pending}, 가용 {avail_wh}, 요청 {qty})."
        )

    db.expire_all()
    inv = inventory_repository.get(db, item_id)

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

    inv = _lock_inventory(db, item_id)
    current = inv.pending_quantity or Decimal("0")
    if current < qty:
        raise ValueError(f"예약된 수량이 부족합니다 (Pending {current}, 요청 {qty}).")
    inv.pending_quantity = current - qty
    return inv


def consume_pending(db: Session, item_id: uuid.UUID, qty: Decimal) -> Inventory:
    """배치 confirm (OUT): warehouse_qty와 pending_quantity 동시 차감."""
    if qty <= 0:
        raise ValueError("차감 수량은 0보다 커야 합니다.")

    inv = _lock_inventory(db, item_id)
    pending = inv.pending_quantity or Decimal("0")
    wh = inv.warehouse_qty or Decimal("0")
    if pending < qty:
        raise ValueError(f"예약 수량이 부족합니다 (Pending {pending}, 차감 요청 {qty}).")
    if wh < qty:
        raise ValueError(f"창고 재고가 부족합니다 (Warehouse {wh}, 차감 요청 {qty}).")
    inv.pending_quantity = pending - qty
    inv.warehouse_qty = wh - qty
    _sync_total(db, inv)
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
        _evt_emit(
            "neg_block",
            level="warning",
            item_id=str(item_id)[:8],
            attempted=str(new_warehouse_qty),
        )
        raise ValueError("창고 수량은 음수일 수 없습니다.")
    inv = _lock_inventory(db, item_id)
    qty_before = inv.quantity or Decimal("0")
    wh_before = inv.warehouse_qty or Decimal("0")
    delta = new_warehouse_qty - wh_before
    inv.warehouse_qty = new_warehouse_qty
    if location is not None:
        inv.location = location
    _sync_total(db, inv)
    return inv, qty_before, delta
