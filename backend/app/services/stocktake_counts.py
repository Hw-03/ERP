"""Short atomic count commands; the human counting interval holds no transaction."""
from datetime import datetime
import uuid

from sqlalchemy.orm import Session

from app.models import (DefectStockPool, Employee, InventoryLocation, InventoryScope, LocationStatusEnum,
                        StocktakeCount, StocktakeGate, StocktakeTarget, StocktakeTargetSet)
from app.services import stock_availability, stocktake_guard, warehouse_map
from app.services.inventory_conflicts import InventoryConflict
from app.services.stocktake_common import CATEGORIES, active_round, append_event, require_admin


def lock_target(db: Session, target_id: uuid.UUID) -> tuple[StocktakeTarget, object]:
    """Target precedes Item/Inventory/Gate; counts in unactivated sets are inaccessible."""
    query = db.query(StocktakeTarget).filter_by(target_id=target_id)
    if db.get_bind().dialect.name != "sqlite":
        query = query.with_for_update()
    target = query.populate_existing().one_or_none()
    target_set = db.get(StocktakeTargetSet, target.set_id) if target else None
    if target is None or target_set.round_id is None:
        raise InventoryConflict("NOT_FOUND", "조사 대상을 찾을 수 없습니다.", status_code=404)
    row = active_round(db, target_set.round_id)
    return target, row


def figures(db: Session, target: StocktakeTarget, *, lock: bool = False) -> dict:
    """Keep request pending and shipping reservations separate; never credit own reservations."""
    scope = db.get(InventoryScope, target.scope_key)
    query = db.query(InventoryLocation).filter_by(item_id=target.item_id, department=scope.physical_department).order_by(InventoryLocation.status)
    pools_query = db.query(DefectStockPool).filter_by(item_id=target.item_id, scope_key=target.scope_key).order_by(DefectStockPool.category)
    if lock and db.get_bind().dialect.name != "sqlite":
        query, pools_query = query.with_for_update(), pools_query.with_for_update()
    locations = {getattr(r.status, "value", r.status): r for r in query.populate_existing().all()}
    pools = {r.category.lower(): r for r in pools_query.populate_existing().all()}
    cell = stock_availability.AvailabilityCell.warehouse(target.item_id) if target.scope_key == "warehouse" else stock_availability.AvailabilityCell.location(target.item_id, scope.physical_department)
    normal = stock_availability.figure_for_cell(db, cell, owner_request_id=None, lock_allocations=lock)
    quantities = {"normal": int(normal.physical), **{c: int(pools[c].quantity) if c in pools else 0 for c in CATEGORIES[1:]}}
    reservations = {"normal": int(normal.stock_request_pending + normal.active_shipping_reserved),
                    **{c: int(pools[c].pending_quantity) if c in pools else 0 for c in CATEGORIES[1:]}}
    physical_defect = locations.get("DEFECTIVE")
    if (sum(quantities[c] for c in CATEGORIES[1:]) != int(physical_defect.quantity if physical_defect else 0)
            or sum(reservations[c] for c in CATEGORIES[1:]) != int(physical_defect.pending_quantity if physical_defect else 0)):
        raise InventoryConflict("STOCKTAKE_APPLY_HELD", "격리 위치 수량 또는 예약과 분류별 공동재고가 일치하지 않습니다.", status_code=422)
    return {"quantities": quantities, "reservations": reservations,
            "normal_reservations": {"stock_request": int(normal.stock_request_pending), "shipping": int(normal.active_shipping_reserved)}}


def response(count: StocktakeCount, gate: StocktakeGate, *, event_id: uuid.UUID | None = None) -> dict:
    """Count ownership and confirmation identity remain explicit after release."""
    return {"count_id": str(count.count_id), "round_id": str(count.round_id), "target_id": str(count.target_id),
            "status": count.status, "version": count.version, "fence": gate.fence,
            "owner_id": str(count.owner_id), "owner_name": count.owner_name, "quantities": count.quantities,
            "confirmation_revision_id": str(count.confirmation_revision_id) if count.confirmation_revision_id else None,
            "confirmed_at": count.confirmed_at.isoformat() + "Z" if count.confirmed_at else None,
            "event_id": str(event_id) if event_id else None}


def progress(db: Session, round_id: uuid.UUID, scope_key: str) -> None:
    """Defer the progress row lock until all quantity/reservation leaves are finished."""
    db.info[stocktake_guard.STATE_KEY]["progress"].add((round_id, scope_key))


