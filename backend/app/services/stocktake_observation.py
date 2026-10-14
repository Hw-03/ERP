"""A physical observation ends the reversible lifetime of earlier stock effects."""
import uuid

from sqlalchemy.orm import Session

from app.models import (DefectStockMovement, DefectStockPool, InventoryScope, StocktakeControl,
                        StocktakeEffectEpoch, StocktakeGate, TransactionLog, ShippingAllocation, StocktakeReservationEpoch)
from app.services.inventory_conflicts import InventoryConflict


def _log_scopes(log: TransactionLog, by_name: dict[str, str]) -> set[str]:
    """Retain physical changes even when the complete transaction has a zero total."""
    scopes = set()
    for effect in log.inventory_effect or []:
        if not effect.get("delta"):
            continue
        if effect.get("scope") in {"warehouse", "warehouse_box"}:
            scopes.add("warehouse")
        elif effect.get("scope") == "location":
            key = by_name.get(str(effect.get("department")))
            if key is None:
                raise InventoryConflict("AMBIGUOUS_LEGACY_EFFECT", "원거래 위치 매핑을 확인할 수 없습니다.", status_code=422)
            scopes.add(key)
    return scopes


def capture(db: Session) -> None:
    """Capture epochs before new effects flush, inside their existing parent locks."""
    sources = [row for row in db.new if isinstance(row, (TransactionLog, DefectStockMovement, ShippingAllocation))]
    if not sources:
        return
    control = db.get(StocktakeControl, 1)
    if control is None or control.inventory_mode != "POOL":
        return
    by_name = {row.physical_department: row.scope_key for row in db.query(InventoryScope).all()}
    for source in sources:
        if isinstance(source, ShippingAllocation):
            source.allocation_id = source.allocation_id or uuid.uuid4()
            key = "warehouse" if source.department is None else by_name.get(source.department)
            if key is None:
                raise InventoryConflict("INVENTORY_PLAN_CHANGED", "출하 배정 위치를 확인할 수 없습니다.")
            gate = db.get(StocktakeGate, (source.item_id, key))
            db.add(StocktakeReservationEpoch(allocation=source, item_id=source.item_id,
                scope_key=key, observation_epoch=gate.observation_epoch if gate else 0))
            continue
        if isinstance(source, TransactionLog):
            source.log_id = source.log_id or uuid.uuid4()
            kind, source_id, item_id = "transaction", source.log_id, source.item_id
            scopes = _log_scopes(source, by_name)
        else:
            source.movement_id = source.movement_id or uuid.uuid4()
            pool = db.get(DefectStockPool, source.pool_id)
            kind, source_id, item_id = "pool_movement", source.movement_id, pool.item_id
            scopes = {pool.scope_key}
        for key in sorted(scopes):
            gate = db.get(StocktakeGate, (item_id, key))
            db.add(StocktakeEffectEpoch(source_kind=kind, source_id=source_id, item_id=item_id, scope_key=key,
                                        observation_epoch=gate.observation_epoch if gate else 0))


def assert_unobserved(db: Session, logs: list[TransactionLog], movements: list[DefectStockMovement]) -> None:
    """Compare every source cell, never the net effect or the operation's current stock."""
    control = db.get(StocktakeControl, 1)
    if control is None or control.inventory_mode != "POOL":
        return
    by_name = {row.physical_department: row.scope_key for row in db.query(InventoryScope).all()}
    sources = [("transaction", log.log_id, log.item_id, key) for log in logs for key in _log_scopes(log, by_name)]
    from app.services.business_correction_lineage import assert_not_corrected
    assert_not_corrected(db, logs)
    for movement in movements:
        pool = db.get(DefectStockPool, movement.pool_id)
        sources.append(("pool_movement", movement.movement_id, pool.item_id, pool.scope_key))
    crossed = []
    for kind, source_id, item_id, key in sources:
        gate = db.get(StocktakeGate, (item_id, key))
        observed = db.get(StocktakeEffectEpoch, (kind, source_id, key))
        before = observed.observation_epoch if observed else 0
        now = gate.observation_epoch if gate else 0
        if before != now:
            crossed.append({"item_id": str(item_id), "scope_id": key, "source_epoch": before, "current_epoch": now})
    if crossed:
        raise InventoryConflict("STOCKTAKE_OBSERVED_EFFECT", "전수조사로 확인한 재고를 과거 거래로 역산할 수 없습니다. 업무 정정 절차를 확인해 주세요.", extra={"cells": crossed})
