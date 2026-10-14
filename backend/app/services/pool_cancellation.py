"""Normalize native and frozen historical effects without replaying old stock."""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from dataclasses import dataclass
import uuid

from sqlalchemy.orm import Session

from app.models import (DefectPoolBridge, DefectStockMovement, DefectStockPool,
                        InventoryLocation, InventoryOperation, InventoryScope,
                        LocationStatusEnum, TransactionLog)
from app.services import defect_pool
from app.services.inventory_conflicts import InventoryConflict


@dataclass(frozen=True)
class PoolCancellationEffect:
    pool_id: str | None
    item_id: str
    scope_key: str
    department: str
    category: str
    quantity_change: int
    current_quantity: int
    reserved_quantity: int
    quantity_after: int
    version: int


def effect_fingerprint(log: TransactionLog) -> str:
    """Bind every bridge to the complete physical source effect, not just one part."""
    value = {"log_id": str(log.log_id), "item_id": str(log.item_id), "effect": log.inventory_effect}
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


def _ambiguous(message: str) -> InventoryConflict:
    return InventoryConflict("AMBIGUOUS_LEGACY_EFFECT", message, status_code=422)


def reversal_deltas(db: Session, operation: InventoryOperation, logs: list[TransactionLog]) -> dict[tuple[str, str, str], int]:
    """Prove the whole source effect independently of today's available balance."""
    movements = db.query(DefectStockMovement).filter_by(operation_id=operation.operation_id).all()
    deltas: dict[tuple[str, str, str], int] = defaultdict(int)
    physical: dict[tuple[str, str], int] = defaultdict(int)
    from app.services.inventory_operation_cancellation import normalized_effect_for_cancellation

    for log in logs:
        for effect in normalized_effect_for_cancellation(log):
            if effect.get("scope") == "location" and effect.get("status") == "DEFECTIVE":
                physical[(str(log.item_id), str(effect["department"]))] -= int(effect["delta"])
    if movements:
        for movement in movements:
            pool = db.get(DefectStockPool, movement.pool_id)
            scope = db.get(InventoryScope, pool.scope_key)
            deltas[(str(pool.item_id), scope.physical_department, pool.category)] -= int(movement.delta)
    elif physical:
        cutover = defect_pool.current_cutover(db)
        log_ids = sorted(str(log.log_id) for log in logs)
        for log in logs:
            for ordinal, effect in enumerate(normalized_effect_for_cancellation(log)):
                if effect.get("scope") != "location" or effect.get("status") != "DEFECTIVE":
                    continue
                bridge = db.query(DefectPoolBridge).filter_by(
                    cutover_id=cutover.cutover_id, source_key=f"effect:{log.log_id}:{ordinal}",
                    source_transaction_id=log.log_id,
                ).one_or_none()
                payload = bridge.source_payload if bridge else {}
                if (not bridge or bridge.source_fingerprint != effect_fingerprint(log)
                        or payload.get("operation_log_ids") != log_ids):
                    raise _ambiguous("원업무 전체와 분류 효과의 전환 증빙이 일치하지 않습니다.")
                if payload.get("original_consumed"):
                    raise ValueError("후속 처리 또는 승인 예약이 연결된 최초 격리 거래는 취소할 수 없습니다.")
                parts = payload.get("parts")
                if not isinstance(parts, list) or not parts:
                    raise _ambiguous("과거 효과의 분류를 증명할 수 없습니다.")
                total = 0
                for part in parts:
                    if not isinstance(part, dict) or part.get("category") not in defect_pool.CATEGORIES:
                        raise _ambiguous("과거 효과 분류가 올바르지 않습니다.")
                    delta = defect_pool.integer_quantity(part.get("delta"))
                    if not delta or delta * int(effect["delta"]) <= 0:
                        raise _ambiguous("과거 효과 수량과 할당의 부호가 일치하지 않습니다.")
                    total += delta
                    deltas[(str(log.item_id), str(effect["department"]), part["category"])] -= delta
                if total != int(effect["delta"]):
                    raise _ambiguous("원거래 전체 수량과 분류별 할당 합계가 다릅니다.")
    pooled_physical: dict[tuple[str, str], int] = defaultdict(int)
    for (item_id, department, _category), delta in deltas.items():
        pooled_physical[(item_id, department)] += delta
    if {k: v for k, v in pooled_physical.items() if v} != {k: v for k, v in physical.items() if v}:
        raise _ambiguous("공동재고 효과와 원업무의 물리 재고 효과가 일치하지 않습니다.")
    return {key: delta for key, delta in deltas.items() if delta}


