"""Atomic selected observations, with bounded effects and sealed revision vectors."""
from datetime import datetime
import uuid

from sqlalchemy.orm import Session

from app.models import (Employee, Inventory, InventoryLocation, InventoryOperation, InventoryOperationRoleEnum, InventoryScope,
                        LocationStatusEnum, StocktakeApplication, StocktakeApplicationLine, StocktakeCount,
                        StocktakeGate, StocktakeTarget, TransactionLog, TransactionTypeEnum)
from app.services import defect_pool, inv_effect, inventory_operations, stocktake_counts, stocktake_guard
from app.services.inventory_conflicts import InventoryConflict
from app.services.stocktake_common import CATEGORIES, active_round, append_event, fingerprint, open_preview, preview_response, seal

MAX_TARGETS = 100
MAX_EFFECTS = 400


def selected_rows(db: Session, round_id: uuid.UUID, confirmation_ids: list[str], *, lock: bool = True,
                  max_scopes: int = 1, max_targets: int = MAX_TARGETS) -> list[tuple[StocktakeTarget, StocktakeCount, StocktakeGate]]:
    """Lock the entire selection before any leaf; never drop an invalid selection."""
    ids = {uuid.UUID(value) for value in confirmation_ids}
    if not ids or len(ids) != len(confirmation_ids) or len(ids) > max_targets:
        raise InventoryConflict("SCALE_LIMIT", "한 위치에서 최대 100개 확인 결과를 중복 없이 선택해 주세요.", status_code=422)
    counts = db.query(StocktakeCount).filter(StocktakeCount.confirmation_revision_id.in_(ids), StocktakeCount.round_id == round_id).all()
    if len(counts) != len(ids):
        raise InventoryConflict("PREVIEW_STALE", "선택한 확인 결과가 취소되었거나 변경되었습니다.")
    query = db.query(StocktakeTarget).filter(StocktakeTarget.target_id.in_([c.target_id for c in counts])).order_by(StocktakeTarget.target_id)
    if lock and db.get_bind().dialect.name != "sqlite":
        query = query.with_for_update()
    targets = {t.target_id: t for t in query.populate_existing().all()}
    if len({t.scope_key for t in targets.values()}) > max_scopes:
        raise InventoryConflict("SCALE_LIMIT", "같은 위치의 확인 결과만 함께 반영할 수 있습니다.", status_code=422)
    if lock:
        stocktake_guard.prepare_items(db, [t.item_id for t in targets.values()])
    round_ = active_round(db, round_id)
    result = []
    for count in sorted(counts, key=lambda c: (str(targets[c.target_id].item_id), targets[c.target_id].scope_key)):
        db.refresh(count)
        target = targets[count.target_id]
        gate = (db.info[stocktake_guard.STATE_KEY]["gates"][(target.item_id, target.scope_key)] if lock
                else db.get(StocktakeGate, (target.item_id, target.scope_key)))
        if (gate is None or count.status != "CONFIRMED" or count.confirmation_revision_id not in ids
                or target.latest_count_id != count.count_id or gate.active_count_id != count.count_id
                or gate.fence != count.fence or gate.round_id != round_id or gate.round_epoch != round_.epoch
                or gate.quantity_revision != count.quantity_revision):
            raise InventoryConflict("PREVIEW_STALE", "확인 버전 또는 계수 자격이 변경되었습니다.")
        result.append((target, count, gate))
    return result


def manifest(db: Session, round_id: uuid.UUID, rows: list[tuple[StocktakeTarget, StocktakeCount, StocktakeGate]], *,
             lock: bool = True, max_effects: int | None = MAX_EFFECTS) -> dict:
    """Reserve each category separately and include all state that makes an apply valid."""
    round_ = active_round(db, round_id)
    entries = []
    effect_count = 0
    for target, count, gate in rows:
        current = stocktake_counts.figures(db, target, lock=lock)
        if current["quantities"] != count.baseline or any(count.quantities[c] is None for c in CATEGORIES):
            raise InventoryConflict("PREVIEW_STALE", "확인된 장부 기준이 변경되었습니다.")
        deltas = {c: count.quantities[c] - current["quantities"][c] for c in CATEGORIES}
        effect_count += int(deltas["normal"] != 0) + int(sum(deltas[c] for c in CATEGORIES[1:]) != 0) + sum(deltas[c] != 0 for c in CATEGORIES[1:])
        held = [{"code": "RESERVATION_SHORTAGE", "category": c, "counted": count.quantities[c], "reserved": current["reservations"][c]}
                for c in CATEGORIES if count.quantities[c] < current["reservations"][c]]
        total_after = int(db.query(Inventory.quantity).filter_by(item_id=target.item_id).scalar()) + sum(deltas.values())
        if not 0 <= total_after <= defect_pool.MAX_QUANTITY:
            held.append({"code": "TOTAL_OUT_OF_RANGE", "total_after": total_after})
        entries.append({"target_id": str(target.target_id), "count_id": str(count.count_id), "item_id": str(target.item_id),
            "scope_id": target.scope_key, "confirmation_revision_id": str(count.confirmation_revision_id),
            "confirmed_by": str(count.owner_id), "confirmed_name": count.owner_name,
            "confirmed_at": count.confirmed_at.isoformat() + "Z", "version": count.version, "fence": gate.fence,
            "quantity_revision": gate.quantity_revision, "reservation_revision": gate.reservation_revision,
            "observation_epoch": gate.observation_epoch, "before": current["quantities"], "after": count.quantities,
            "deltas": deltas, "reservations": current["reservations"], "normal_reservations": current["normal_reservations"], "held": held})
    if max_effects is not None and effect_count > max_effects:
        raise InventoryConflict("SCALE_LIMIT", "변경 효과가 400개를 초과합니다. 선택을 나누어 주세요.", status_code=422)
    return {"round_id": str(round_id), "epoch": round_.epoch, "target_generation": round_.target_generation,
            "scope_id": rows[0][0].scope_key, "entries": entries, "effect_count": effect_count,
            "can_apply": not any(entry["held"] for entry in entries)}


