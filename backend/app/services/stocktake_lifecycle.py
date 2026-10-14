"""Preserve active target identities and remember newly eligible cells on commit."""
from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models import Department, InventoryScope, Item, StocktakeControl, StocktakePendingTarget, StocktakeTarget
from app.services.inventory_conflicts import InventoryConflict
from app.services.inventory_scope import describe_scope
from app.services.stocktake_target_policy import round_policy


def capture_catalog_changes(db: Session) -> None:
    """Block destructive identity changes before flush and queue narrow candidate checks."""
    rows = [r for r in db.new.union(db.dirty).union(db.deleted) if isinstance(r, (Item, Department))]
    if not rows:
        return
    control = db.get(StocktakeControl, 1)
    if control is None or control.inventory_mode != "POOL":
        return
    from app.services import stocktake_guard
    stocktake_guard.lock_control(db)
    state = db.info[stocktake_guard.STATE_KEY]
    for row in rows:
        if control.active_round_id is not None and row in db.deleted:
            raise InventoryConflict("TARGET_SET_CHANGED", "활성 조사 중에는 품목과 위치를 물리 삭제할 수 없습니다.")
        if isinstance(row, Item):
            if row not in db.new and inspect(row).attrs.unit.history.has_changes() and control.active_round_id:
                raise InventoryConflict("TARGET_SET_CHANGED", "활성 조사 중에는 품목 단위를 변경할 수 없습니다.")
            if row in db.new or any(inspect(row).attrs[field].history.has_changes()
                                    for field in ("deleted_at", "process_type_code", "legacy_item_type")):
                state.setdefault("catalog_items", set()).add(row)
        else:
            if row not in db.new and inspect(row).attrs.name.history.has_changes() and control.active_round_id:
                raise InventoryConflict("TARGET_SET_CHANGED", "활성 조사 중에는 위치명을 변경할 수 없습니다.")
            if row in db.new or inspect(row).attrs.is_active.history.has_changes():
                state.setdefault("catalog_departments", set()).add(row)


def flush_pending(db: Session) -> None:
    """Run after leaves and before progress; existing admitted cells need no full scan."""
    from app.services import stocktake_guard, stocktake_targets
    state = db.info.get(stocktake_guard.STATE_KEY)
    if not state:
        return
    departments = state.pop("catalog_departments", set())
    items = state.pop("catalog_items", set())
    item_ids = state.pop("membership_ids", set()) | {row.item_id for row in items}
    for department in departments:
        descriptor = describe_scope(department)
        if db.get(InventoryScope, descriptor.scope_key) is None:
            db.add(InventoryScope(scope_key=descriptor.scope_key, department_id=descriptor.department_id,
                                  physical_department=descriptor.physical_department))
    db.flush()
    control = state["control"]
    if control is None or control.active_round_id is None or (not departments and not item_ids):
        return
    query = stocktake_targets.round_targets(db, control.active_round_id)
    if not departments:
        query = query.filter(StocktakeTarget.item_id.in_(item_ids))
    admitted_rows = query.all()
    admitted = {(row.item_id, row.scope_key) for row in admitted_rows}
    if not departments:
        scope_keys = {row.scope_key for row in db.query(InventoryScope).all()}
        item_ids = {item_id for item_id in item_ids if any((item_id, key) not in admitted for key in scope_keys)}
        if not item_ids:
            return
    candidates = stocktake_targets.candidate_rows(db, None if departments else item_ids,
        policy=round_policy(db, control.active_round_id), validate=False,
        code_snapshots={row.item_id: row.item_code for row in admitted_rows})
    insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else pg_insert
    from uuid import UUID
    for row in candidates:
        item_id = UUID(row["item_id"])
        if (item_id, row["scope_key"]) not in admitted:
            inserted = db.execute(insert(StocktakePendingTarget).values(round_id=control.active_round_id, item_id=item_id,
                scope_key=row["scope_key"], snapshot=row).on_conflict_do_nothing(
                    index_elements=[StocktakePendingTarget.round_id, StocktakePendingTarget.item_id, StocktakePendingTarget.scope_key]))
            if inserted.rowcount:
                state["progress"].add((control.active_round_id, row["scope_key"]))
