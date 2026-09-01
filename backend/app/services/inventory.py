"""Inventory service — 공개 API.

3-bucket 모델:
- warehouse_qty (창고)
- production: InventoryLocation rows where status=PRODUCTION (부서별)
- defective: InventoryLocation rows where status=DEFECTIVE (부서별)

Inventory.quantity = warehouse_qty + Σ InventoryLocation.quantity (불변식).
가용 재고 available = (warehouse_qty − Inventory.pending_quantity)
                   + Σ(PRODUCTION.quantity − PRODUCTION.pending_quantity). 불량 제외.
Inventory.pending_quantity는 창고 예약만, InventoryLocation.pending_quantity는
생산/불량 부서 위치 예약만 나타낸다.

내부 구현은 하위 모듈로 분리됨:
  inv_base.py      — 기반 헬퍼 + 부서 매핑
  inv_calc.py      — 집계 계산
  inv_transfer.py  — 이동 / 입고 / 창고 출고
  inv_defective.py — 불량 등록/복귀/폐기/반품

라우터는 이 모듈만 import하면 된다 (`from app.services import inventory as inventory_svc`).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Iterable, Optional
import uuid

from sqlalchemy import select, update as sa_update
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app._evt import emit as _evt_emit
from app.repositories import inventory_repository
from app.models import (
    Employee,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    WarehouseUnplacedItem,
)

# ---------------------------------------------------------------------------
# Re-exports from sub-modules (라우터 호환성 유지)
# ---------------------------------------------------------------------------
from app.services.inv_base import (  # noqa: F401
    PROCESS_TYPE_TO_DEPT,
    dept_for_process_type,
    _get_or_create_inventory,
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
    _receive_confirmed,
    _transfer_to_production,
    _transfer_to_warehouse,
    _transfer_between_departments,
    _consume_warehouse,
    _consume_from_department,
    department_for_item,
    item_department_stock,
    format_item_location_shortage,
    _consume_from_item_department,
    _receive_to_item_department,
)
from app.services.inv_defective import (  # noqa: F401
    DefectSource,
    NormalSource,
    ReasonContext,
    _mark_defective,
    _unmark_defective,
    _receive_defective,
    _scrap_defective,
    _scrap_normal,
    _return_to_supplier,
    _return_to_supplier_from_normal,
)


def _lock_required_unplaced(
    db: Session,
    item_ids: list[uuid.UUID],
) -> None:
    """Lock every required U row and reject a structurally incomplete ledger."""
    query = (
        db.query(WarehouseUnplacedItem)
        .filter(WarehouseUnplacedItem.item_id.in_(item_ids))
        .order_by(WarehouseUnplacedItem.item_id.asc())
    )
    if db.get_bind().dialect.name == "postgresql":
        query = query.with_for_update()
    unplaced_ids = {row.item_id for row in query.all()}
    if unplaced_ids != set(item_ids):
        raise ValueError("물리 위치 원장 불일치 — 미배치(U) 행이 없습니다.")


def _ensure_and_lock_inventories(
    db: Session,
    item_ids: Iterable[uuid.UUID],
) -> dict[uuid.UUID, Inventory]:
    """Ensure parent rows exist, then lock every Inventory in global item order.

    Existing rows need one bulk query. If rows are missing, create them in the
    same deterministic order and repeat the bulk lock once.
    """
    ordered_item_ids = sorted(set(item_ids))
    if not ordered_item_ids:
        return {}
    dialect_name = db.get_bind().dialect.name
    if dialect_name == "postgresql":
        db.execute(
            select(Item)
            .where(Item.item_id.in_(ordered_item_ids))
            .order_by(Item.item_id.asc())
            .with_for_update(of=Item.__table__)
        ).scalars().all()
    locked = lock_inventories(db, ordered_item_ids)
    missing_item_ids = [item_id for item_id in ordered_item_ids if item_id not in locked]
    if not missing_item_ids:
        _lock_required_unplaced(db, ordered_item_ids)
        return locked

    values = [
        {
            "item_id": item_id,
            "quantity": Decimal("0"),
            "warehouse_qty": Decimal("0"),
            "pending_quantity": Decimal("0"),
        }
        for item_id in missing_item_ids
    ]
    if dialect_name == "postgresql":
        statement = postgresql_insert(Inventory).values(values)
    elif dialect_name == "sqlite":
        statement = sqlite_insert(Inventory).values(values)
    else:  # DEXCOWIN MES supports PostgreSQL and SQLite; keep a clear fallback.
        raise RuntimeError(f"지원하지 않는 DB dialect입니다: {dialect_name}")
    db.execute(
        statement.on_conflict_do_nothing(index_elements=[Inventory.item_id])
    )
    unplaced_values = [
        {
            "id": uuid.uuid4(),
            "item_id": item_id,
            "quantity": 0,
        }
        for item_id in missing_item_ids
    ]
    if dialect_name == "postgresql":
        unplaced_statement = postgresql_insert(WarehouseUnplacedItem).values(
            unplaced_values
        )
    else:
        unplaced_statement = sqlite_insert(WarehouseUnplacedItem).values(
            unplaced_values
        )
    db.execute(
        unplaced_statement.on_conflict_do_nothing(
            index_elements=[WarehouseUnplacedItem.item_id]
        )
    )
    db.flush()
    locked = lock_inventories(db, ordered_item_ids)
    _lock_required_unplaced(db, ordered_item_ids)
    return locked


# ---------------------------------------------------------------------------
# Pending 예약 (큐 배치 OUT line — warehouse_qty 대비)
# ---------------------------------------------------------------------------


def reserve(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    *,
    employee: Employee,
) -> Inventory:
    """warehouse_qty 가용분에서 예약(Pending). 부족 시 ValueError.

    원자적 조건부 UPDATE를 사용 — SQLite/PostgreSQL 모두 check-then-act 경쟁 없음.
    """
    if not isinstance(employee, Employee):
        raise TypeError("employee must be an Employee")
    if qty <= 0:
        raise ValueError("예약 수량은 0보다 커야 합니다.")

    _get_or_create_inventory(db, item_id)
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

    inv.last_reserver_employee_id = employee.employee_id
    inv.last_reserver_name = employee.name
    return inv


def _release(db: Session, item_id: uuid.UUID, qty: Decimal) -> Inventory:
    """예약 해제 (Pending 차감)."""
    if qty <= 0:
        raise ValueError("해제 수량은 0보다 커야 합니다.")

    inv = _lock_inventory(db, item_id)
    current = inv.pending_quantity or Decimal("0")
    if current < qty:
        raise ValueError(f"예약된 수량이 부족합니다 (Pending {current}, 요청 {qty}).")
    inv.pending_quantity = current - qty
    db.flush()
    return inv


def _reserve_location(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    *,
    department: str,
    status: LocationStatusEnum,
) -> InventoryLocation:
    """Reserve an existing department/status location with one conditional update."""
    if qty <= 0:
        raise ValueError("예약 수량은 0보다 커야 합니다.")

    _lock_inventory(db, item_id)
    result = db.execute(
        sa_update(InventoryLocation)
        .where(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == department,
            InventoryLocation.status == status,
            InventoryLocation.quantity
            - InventoryLocation.pending_quantity
            >= qty,
        )
        .values(pending_quantity=InventoryLocation.pending_quantity + qty)
        .execution_options(synchronize_session=False)
    )
    db.flush()
    if result.rowcount == 0:
        location = (
            db.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == item_id,
                InventoryLocation.department == department,
                InventoryLocation.status == status,
            )
            .first()
        )
        quantity = location.quantity if location else Decimal("0")
        pending = location.pending_quantity if location else Decimal("0")
        raise ValueError(
            f"부서 가용 재고 부족(재고 {quantity}, 예약중 {pending}, 요청 {qty})."
        )

    db.expire_all()
    return (
        db.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == department,
            InventoryLocation.status == status,
        )
        .one()
    )


def _release_location(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    *,
    department: str,
    status: LocationStatusEnum,
) -> InventoryLocation:
    """Release an existing department/status reservation atomically."""
    if qty <= 0:
        raise ValueError("해제 수량은 0보다 커야 합니다.")

    _lock_inventory(db, item_id)
    result = db.execute(
        sa_update(InventoryLocation)
        .where(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == department,
            InventoryLocation.status == status,
            InventoryLocation.pending_quantity >= qty,
        )
        .values(pending_quantity=InventoryLocation.pending_quantity - qty)
        .execution_options(synchronize_session=False)
    )
    db.flush()
    if result.rowcount == 0:
        location = (
            db.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == item_id,
                InventoryLocation.department == department,
                InventoryLocation.status == status,
            )
            .first()
        )
        pending = location.pending_quantity if location else Decimal("0")
        raise ValueError(
            f"부서 예약 수량이 부족합니다 (예약 {pending}, 해제 요청 {qty})."
        )

    db.expire_all()
    return (
        db.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == department,
            InventoryLocation.status == status,
        )
        .one()
    )


def _consume_pending(db: Session, item_id: uuid.UUID, qty: Decimal) -> Inventory:
    """배치 confirm (OUT): warehouse_qty와 pending_quantity 동시 차감."""
    if qty <= 0:
        raise ValueError("차감 수량은 0보다 커야 합니다.")

    from app.services.warehouse_map import _apply_warehouse_ledger_delta

    _lock_inventory(db, item_id)
    inv = _apply_warehouse_ledger_delta(
        db,
        item_id,
        -qty,
        consume_mode="reserved",
    )
    _sync_total(db, inv)
    return inv


# ---------------------------------------------------------------------------
# 창고 전용 헬퍼 (라우터가 warehouse_qty 를 직접 건드리지 않도록)
# ---------------------------------------------------------------------------
def _adjust_warehouse(
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
    from app.services.warehouse_map import _apply_warehouse_ledger_delta

    inv = _lock_inventory(db, item_id)
    qty_before = inv.quantity or Decimal("0")
    wh_before = inv.warehouse_qty or Decimal("0")
    delta = new_warehouse_qty - wh_before
    inv = _apply_warehouse_ledger_delta(
        db,
        item_id,
        delta,
        consume_mode="absolute",
    )
    if location is not None:
        inv.location = location
    _sync_total(db, inv)
    return inv, qty_before, delta
