"""Transaction-scoped stock fences; callers declare all items before leaf locks."""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from decimal import Decimal
from typing import Literal

from sqlalchemy import event
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session, SessionTransaction

from app.models import Inventory, InventoryScope, Item, StocktakeControl, StocktakeGate, StocktakeProgress
from app.services.inventory_conflicts import InventoryConflict

STATE_KEY = "_stocktake_write_plan"
SAVEPOINT_KEY = "_stocktake_savepoints"


@event.listens_for(Session, "before_flush")
def _capture_observation_epochs(db: Session, _context: object, _instances: object) -> None:
    """New physical effects retain the observation boundary under the same locks."""
    from app.services.stocktake_observation import capture
    from app.services.stocktake_lifecycle import capture_catalog_changes
    capture_catalog_changes(db)
    capture(db)


def lock_control(db: Session, *, exclusive: bool = False) -> StocktakeControl | None:
    """Acquire control first; an exclusive caller must never upgrade a shared lock."""
    state = db.info.get(STATE_KEY)
    if state is not None and state["transaction"] is db.get_transaction():
        if exclusive and not state["exclusive"]:
            raise InventoryConflict("INVENTORY_PLAN_CHANGED", "전용 잠금이 필요한 작업입니다. 새 트랜잭션에서 다시 시도해 주세요.")
        return state["control"]
    query = db.query(StocktakeControl).filter_by(id=1)
    if db.get_bind().dialect.name != "sqlite":
        query = query.with_for_update(read=not exclusive)
    control = query.populate_existing().one_or_none()
    db.info[STATE_KEY] = {"transaction": db.get_transaction(), "control": control, "exclusive": exclusive,
                          "items": None, "scopes": {}, "gates": {}, "revisions": set(), "progress": set()}
    return control


def prepare_items(db: Session, item_ids: Iterable[uuid.UUID]) -> None:
    """Lock Item → Inventory → all canonical scopes' Gates, once per whole command.

    Declaring every scope of each affected item permits route changes without late
    lock expansion; record_change checks only cells actually being changed.
    """
    control = lock_control(db)
    if control is None or control.inventory_mode != "POOL":
        return
    state = db.info[STATE_KEY]
    ids = {uuid.UUID(str(value)) for value in item_ids}
    if not ids:
        return
    if state["items"] is not None:
        if not ids.issubset(state["items"]):
            raise InventoryConflict("INVENTORY_PLAN_CHANGED", "업무 대상이 변경되었습니다. 새로고침 후 다시 시도해 주세요.")
        return
    ordered = sorted(ids, key=str)
    sqlite = db.get_bind().dialect.name == "sqlite"
    items = db.query(Item).filter(Item.item_id.in_(ordered)).order_by(Item.item_id)
    parents = db.query(Inventory).filter(Inventory.item_id.in_(ordered)).order_by(Inventory.item_id)
    if not sqlite:
        items, parents = items.with_for_update(), parents.with_for_update()
    if len(items.populate_existing().all()) != len(ids):
        raise InventoryConflict("INVENTORY_PLAN_CHANGED", "업무 대상 품목을 다시 확인해 주세요.")
    existing = {row.item_id for row in parents.populate_existing().all()}
    for item_id in ordered:
        if item_id not in existing:
            db.add(Inventory(item_id=item_id, quantity=0, warehouse_qty=0, pending_quantity=0))
    db.flush()
    scopes = db.query(InventoryScope).order_by(InventoryScope.scope_key).all()
    query = db.query(StocktakeGate).filter(StocktakeGate.item_id.in_(ordered)).order_by(
        StocktakeGate.item_id, StocktakeGate.scope_key)
    if not sqlite:
        query = query.with_for_update()
    gates = {(row.item_id, row.scope_key): row for row in query.populate_existing().all()}
    for item_id in ordered:
        for scope in scopes:
            key = (item_id, scope.scope_key)
            if key not in gates:
                gates[key] = StocktakeGate(item_id=item_id, scope_key=scope.scope_key)
                db.add(gates[key])
    db.flush()
    state.update(items=ids, scopes={s.physical_department: s.scope_key for s in scopes}, gates=gates)


