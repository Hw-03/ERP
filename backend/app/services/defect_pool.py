"""Category stock authority after the explicit, separately executed POOL cutover."""

from __future__ import annotations

import uuid
from decimal import Decimal, InvalidOperation
from collections.abc import Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session
from app.services import stocktake_guard

from app.models import (
    DefectPoolBridge, DefectPoolCutover, DefectQuarantineRecord,
    DefectStockMovement, DefectStockPool, InventoryOperation, InventoryScope,
    StocktakeControl, Employee,
    RequestBucketEnum, StockRequestLine, StockRequest, StockRequestStatusEnum,
)


CATEGORIES = frozenset({"DEFECT", "B_GRADE", "OBSOLETE"})
MAX_QUANTITY = 2_147_483_647


def is_pool_mode(db: Session) -> bool:
    """Absent control rows remain compatible with old isolated test fixtures."""
    control = db.get(StocktakeControl, 1)
    return control is not None and control.inventory_mode == "POOL"


def integer_quantity(value: object, *, positive: bool = False) -> int:
    """Reject coercions and overflow before touching either stock projection."""
    try:
        decimal = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("재고 수량은 정수여야 합니다.") from exc
    if not decimal.is_finite() or decimal != decimal.to_integral_value():
        raise ValueError("재고 수량은 정수여야 합니다.")
    number = int(decimal)
    if abs(number) > MAX_QUANTITY or (positive and number <= 0):
        raise ValueError("재고 수량이 허용 범위를 벗어났습니다.")
    return number


def scope_for_department(db: Session, department: object) -> InventoryScope:
    """Use the persisted canonical map; never synthesize a missing location."""
    name = str(getattr(department, "value", department))
    scope = db.query(InventoryScope).filter(InventoryScope.physical_department == name).one_or_none()
    if scope is None:
        raise ValueError("공동재고 위치 매핑이 없습니다. 전환 상태를 확인해 주세요.")
    return scope


def current_cutover(db: Session) -> DefectPoolCutover:
    """One explicit cutover owns all pools in this database."""
    row = db.query(DefectPoolCutover).one_or_none()
    if row is None:
        raise ValueError("공동재고 전환 증빙이 없습니다.")
    return row


def get_pool(
    db: Session, *, item_id: uuid.UUID, department: object, category: str,
    create: bool = False, lock: bool = True,
) -> DefectStockPool | None:
    """Find one category under a stable scope, optionally creating a zero cell."""
    if category not in CATEGORIES:
        raise ValueError("지원하지 않는 공동재고 분류입니다.")
    if lock or create:
        stocktake_guard.prepare_items(db, [item_id])
    scope = scope_for_department(db, department)
    query = db.query(DefectStockPool).filter(
        DefectStockPool.item_id == item_id, DefectStockPool.scope_key == scope.scope_key,
        DefectStockPool.category == category,
    )
    if lock and db.get_bind().dialect.name != "sqlite":
        query = query.with_for_update()
    pool = query.populate_existing().one_or_none()
    if pool is None and create:
        pool = DefectStockPool(item_id=item_id, scope_key=scope.scope_key, category=category,
                               cutover_id=current_cutover(db).cutover_id)
        db.add(pool)
        db.flush()
    return pool


def pool_for_record(db: Session, record: DefectQuarantineRecord, *, lock: bool = True) -> DefectStockPool:
    """A historical record selects its cutover category, never a FIFO balance."""
    cutover = current_cutover(db)
    bridge = db.query(DefectPoolBridge).filter(
        DefectPoolBridge.cutover_id == cutover.cutover_id,
        DefectPoolBridge.source_record_id == record.record_id,
        DefectPoolBridge.source_key == f"record:{record.record_id}",
    ).one_or_none()
    if bridge is not None:
        category = bridge.cutover_category
    elif record.quarantined_at >= cutover.performed_at:
        category = record.management_category
    else:
        raise ValueError("과거 격리 기록의 공동재고 연결 증빙이 없습니다.")
    pool = get_pool(db, item_id=record.item_id, department=record.department, category=category, lock=lock)
    if pool is None:
        raise ValueError("선택한 공동재고를 찾을 수 없습니다.")
    return pool


