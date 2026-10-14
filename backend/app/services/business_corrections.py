"""Correct proven workflow/reservation state without replaying historical stock."""
from datetime import datetime
from types import SimpleNamespace
import uuid

from sqlalchemy.orm import Session

from app import models as m
from app.services import business_correction_scope as scopes, inventory_operations, stocktake_counts, stocktake_guard
from app.services.inventory_conflicts import InventoryConflict
from app.services.stocktake_common import fingerprint, open_preview, preview_response, require_admin, seal


def response(row: m.BusinessCorrection) -> dict:
    """Keep the immutable request and the decided state separately visible."""
    return {"correction_id": str(row.correction_id), "version": row.version, "status": row.status,
            "atomic_group_key": row.atomic_group_key, "scope_hash": row.scope_hash,
            "source_type": row.source_type, "source_id": str(row.source_id), "target_status": row.target_status,
            "requester_id": str(row.requester_id), "requester_name": row.requester_name,
            "reason": row.reason, "evidence": row.evidence,
            "operation_id": str(row.application_operation_id) if row.application_operation_id else None}


def event(db: Session, row: m.BusinessCorrection, actor: m.Employee, kind: str, payload: dict) -> None:
    """Decisions are append-only and identify the invalidated request version."""
    db.add(m.BusinessCorrectionEvent(correction_id=row.correction_id, kind=kind,
        actor_id=actor.employee_id, actor_name=actor.name, payload=payload))


def _observation_cells(db: Session, scope: scopes.Scope) -> set[tuple[uuid.UUID, str]]:
    """Connect actual source positions to typed application evidence, not just an epoch."""
    from app.services.stocktake_observation import _log_scopes
    by_name = {r.physical_department: r.scope_key for r in db.query(m.InventoryScope).all()}
    cells = {(log.item_id, key) for log in scope.logs for key in _log_scopes(log, by_name)}
    for movement in scope.movements:
        pool = db.get(m.DefectStockPool, movement.pool_id)
        cells.add((pool.item_id, pool.scope_key))
    for allocation in scope.allocations:
        key = "warehouse" if allocation.department is None else by_name.get(allocation.department)
        if key is None:
            scopes.held("출하 배정 위치를 현재 재고 위치에 연결할 수 없습니다.")
        cells.add((allocation.item_id, key))
    for (name, _), root in scope.roots.items():
        if name in {"HandoverDoc", "StockRequest"}:
            for line in root.lines:
                if name == "StockRequest" and any(scopes.value(getattr(line, f"{direction}_bucket", None)) == "warehouse" for direction in ("from", "to")):
                    cells.add((line.item_id, "warehouse"))
                for direction in ("from_department", "to_department"):
                    location = scopes.value(getattr(line, direction, None) or getattr(root, direction, None))
                    if location in by_name:
                        cells.add((line.item_id, by_name[location]))
    return cells