def record_change(
    db: Session, item_id: uuid.UUID, department: object, *,
    kind: Literal["quantity", "category", "reservation"], delta: int | Decimal,
) -> None:
    """Reject occupied cells and track revisions in the caller's atomic transaction."""
    if delta == 0:
        return
    control = lock_control(db)
    if control is None or control.inventory_mode != "POOL":
        return
    state = db.info[STATE_KEY]
    scope_key = state["scopes"].get(str(getattr(department, "value", department)))
    gate = state["gates"].get((item_id, scope_key))
    if gate is None:
        raise InventoryConflict("INVENTORY_PLAN_CHANGED", "재고 변경 위치가 사전 계획과 다릅니다. 다시 시도해 주세요.")
    active = (control.active_round_id is not None and gate.active_count_id is not None
              and gate.round_id == control.active_round_id and gate.round_epoch == control.epoch)
    if active and (kind != "reservation" or delta > 0):
        raise InventoryConflict("STOCKTAKE_CELL_LOCKED", "전수조사 중인 위치입니다. 확인 또는 계수 해제 후 다시 시도해 주세요.",
                                status_code=423, extra={"item_id": str(item_id), "scope_key": scope_key,
                                                       "fence": gate.fence, "round_id": str(gate.round_id)})
    field = "reservation_revision" if kind == "reservation" else "quantity_revision"
    revision_key = (item_id, scope_key, field)
    if revision_key not in state["revisions"]:
        setattr(gate, field, getattr(gate, field) + 1)
        state["revisions"].add(revision_key)
    if active and kind == "reservation":
        state["progress"].add((gate.round_id, scope_key))
    state.setdefault("membership_ids", set()).add(item_id)


@event.listens_for(Session, "before_commit")
def flush_progress(db: Session) -> None:
    """Lock progress only after stock/allocation leaves, in a stable scope order."""
    if db.in_nested_transaction():
        return
    db.flush()
    from app.services.stocktake_lifecycle import flush_pending
    flush_pending(db)
    state = db.info.get(STATE_KEY)
    if not state or not state["progress"]:
        return
    db.flush()
    insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else pg_insert
    for round_id, scope_key in sorted(state["progress"], key=lambda key: (str(key[0]), key[1])):
        statement = insert(StocktakeProgress).values(round_id=round_id, scope_key=scope_key, progress_revision=1)
        db.execute(statement.on_conflict_do_update(
            index_elements=[StocktakeProgress.round_id, StocktakeProgress.scope_key],
            set_={"progress_revision": StocktakeProgress.progress_revision + 1}))
    state["progress"].clear()


@event.listens_for(Session, "after_transaction_create")
def _snapshot_savepoint(db: Session, transaction: SessionTransaction) -> None:
    """Savepoint rollback restores both ORM values and the matching revision memo."""
    if not transaction.nested:
        return
    state = db.info.get(STATE_KEY)
    snapshot = None if state is None else {
        key: value.copy() if isinstance(value, (set, dict)) else value
        for key, value in state.items()
    }
    db.info.setdefault(SAVEPOINT_KEY, {})[transaction] = snapshot


@event.listens_for(Session, "after_soft_rollback")
def _restore_savepoint(db: Session, transaction: SessionTransaction) -> None:
    """Locks acquired inside a failed savepoint must be prepared again."""
    if not transaction.nested:
        return
    snapshot = db.info.get(SAVEPOINT_KEY, {}).pop(transaction, None)
    if snapshot is None:
        db.info.pop(STATE_KEY, None)
    else:
        db.info[STATE_KEY] = snapshot


@event.listens_for(Session, "after_transaction_end")
def _clear_plan(db: Session, transaction: SessionTransaction) -> None:
    """A commit/rollback cannot leave a stale control snapshot or prepared item set."""
    if transaction.parent is None:
        db.info.pop(STATE_KEY, None)
        db.info.pop(SAVEPOINT_KEY, None)