def plan_reversal(db: Session, operation: InventoryOperation, logs: list[TransactionLog]) -> tuple[PoolCancellationEffect, ...]:
    """Validate current availability only after proving the complete source effects."""
    deltas = reversal_deltas(db, operation, logs)
    _check_original_followups(db, operation, logs, deltas)
    result = []
    for (item_id, department, category), delta in sorted(deltas.items()):
        if not delta:
            continue
        pool = defect_pool.get_pool(db, item_id=uuid.UUID(item_id), department=department, category=category, lock=False)
        current, pending, version = (int(pool.quantity), int(pool.pending_quantity), int(pool.version)) if pool else (0, 0, 0)
        after = current + delta
        if after < pending or after < 0 or after > defect_pool.MAX_QUANTITY:
            raise ValueError("취소할 분류의 공동재고가 부족하거나 예약을 침범합니다.")
        result.append(PoolCancellationEffect(
            str(pool.pool_id) if pool else None, item_id,
            defect_pool.scope_for_department(db, department).scope_key,
            department, category, delta, current, pending, after, version,
        ))
    assert_physical_projection(db, {(entry.item_id, entry.department) for entry in result})
    return tuple(result)


def _check_original_followups(db: Session, operation: InventoryOperation,
    logs: list[TransactionLog], deltas: dict[tuple[str, str, str], int]) -> None:
    """Never treat replenishment as proof that an earlier occurrence was unused.

    Pools intentionally do not attribute consumption to occurrences. A later
    uncancelled consumption/category transfer therefore requires business review.
    """
    from app.models import InventoryOperationKindEnum
    from app.services.inventory_operation_cancellation import normalized_effect_for_cancellation
    positive_cells = {(str(log.item_id), str(effect["department"])) for log in logs
        if log.defect_quarantine_record_id is not None
        for effect in normalized_effect_for_cancellation(log)
        if effect.get("scope") == "location" and effect.get("status") == "DEFECTIVE" and int(effect["delta"]) > 0}
    native = db.query(DefectStockMovement).filter_by(operation_id=operation.operation_id).all()
    for (item_id, department, category), delta in deltas.items():
        if delta >= 0 or (item_id, department) not in positive_cells:
            continue
        pool = defect_pool.get_pool(db, item_id=uuid.UUID(item_id), department=department, category=category, lock=False)
        if pool is None:
            continue
        times = [row.created_at for row in native if row.pool_id == pool.pool_id and row.delta > 0]
        boundary = max(times) if times else defect_pool.current_cutover(db).performed_at
        candidates = db.query(DefectStockMovement, InventoryOperation).join(InventoryOperation,
            InventoryOperation.operation_id == DefectStockMovement.operation_id).filter(
                DefectStockMovement.pool_id == pool.pool_id, DefectStockMovement.delta < 0,
                DefectStockMovement.created_at >= boundary,
                DefectStockMovement.operation_id != operation.operation_id,
                InventoryOperation.kind == InventoryOperationKindEnum.BUSINESS).all()
        for _movement, downstream in candidates:
            if db.query(InventoryOperation.operation_id).filter_by(reverses_operation_id=downstream.operation_id).first() is None:
                raise ValueError("원발생 이후 공동재고 소비·분류 이동이 연결되어 있습니다. 후속 업무 정정 또는 취소를 먼저 확인해 주세요.")


def assert_physical_projection(db: Session, cells: set[tuple[str, str]]) -> None:
    """Reject disagreement; no automatic repair or category assignment is allowed."""
    db.flush()
    for item_id, department in cells:
        scope = defect_pool.scope_for_department(db, department)
        pools = db.query(DefectStockPool).filter_by(item_id=item_id, scope_key=scope.scope_key).all()
        location = db.query(InventoryLocation).filter_by(
            item_id=item_id, department=department, status=LocationStatusEnum.DEFECTIVE,
        ).one_or_none()
        physical = (int(location.quantity), int(location.pending_quantity)) if location else (0, 0)
        projected = (sum(int(pool.quantity) for pool in pools), sum(int(pool.pending_quantity) for pool in pools))
        if physical != projected:
            raise ValueError("공동재고와 물리 격리 수량 또는 예약이 일치하지 않습니다.")


def apply_reversal(db: Session, effects: tuple[PoolCancellationEffect, ...], operation: InventoryOperation) -> None:
    """Use the already revalidated plan inside the existing cancellation transaction."""
    for effect in effects:
        pool = defect_pool.get_pool(db, item_id=uuid.UUID(effect.item_id), department=effect.department,
                                    category=effect.category, create=effect.quantity_change > 0)
        if pool is None or int(pool.quantity) != effect.current_quantity or int(pool.version) != effect.version:
            raise ValueError("공동재고 취소 미리보기 이후 상태가 변경되었습니다.")
        defect_pool.apply_delta(db, pool=pool, delta=effect.quantity_change,
                                operation=operation, reason="CANCELLATION")
    assert_physical_projection(db, {(entry.item_id, entry.department) for entry in effects})