def _snapshot(db: Session, scope: scopes.Scope) -> dict:
    """All item positions and both reservation systems are re-read under parent locks."""
    from app.services.inv_effect import snapshot_cells
    stocktake_guard.prepare_items(db, scope.item_ids)
    state = db.info[stocktake_guard.STATE_KEY]
    physical = []
    cells = []
    for item_id in sorted(scope.item_ids, key=str):
        amounts = snapshot_cells(db, item_id)
        pools = db.query(m.DefectStockPool).filter_by(item_id=item_id).order_by(m.DefectStockPool.pool_id).populate_existing().all()
        zones = db.query(m.WarehouseSpecialZoneItem).filter_by(item_id=item_id).order_by(m.WarehouseSpecialZoneItem.zone_id).populate_existing().all()
        physical.append({"item_id": str(item_id), "locations": sorted([(list(k), v) for k, v in amounts.items()], key=lambda r: repr(r[0])),
                         "pools": [(str(p.pool_id), int(p.quantity)) for p in pools],
                         "special_zones": [(str(z.zone_id), int(z.quantity)) for z in zones]})
        for key in sorted({g.scope_key for g in state["gates"].values()}):
            figures = stocktake_counts.figures(db, SimpleNamespace(item_id=item_id, scope_key=key), lock=True)
            gate = state["gates"][(item_id, key)]
            released = sum(int(a.quantity) for a in scope.allocations if a.status == "RESERVED" and a.item_id == item_id
                and ("warehouse" if a.department is None else state["scopes"].get(a.department)) == key)
            after_reservations = {**figures["reservations"], "normal": figures["reservations"]["normal"] - released}
            if any(after_reservations[c] < 0 or figures["quantities"][c] < after_reservations[c] for c in after_reservations):
                scopes.held("정정 후에도 현재 재고와 유효 예약이 맞지 않습니다. 다른 요청의 예약 증빙을 확인해 주세요.")
            cells.append({"item_id": str(item_id), "scope_id": key, **figures, "after_reservations": after_reservations,
                          "quantity_revision": gate.quantity_revision, "reservation_revision": gate.reservation_revision,
                          "observation_epoch": gate.observation_epoch})
    from app.services.stocktake_observation import _log_scopes
    by_name = {r.physical_department: r.scope_key for r in db.query(m.InventoryScope).all()}
    source_cells = [("transaction", log.log_id, log.item_id, key)
                    for log in scope.logs for key in _log_scopes(log, by_name)]
    for movement in scope.movements:
        pool = db.get(m.DefectStockPool, movement.pool_id)
        source_cells.append(("pool_movement", movement.movement_id, pool.item_id, pool.scope_key))
    crossed_cells = set()
    for kind, source_id, item_id, key in source_cells:
        captured = db.get(m.StocktakeEffectEpoch, (kind, source_id, key))
        source_epoch = captured.observation_epoch if captured else 0
        if source_epoch < state["gates"][(item_id, key)].observation_epoch:
            crossed_cells.add((item_id, key))
    if not source_cells:
        for allocation in scope.allocations:
            captured = db.get(m.StocktakeReservationEpoch, allocation.allocation_id)
            key = "warehouse" if allocation.department is None else by_name.get(allocation.department)
            before = captured.observation_epoch if captured else 0
            if key is not None and before < state["gates"][(allocation.item_id, key)].observation_epoch:
                crossed_cells.add((allocation.item_id, key))
    if not crossed_cells:
        scopes.held("원거래 이후에 적용된 실사 증빙이 없습니다. 기존 취소 절차를 확인해 주세요.")
    observations = []
    for item_id, key in sorted(_observation_cells(db, scope), key=lambda r: (str(r[0]), r[1])):
        gate = state["gates"][(item_id, key)]
        if gate.observation_epoch == 0 or (item_id, key) not in crossed_cells:
            continue
        line = db.query(m.StocktakeApplicationLine).filter_by(item_id=item_id, scope_key=key,
            observation_epoch_after=gate.observation_epoch).one_or_none()
        if line is None:
            scopes.held("실사 경계에 연결된 불변 반영 증빙이 없습니다. 조사 이력을 확인해 주세요.")
        observations.append({"application_id": str(line.application_id), "confirmation_revision_id": str(line.confirmation_revision_id),
                             "item_id": str(item_id), "scope_id": key, "observation_epoch": gate.observation_epoch})
    if not observations:
        scopes.held("영향 위치의 실사 적용 증빙이 없습니다. 기존 취소 절차 또는 현재 시점의 정상 업무를 확인해 주세요.")
    return {"physical": physical, "cells": cells, "observations": observations}


def _load(db: Session, payload: dict) -> m.BusinessCorrection:
    """Lock one request before its roots; version protects approval/rejection races."""
    query = db.query(m.BusinessCorrection).filter_by(correction_id=uuid.UUID(payload["correction_id"]))
    if db.get_bind().dialect.name != "sqlite":
        query = query.with_for_update()
    row = query.populate_existing().one_or_none()
    if row is None:
        raise InventoryConflict("NOT_FOUND", "업무 정정 요청을 찾을 수 없습니다.", status_code=404)
    if row.status != "REQUESTED" or row.version != payload["expected_version"]:
        raise InventoryConflict("CORRECTION_VERSION_CONFLICT", "정정 요청 상태 또는 버전이 변경되었습니다.")
    return row