def _apply_quantities(db: Session, actor: Employee, target: StocktakeTarget, entry: dict, operation: object) -> None:
    """Only this already validated, locked cell has had its gate released in this transaction."""
    scope = db.get(InventoryScope, target.scope_key)
    before_cells = inv_effect.snapshot_cells(db, target.item_id)
    inventory = db.query(Inventory).filter_by(item_id=target.item_id).one()
    total_before = int(inventory.quantity)
    normal_delta = entry["deltas"]["normal"]
    defect_delta = sum(entry["deltas"][c] for c in CATEGORIES[1:])
    if normal_delta:
        stocktake_guard.record_change(db, target.item_id, scope.physical_department, kind="quantity", delta=normal_delta)
        if target.scope_key == "warehouse":
            inventory.warehouse_qty = entry["after"]["normal"]
        else:
            location = db.query(InventoryLocation).filter_by(item_id=target.item_id, department=scope.physical_department, status=LocationStatusEnum.PRODUCTION).one_or_none()
            if location is None:
                location = InventoryLocation(item_id=target.item_id, department=scope.physical_department, status=LocationStatusEnum.PRODUCTION, quantity=0)
                db.add(location)
            location.quantity = entry["after"]["normal"]
    if defect_delta:
        stocktake_guard.record_change(db, target.item_id, scope.physical_department, kind="quantity", delta=defect_delta)
        location = db.query(InventoryLocation).filter_by(item_id=target.item_id, department=scope.physical_department, status=LocationStatusEnum.DEFECTIVE).one_or_none()
        if location is None:
            location = InventoryLocation(item_id=target.item_id, department=scope.physical_department, status=LocationStatusEnum.DEFECTIVE, quantity=0)
            db.add(location)
        location.quantity = sum(entry["after"][c] for c in CATEGORIES[1:])
    inventory.quantity = total_before + normal_delta + defect_delta
    for category in CATEGORIES[1:]:
        delta = entry["deltas"][category]
        if delta:
            pool = defect_pool.get_pool(db, item_id=target.item_id, department=scope.physical_department, category=category.upper(), create=True)
            defect_pool.apply_delta(db, pool=pool, delta=delta, operation=operation, reason="STOCKTAKE_OBSERVATION")
    if normal_delta or defect_delta:
        log = TransactionLog(item_id=target.item_id, transaction_type=TransactionTypeEnum.ADJUST,
            quantity_change=normal_delta + defect_delta, quantity_before=total_before, quantity_after=inventory.quantity,
            department=scope.physical_department, produced_by=actor.name, producer_employee_id=actor.employee_id,
            notes=operation.display_label, **inv_effect.capture_log_stock_snapshot(db, target.item_id, before_cells))
        db.add(inventory_operations.attach_transaction(log, operation, InventoryOperationRoleEnum.CORRECTION))
    db.flush()


def require_owned(actor: Employee, rows: list[tuple[StocktakeTarget, StocktakeCount, StocktakeGate]]) -> None:
    """Ordinary apply may only consume the authenticated employee's confirmations."""
    if any(count.owner_id != actor.employee_id for _, count, _ in rows):
        raise InventoryConflict("FORBIDDEN", "본인이 확인한 결과만 반영할 수 있습니다.", status_code=403)