def start(db: Session, actor: Employee, payload: dict) -> dict:
    """Acquire a fresh fence and blank attempt while retaining all older observations."""
    stocktake_guard.lock_control(db, exclusive=True)
    target, round_ = lock_target(db, uuid.UUID(payload["target_id"]))
    if target.version != payload["expected_target_version"] or round_.epoch != payload["round_epoch"]:
        raise InventoryConflict("COUNT_VERSION_CONFLICT", "조사 대상 버전이 변경되었습니다.")
    from app.services.work_stocktake_pause import pause_drafts
    pause_drafts(db, round_.round_id,
        affected_cells=[{"item_id": str(target.item_id), "scope_key": target.scope_key}],
        extra_item_ids=[target.item_id])
    gate = db.info[stocktake_guard.STATE_KEY]["gates"][(target.item_id, target.scope_key)]
    if gate.round_id == round_.round_id and gate.round_epoch == round_.epoch and gate.active_count_id:
        raise InventoryConflict("STOCKTAKE_CELL_LOCKED", "다른 계수가 진행 중입니다.", status_code=423)
    if target.scope_key == "warehouse" and warehouse_map.is_box_tracking_enabled(db):
        raise InventoryConflict("STOCKTAKE_APPLY_HELD", "창고 조사 전에 BOX 추적을 OFF로 전환해 주세요.", status_code=422)
    baseline = figures(db, target, lock=True)
    gate.fence += 1
    count = StocktakeCount(count_id=uuid.uuid4(), round_id=round_.round_id, target_id=target.target_id,
                          owner_id=actor.employee_id, owner_name=actor.name, previous_count_id=target.latest_count_id,
                          fence=gate.fence, quantity_revision=gate.quantity_revision,
                          quantities={c: None for c in CATEGORIES}, baseline=baseline["quantities"])
    db.add(count)
    db.flush()
    gate.active_count_id, gate.round_id, gate.round_epoch = count.count_id, round_.round_id, round_.epoch
    target.latest_count_id = count.count_id
    target.version += 1
    event = append_event(db, actor, round_.round_id, "RECOUNT_STARTED" if count.previous_count_id else "COUNT_STARTED",
                         {"version": count.version, "fence": count.fence, "baseline": count.baseline,
                          "previous_count_id": str(count.previous_count_id) if count.previous_count_id else None}, count.count_id)
    progress(db, round_.round_id, target.scope_key)
    return response(count, gate, event_id=event.event_id)


def change(db: Session, actor: Employee, kind: str, payload: dict) -> dict:
    """Validate actor, optimistic version and fence before altering one count revision."""
    count = db.get(StocktakeCount, uuid.UUID(payload["count_id"]))
    if count is None:
        raise InventoryConflict("NOT_FOUND", "계수를 찾을 수 없습니다.", status_code=404)
    target, round_ = lock_target(db, count.target_id)
    stocktake_guard.prepare_items(db, [target.item_id])
    db.refresh(count)
    gate = db.info[stocktake_guard.STATE_KEY]["gates"][(target.item_id, target.scope_key)]
    if kind == "count_force_release":
        require_admin(actor)
    elif count.owner_id != actor.employee_id:
        raise InventoryConflict("NOT_COUNT_OWNER", "현재 계수자만 수정할 수 있습니다.", status_code=403)
    if (count.version != payload["expected_version"] or count.fence != payload["fence"]
            or gate.fence != count.fence or gate.active_count_id != count.count_id
            or gate.round_id != round_.round_id or gate.round_epoch != round_.epoch or target.latest_count_id != count.count_id):
        raise InventoryConflict("COUNT_VERSION_CONFLICT", "저장 버전 또는 계수 자격이 변경되었습니다.", extra={"version": count.version, "fence": gate.fence})
    allowed = {"count_save": {"DRAFT"}, "count_confirm": {"DRAFT"}, "count_resume": {"CONFIRMED"},
               "count_abandon": {"DRAFT", "CONFIRMED"}, "count_force_release": {"DRAFT", "CONFIRMED"}}
    if count.status not in allowed[kind]:
        raise InventoryConflict("COUNT_VERSION_CONFLICT", "현재 계수 상태에서는 처리할 수 없습니다.")
    invalidated = str(count.confirmation_revision_id) if count.confirmation_revision_id else None
    event_id = uuid.uuid4()
    if kind == "count_save":
        count.quantities = payload["quantities"]
        event_kind = "DRAFT_SAVED"
    elif kind == "count_confirm":
        if any(value is None for value in count.quantities.values()):
            raise InventoryConflict("STOCKTAKE_APPLY_HELD", "네 분류를 모두 입력하거나 0개로 확인해 주세요.", status_code=422)
        if gate.quantity_revision != count.quantity_revision or figures(db, target, lock=True)["quantities"] != count.baseline:
            raise InventoryConflict("COUNT_VERSION_CONFLICT", "계수 중 장부 수량이 변경되었습니다. 포기 후 새로 계수해 주세요.")
        count.status, count.confirmation_revision_id, count.confirmed_at = "CONFIRMED", event_id, datetime.utcnow()
        event_kind = "COUNT_CONFIRMED"
    elif kind == "count_resume":
        count.status, count.confirmation_revision_id, count.confirmed_at = "DRAFT", None, None
        event_kind = "CONFIRMATION_CANCELLED" if payload["reason_code"] == "CANCEL_CONFIRMATION" else "EDIT_RESUMED"
    else:
        count.status, count.confirmation_revision_id = "ABANDONED", None
        gate.active_count_id = None
        gate.fence += 1
        event_kind = "COUNT_FORCE_RELEASED" if kind == "count_force_release" else "COUNT_ABANDONED"
    previous_version = count.version
    count.version += 1
    target.version += 1
    event = append_event(db, actor, round_.round_id, event_kind, {
        "previous_version": previous_version, "version": count.version, "fence": gate.fence,
        "quantities": count.quantities, "confirmation_revision_id": str(count.confirmation_revision_id) if count.confirmation_revision_id else None,
        "invalidated_confirmation_revision_id": invalidated if kind in {"count_resume", "count_abandon", "count_force_release"} else None,
        "reason_code": payload.get("reason_code"), "reason": payload.get("reason")}, count.count_id, event_id)
    progress(db, round_.round_id, target.scope_key)
    return response(count, gate, event_id=event.event_id)