def _request(db: Session, actor: m.Employee, payload: dict) -> dict:
    """Freeze the whole original group before any administrative decision."""
    scope = scopes.resolve(db, payload["source_type"], uuid.UUID(payload["source_id"]), lock=True)
    scopes.authorize(actor, scope)
    scopes.validate_eligible(db, scope, payload["target_status"])
    snapshot = _snapshot(db, scope)
    row = m.BusinessCorrection(correction_id=uuid.uuid4(), source_type=payload["source_type"], source_id=uuid.UUID(payload["source_id"]),
        atomic_group_key=scope.manifest["atomic_group_key"], scope=scope.manifest, scope_hash=fingerprint(scope.manifest),
        target_status=payload["target_status"], reason=payload["reason"], evidence=payload["evidence"], requester_id=actor.employee_id, requester_name=actor.name)
    db.add(row)
    db.flush()
    event(db, row, actor, "REQUESTED", {"version": row.version, "scope_hash": row.scope_hash, "observations": snapshot["observations"]})
    return response(row)


def _current(db: Session, row: m.BusinessCorrection) -> tuple[scopes.Scope, dict]:
    """Group changes require a fresh request; quantity-only changes a fresh preview."""
    scope = scopes.resolve(db, row.source_type, row.source_id, lock=True)
    if fingerprint(scope.manifest) != row.scope_hash:
        raise InventoryConflict("CORRECTION_SCOPE_CHANGED", "원업무 상태·구성 또는 후속 업무가 변경되었습니다. 변경된 집합으로 새 정정을 요청해 주세요.")
    requester = db.get(m.Employee, row.requester_id)
    if requester is None or not requester.is_active:
        raise InventoryConflict("FORBIDDEN", "원요청자의 활성 상태와 정정 자격을 다시 확인해 주세요.", status_code=403)
    scopes.authorize(requester, scope)
    scopes.validate_eligible(db, scope, row.target_status)
    return scope, {"correction_id": str(row.correction_id), "correction_version": row.version,
                   "scope_hash": row.scope_hash, "target_status": row.target_status, **_snapshot(db, scope)}


def _record(db: Session, operation: m.InventoryOperation, subject: object, before: dict, *, allocation: bool = False) -> m.InventoryOperationEffect:
    """Record only the actual nonphysical change, never a stock reversal relation."""
    key = subject.allocation_id if allocation else getattr(subject, scopes.ROOT_KEYS[type(subject).__name__])
    effect = inventory_operations.record_effect(db, operation=operation,
        effect_kind="ALLOCATION" if allocation else "WORKFLOW", subject_type=type(subject).__name__, subject_id=key,
        role="BUSINESS_CORRECTION", before_state=before, after_state=scopes.state(subject))
    db.flush()
    return effect