def execute(db: Session, actor: Employee, kind: str, payload: dict, receipt_id: uuid.UUID) -> dict:
    """All selected rows succeed together; zero differences still create observations."""
    round_id = uuid.UUID(payload["round_id"])
    active_round(db, round_id)
    if kind == "application_preview":
        rows = selected_rows(db, round_id, payload["confirmation_revision_ids"])
        require_owned(actor, rows)
        return preview_response(seal(db, actor, "application", manifest(db, round_id, rows), round_id))
    preview = open_preview(db, payload, "application")
    if preview.actor_id != actor.employee_id:
        raise InventoryConflict("FORBIDDEN", "본인의 미리보기만 반영할 수 있습니다.", status_code=403)
    if preview.round_id != round_id:
        raise InventoryConflict("PREVIEW_STALE", "다른 회차의 미리보기입니다.")
    rows = selected_rows(db, round_id, [e["confirmation_revision_id"] for e in preview.payload["entries"]])
    require_owned(actor, rows)
    current = manifest(db, round_id, rows)
    if fingerprint(current) != preview.preview_hash:
        raise InventoryConflict("PREVIEW_STALE", "수량·예약·확인 버전이 변경되었습니다. 다시 미리보기를 확인해 주세요.")
    if not current["can_apply"]:
        raise InventoryConflict("STOCKTAKE_APPLY_HELD", "예약 부족 또는 수량 제한으로 선택 전체의 반영이 보류되었습니다.", status_code=422,
                                extra={"entries": [e for e in current["entries"] if e["held"]]})
    return apply_manifest(db, actor, rows, current, preview.preview_id, receipt_id)


def apply_manifest(db: Session, actor: Employee,
                   rows: list[tuple[StocktakeTarget, StocktakeCount, StocktakeGate]], current: dict,
                   preview_id: uuid.UUID, receipt_id: uuid.UUID) -> dict:
    """Apply an already revalidated, locked selection inside the caller's transaction."""
    application, operation = begin_application(db, actor, current, preview_id, receipt_id)
    for row, entry in zip(rows, current["entries"]):
        apply_cell(db, actor, row, entry, application, operation)
    return application_response(application, rows, current)


def begin_application(db: Session, actor: Employee, current: dict, preview_id: uuid.UUID,
                      receipt_id: uuid.UUID) -> tuple[StocktakeApplication, InventoryOperation]:
    """Create one location's typed evidence before applying its already locked cells."""
    round_id = uuid.UUID(current["round_id"])
    operation = inventory_operations.create_business_operation(db, domain="stocktake", action="apply",
        display_label="창고 전수조사" if current["scope_id"] == "warehouse" else "부서 전수조사",
        actor_name=actor.name, actor_employee_id=actor.employee_id,
        department=db.get(InventoryScope, current["scope_id"]).physical_department, idempotency_key=f"stocktake:{receipt_id}")
    if operation is None:
        raise InventoryConflict("STOCKTAKE_APPLY_HELD", "작업 원장이 활성화되어 있지 않습니다.", status_code=422)
    application = StocktakeApplication(application_id=uuid.uuid4(), round_id=round_id, preview_id=preview_id,
                                      operation_id=operation.operation_id, actor_id=actor.employee_id, scope_key=current["scope_id"])
    db.add(application)
    db.flush()
    return application, operation


def apply_cell(db: Session, actor: Employee, row: tuple[StocktakeTarget, StocktakeCount, StocktakeGate],
               entry: dict, application: StocktakeApplication, operation: InventoryOperation) -> None:
    """An atomic caller can apply reductions first across several location applications."""
    target, count, gate = row
    gate.active_count_id = None
    gate.fence += 1
    _apply_quantities(db, actor, target, entry, operation)
    gate.observation_epoch += 1
    db.add(StocktakeApplicationLine(application_id=application.application_id, count_id=count.count_id,
        confirmation_revision_id=count.confirmation_revision_id, item_id=target.item_id, scope_key=target.scope_key,
        before_quantities=entry["before"], after_quantities=entry["after"], reservations=entry["reservations"],
        observation_epoch_before=entry["observation_epoch"], observation_epoch_after=gate.observation_epoch))
    count.status = "APPLIED"
    count.version += 1
    target.version += 1
    append_event(db, actor, application.round_id, "COUNT_APPLIED", {"application_id": str(application.application_id),
        "confirmation_revision_id": str(count.confirmation_revision_id), "version": count.version,
        "fence": gate.fence, "observation_epoch": gate.observation_epoch}, count.count_id)
    stocktake_counts.progress(db, application.round_id, target.scope_key)


def application_response(application: StocktakeApplication,
                         rows: list[tuple[StocktakeTarget, StocktakeCount, StocktakeGate]], current: dict) -> dict:
    """Return original selection order independently of the safe physical update order."""
    return {"application_id": str(application.application_id), "operation_id": str(application.operation_id),
            "confirmation_revision_ids": [entry["confirmation_revision_id"] for entry in current["entries"]],
            "observations": [{"item_id": str(t.item_id), "scope_id": t.scope_key, "observation_epoch": g.observation_epoch} for t, _, g in rows]}