def resolve_source(
    db: Session, *, pool_id: uuid.UUID | None, record_id: uuid.UUID | None,
    item_id: uuid.UUID, department: object, defect_only: bool = False, lock: bool = True,
) -> DefectStockPool:
    """Validate the explicit pool or a proven old record-to-pool selection."""
    if lock:
        stocktake_guard.prepare_items(db, [item_id])
    if pool_id is not None:
        query = db.query(DefectStockPool).filter(DefectStockPool.pool_id == pool_id)
        if lock and db.get_bind().dialect.name != "sqlite":
            query = query.with_for_update()
        pool = query.populate_existing().one_or_none()
        if pool is None:
            raise ValueError("선택한 공동재고를 찾을 수 없습니다.")
    elif record_id is not None:
        record = db.get(DefectQuarantineRecord, record_id)
        if record is None:
            raise ValueError("선택한 격리 기록을 찾을 수 없습니다.")
        pool = pool_for_record(db, record, lock=lock)
    else:
        raise ValueError("공동재고 전환 후에는 처리할 pool_id를 선택해 주세요.")
    scope = scope_for_department(db, department)
    if pool.item_id != item_id or pool.scope_key != scope.scope_key:
        raise ValueError("선택한 공동재고의 품목 또는 위치가 일치하지 않습니다.")
    if record_id is not None and pool_id is not None:
        record = db.get(DefectQuarantineRecord, record_id)
        if record is None or pool_for_record(db, record, lock=lock).pool_id != pool.pool_id:
            raise ValueError("격리 기록과 공동재고 선택이 일치하지 않습니다.")
    if defect_only and pool.category != "DEFECT":
        raise ValueError("B급·불용 관리 품목은 먼저 불량 격리로 이동한 뒤 처리해 주세요.")
    return pool


def ensure_available(pool: DefectStockPool, quantity: object) -> None:
    """Protect all active reservations without reading occurrence balances."""
    requested = integer_quantity(quantity, positive=True)
    if int(pool.quantity) - int(pool.pending_quantity) < requested:
        raise ValueError("선택한 분류의 공동재고 처리 가능 수량이 부족합니다.")


def pools_for_lines(db: Session, lines: Iterable, *, defect_only: bool = False, lock: bool = True) -> list[tuple[DefectStockPool, int]]:
    """Aggregate explicit category selections before validation or reservation."""
    lines = list(lines)
    if lock:
        stocktake_guard.prepare_items(db, [line.item_id for line in lines])
    groups: dict[uuid.UUID, tuple[DefectStockPool, int]] = {}
    for line in lines:
        if line.from_bucket != RequestBucketEnum.DEFECTIVE:
            continue
        pool = resolve_source(db, pool_id=getattr(line, "pool_id", None),
                              record_id=getattr(line, "record_id", None) or getattr(line, "defect_quarantine_record_id", None),
                              item_id=line.item_id, department=line.from_department,
                              defect_only=defect_only, lock=lock)
        line.pool_id = pool.pool_id
        quantity = integer_quantity(line.quantity, positive=True)
        groups[pool.pool_id] = (pool, groups.get(pool.pool_id, (pool, 0))[1] + quantity)
    return [groups[key] for key in sorted(groups, key=str)]


def validate_lines(db: Session, lines: Iterable, *, defect_only: bool = False) -> None:
    """Validate combined requests against their actual shared category balance."""
    for pool, quantity in pools_for_lines(db, lines, defect_only=defect_only, lock=False):
        ensure_available(pool, quantity)


def reserve_lines(db: Session, lines: Iterable) -> None:
    """Reserve a category and let the caller reserve its matching physical total."""
    groups = pools_for_lines(db, lines, defect_only=True)
    for pool, quantity in groups:
        ensure_available(pool, quantity)
    for pool, quantity in groups:
        scope = db.get(InventoryScope, pool.scope_key)
        stocktake_guard.record_change(db, pool.item_id, scope.physical_department, kind="reservation", delta=quantity)
        pool.pending_quantity += quantity
        pool.version += 1
    db.flush()


def release_lines(db: Session, lines: Iterable, *, request_id: uuid.UUID | None) -> None:
    """Preserve other owners' category reservations during release and retries."""
    for pool, quantity in pools_for_lines(db, lines):
        protected = 0
        if request_id is not None:
            protected = int(db.query(func.coalesce(func.sum(StockRequestLine.quantity), 0)).join(
                StockRequest, StockRequest.request_id == StockRequestLine.request_id,
            ).filter(StockRequestLine.pool_id == pool.pool_id,
                     StockRequestLine.request_id != request_id,
                     StockRequestLine.status == StockRequestStatusEnum.RESERVED,
                     StockRequest.status == StockRequestStatusEnum.RESERVED).scalar())
        released = min(quantity, max(0, int(pool.pending_quantity) - protected))
        scope = db.get(InventoryScope, pool.scope_key)
        stocktake_guard.record_change(db, pool.item_id, scope.physical_department, kind="reservation", delta=-released)
        pool.pending_quantity -= released
        if released:
            pool.version += 1
    db.flush()