def _apply(db: Session, actor: m.Employee, row: m.BusinessCorrection, scope: scopes.Scope, snapshot: dict, receipt_id: uuid.UUID) -> dict:
    """Release the exact business reservations and close statuses in one transaction."""
    from app.services.io_persist import sync_batch_from_stock_requests
    operation = inventory_operations.create_business_operation(db, domain="inventory", action="business_correction",
        display_label="실사 이전 업무 정정", actor_name=actor.name, actor_employee_id=actor.employee_id,
        reason=row.reason, idempotency_key=f"business-correction:{receipt_id}")
    if operation is None:
        scopes.held("업무 원장을 활성화한 뒤 정정할 수 있습니다.")
    now = datetime.utcnow()
    corrected_effects = {}
    for allocation in scope.allocations:
        db.refresh(allocation, with_for_update=db.get_bind().dialect.name != "sqlite")
        before = scopes.state(allocation)
        if allocation.status == "RESERVED":
            stocktake_guard.record_change(db, allocation.item_id, allocation.department or "창고", kind="reservation", delta=-int(allocation.quantity))
            inventory_operations.record_effect(db, operation=operation, effect_kind="RESERVATION", subject_type="ShippingAllocation",
                subject_id=allocation.allocation_id, role="BUSINESS_CORRECTION", before_state={"reserved": int(allocation.quantity)}, after_state={"reserved": 0})
        allocation.status, allocation.released_at, allocation.released_reason = "RELEASED", now, row.reason
        corrected_effects[("ShippingAllocation", str(allocation.allocation_id))] = _record(db, operation, allocation, before, allocation=True)
    for (name, ident), root in scope.roots.items():
        if name == "IoBatch":
            continue
        before = scopes.state(root)
        if name == "ShippingRequest":
            root.status = m.ShippingRequestStatusEnum(row.target_status)
            root.prepared_at = root.picked_up_at = None
            root.prepared_by_employee_id = root.prepared_by_name = None
            if row.target_status == "CANCELLED":
                root.cancelled_at, root.cancelled_by_employee_id, root.cancelled_by_name = now, actor.employee_id, actor.name
        elif name == "StockRequest":
            root.status, root.cancelled_at = m.StockRequestStatusEnum.CANCELLED, now
            for line in root.lines:
                line.status = m.StockRequestStatusEnum.CANCELLED
        else:
            root.status = m.HandoverStatusEnum.CANCELLED
            root.cancelled_at, root.cancelled_by_employee_id, root.cancelled_by_name = now, actor.employee_id, actor.name
        corrected_effects[(name, str(ident))] = _record(db, operation, root, before)
    for (name, ident), root in scope.roots.items():
        if name != "IoBatch":
            continue
        before = scopes.state(root)
        linked = db.query(m.StockRequest).filter_by(operation_batch_id=ident).all()
        if linked:
            sync_batch_from_stock_requests(db, root, linked)
        else:
            root.status, root.completed_at = "cancelled", None
        corrected_effects[(name, str(ident))] = _record(db, operation, root, before)
    for source in {e.effect_id: e for e in [*scope.effects, *scope.boundary_effects]}.values():
        corrected = corrected_effects.get((source.subject_type, source.subject_id))
        if corrected and db.get(m.BusinessCorrectionEffectLink, source.effect_id) is None:
            db.add(m.BusinessCorrectionEffectLink(source_effect_id=source.effect_id, correction_effect_id=corrected.effect_id, correction_id=row.correction_id))
    for kind, source_id in sorted(scope.claims, key=lambda r: (r[0], str(r[1]))):
        db.add(m.BusinessCorrectionSource(source_kind=kind, source_id=source_id, correction_id=row.correction_id))
    db.flush()
    # Refresh the allocations so the second snapshot contains no promised releases.
    after = _snapshot(db, scope)
    if after["physical"] != snapshot["physical"]:
        raise InventoryConflict("CORRECTION_QUANTITY_CHANGED", "업무 정정 중 물리 재고가 변경되어 전체 작업을 취소했습니다.")
    expected = {(r["item_id"], r["scope_id"]): r["after_reservations"] for r in snapshot["cells"]}
    if any(r["reservations"] != expected[(r["item_id"], r["scope_id"])] for r in after["cells"]):
        raise InventoryConflict("CORRECTION_RESERVATION_CHANGED", "업무 정정의 예약 해제가 예상과 달라 전체 작업을 취소했습니다.")
    row.status, row.application_operation_id, row.decided_at = "APPLIED", operation.operation_id, now
    row.version += 1
    event(db, row, actor, "APPLIED", {"previous_version": row.version - 1, "version": row.version,
        "operation_id": str(operation.operation_id), "scope_hash": row.scope_hash,
        "before": snapshot, "after": after})
    return response(row)


def dispatch(db: Session, actor: m.Employee, kind: str, payload: dict, receipt_id: uuid.UUID) -> dict:
    """The shared receipt boundary owns rollback and the only business commit."""
    control = db.get(m.StocktakeControl, 1)
    if control is None or control.inventory_mode != "POOL":
        scopes.held("공동재고 전환과 실사 반영 이후에 업무 정정을 요청할 수 있습니다.")
    if kind == "correction_request":
        return _request(db, actor, payload)
    row = _load(db, payload)
    if kind == "correction_withdraw":
        if actor.employee_id != row.requester_id:
            raise InventoryConflict("FORBIDDEN", "정정 요청자만 철회할 수 있습니다.", status_code=403)
    else:
        require_admin(actor)
    if kind in {"correction_reject", "correction_withdraw"}:
        row.status = "REJECTED" if kind == "correction_reject" else "WITHDRAWN"
        row.version += 1
        row.decided_at = datetime.utcnow()
        event(db, row, actor, row.status, {"previous_version": row.version - 1, "version": row.version, "reason": payload["reason"]})
        return response(row)
    scope, current = _current(db, row)
    if kind == "correction_preview":
        return preview_response(seal(db, actor, "business_correction", current))
    preview = open_preview(db, payload, "business_correction")
    if preview.preview_hash != fingerprint(current):
        raise InventoryConflict("PREVIEW_STALE", "현재 재고 또는 예약이 변경되었습니다. 같은 요청에서 미리보기를 다시 확인해 주세요.")
    return _apply(db, actor, row, scope, current, receipt_id)