def apply_delta(
    db: Session, *, pool: DefectStockPool, delta: object,
    operation: InventoryOperation | None, reason: str,
) -> DefectStockMovement:
    """Apply one nonzero category effect inside the caller's physical-stock transaction."""
    if operation is None:
        raise ValueError("공동재고 변경에는 활성 재고 작업 원장이 필요합니다.")
    quantity_delta = integer_quantity(delta)
    if quantity_delta == 0:
        raise ValueError("수량 0의 공동재고 이동은 생성할 수 없습니다.")
    scope = db.get(InventoryScope, pool.scope_key)
    stocktake_guard.record_change(db, pool.item_id, scope.physical_department, kind="category", delta=quantity_delta)
    before = int(pool.quantity)
    after = before + quantity_delta
    if after < int(pool.pending_quantity) or after < 0 or after > MAX_QUANTITY:
        raise ValueError("공동재고 수량이 부족하거나 예약 또는 허용 범위를 침범합니다.")
    db.flush()
    ordinal = int(db.query(func.coalesce(func.max(DefectStockMovement.effect_ordinal), -1)).filter(
        DefectStockMovement.operation_id == operation.operation_id,
    ).scalar()) + 1
    pool.quantity = after
    pool.version += 1
    movement = DefectStockMovement(
        pool_id=pool.pool_id, operation_id=operation.operation_id, effect_ordinal=ordinal,
        delta=quantity_delta, before_quantity=before, after_quantity=after,
        reason=reason, actor_employee_id=operation.actor_employee_id,
    )
    db.add(movement)
    db.flush()
    return movement


def record_occurrence_effect(
    db: Session, *, record_id: uuid.UUID, delta: object,
    operation: InventoryOperation | None, reason: str,
) -> DefectStockMovement:
    """New occurrence evidence credits its category; consumption leaves it frozen."""
    record = db.get(DefectQuarantineRecord, record_id)
    if record is None:
        raise ValueError("격리 발생 기록을 찾을 수 없습니다.")
    if integer_quantity(delta) > 0:
        pool = get_pool(db, item_id=record.item_id, department=record.department,
                        category=record.management_category, create=True)
    else:
        pool = pool_for_record(db, record)
    return apply_delta(db, pool=pool, delta=delta, operation=operation, reason=reason)


def move_category(
    db: Session, *, pool_id: uuid.UUID, quantity: object, category: str,
    expected_version: int, actor: Employee, reason: str,
) -> DefectStockPool:
    """Transfer only available units between categories, preserving occurrence history."""
    from app.services import inventory, inventory_operations, pool_cancellation
    from app.services._tx import transactional
    from app.services.inventory_conflicts import InventoryConflict

    with transactional(db):
        if not is_pool_mode(db):
            raise ValueError("공동재고 전환 이후에만 분류별 수량을 이동할 수 있습니다.")
        source = db.get(DefectStockPool, pool_id)
        if source is None:
            raise ValueError("선택한 공동재고를 찾을 수 없습니다.")
        inventory.ensure_and_lock_inventories(db, [source.item_id])
        scope = db.get(InventoryScope, source.scope_key)
        source = get_pool(db, item_id=source.item_id, department=scope.physical_department, category=source.category)
        if source.version != expected_version:
            raise InventoryConflict("PREVIEW_STALE", "공동재고가 변경되었습니다. 다시 확인해 주세요.")
        if source.category == category:
            raise ValueError("다른 분류를 선택해 주세요.")
        ensure_available(source, quantity)
        quantity = integer_quantity(quantity, positive=True)
        target = get_pool(db, item_id=source.item_id, department=scope.physical_department, category=category, create=True)
        operation = inventory_operations.create_business_operation(
            db, domain="defect", action="category_transfer", display_label="격리 재고 분류 이동",
            actor_name=actor.name, actor_employee_id=actor.employee_id, reason=reason,
        )
        apply_delta(db, pool=source, delta=-quantity, operation=operation, reason=reason)
        apply_delta(db, pool=target, delta=quantity, operation=operation, reason=reason)
        pool_cancellation.assert_physical_projection(db, {(str(source.item_id), scope.physical_department)})
        return target
