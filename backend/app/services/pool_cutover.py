"""Explicit offline transition; current stock and unproven historical effects stay distinct."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict
from datetime import datetime
import hashlib
import json
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (Base, DefectInventoryMovement, DefectPoolBridge, DefectPoolCutover,
    DefectQuarantineRecord, DefectStockMovement, DefectStockPool, Department, Employee,
    InventoryLocation, InventoryScope, LocationStatusEnum, RequestBucketEnum,
    StockRequest, StockRequestLine, StockRequestStatusEnum, StockRequestTypeEnum, StocktakeControl, TransactionLog)
from app.services import defect_pool, inventory_operations, inventory_scope, pool_bridges
from app.services._tx import transactional
from app.services.inventory_conflicts import InventoryConflict
from app.services.inventory_integrity import diagnose_inventory_integrity
from app.services.inventory_operation_cancellation import CancellationNotAllowed, normalized_effect_for_cancellation
from app.services.pool_cancellation import effect_fingerprint


SOURCE_TABLES = (
    "departments", "items", "inventory", "inventory_locations", "defect_quarantine_records",
    "defect_quarantine_management_category_revisions", "defect_inventory_movements",
    "defect_quarantine_reconstructions", "defect_quarantine_reconstruction_allocations",
    "transaction_logs", "inventory_operations", "inventory_operation_effects",
    "stock_requests", "stock_request_lines", "shipping_requests", "shipping_allocations",
    "io_batches", "handovers", "warehouse_boxes", "warehouse_angles", "warehouse_box_items",
    "warehouse_special_zones", "warehouse_special_zone_items", "inventory_scopes", "stocktake_control",
)
ACTIVE_REQUEST_STATES = {StockRequestStatusEnum.DRAFT, StockRequestStatusEnum.SUBMITTED, StockRequestStatusEnum.RESERVED}


def source_fingerprint(db: Session) -> str:
    """Bind the reviewed physical, historical, reservation and workflow snapshot."""
    digest = hashlib.sha256()
    for name in SOURCE_TABLES:
        table = Base.metadata.tables[name]
        digest.update(name.encode())
        for row in db.execute(select(table).order_by(*table.primary_key.columns)).mappings():
            digest.update(json.dumps(dict(row), sort_keys=True, default=str, separators=(",", ":")).encode())
            digest.update(b"\n")
    settings = Base.metadata.tables["system_settings"]
    for row in db.execute(select(settings.c.setting_key, settings.c.setting_value).where(
        settings.c.setting_key.in_(("inventory_operation_cutover_at", "inventory_operation_v2_cutover_at",
            "warehouse_box_tracking_enabled", "weekly_inventory_snapshot_started_at"))).order_by(settings.c.setting_key)):
        digest.update(json.dumps(tuple(row), separators=(",", ":")).encode())
    return digest.hexdigest()


def _historical_bridges(db: Session, scope_keys: dict[str, str]) -> tuple[list[dict], list[dict]]:
    """Preserve whole operation membership even where historical cancellation is unproven."""
    groups: dict[tuple, list[TransactionLog]] = defaultdict(list)
    for log in db.query(TransactionLog).order_by(TransactionLog.log_id).all():
        if log.operation_id is not None:
            key = ("operation", str(log.operation_id))
        elif log.operation_batch_id is not None:
            key = ("batch", str(log.operation_batch_id))
        elif (log.reference_no or "").startswith("defect-disassemble:") and log.reverses_log_id is None:
            key = ("reference", log.reference_no)
        else:
            key = ("log", str(log.log_id))
        groups[key].append(log)
    bridges, warnings = [], []
    for logs in groups.values():
        effects, missing = [], []
        for log in logs:
            try:
                normalized = normalized_effect_for_cancellation(log)
            except CancellationNotAllowed as exc:
                missing.append({"log_id": str(log.log_id), "source_fingerprint": effect_fingerprint(log),
                    "source_inventory_effect": log.inventory_effect, "reason": str(exc)})
                continue
            effects.extend((log, ordinal, effect) for ordinal, effect in enumerate(normalized)
                if effect.get("scope") == "location" and effect.get("status") == "DEFECTIVE" and effect["delta"])
        if missing:
            warnings.append({"code": "MISSING_LEGACY_EFFECT", "operation_log_ids": sorted(str(log.log_id) for log in logs),
                "sources": missing, "reason": "원로그·전환 입력 지문을 보존하며 없는 물리 효과나 분류를 만들지 않습니다."})
        if not effects:
            continue
        try:
            bridges.extend(pool_bridges.build_effect_bridges(db, logs, scope_keys=scope_keys))
        except (InventoryConflict, CancellationNotAllowed) as exc:
            members = sorted(str(log.log_id) for log in logs)
            warnings.append({"code": "AMBIGUOUS_LEGACY_EFFECT", "operation_log_ids": members, "reason": str(exc)})
            for log, ordinal, effect in effects:
                bridges.append({"source_key": f"effect:{log.log_id}:{ordinal}", "source_transaction_id": log.log_id,
                    "scope_key": scope_keys[effect["department"]], "cutover_remaining": 0,
                    "observed_epoch": 0, "source_fingerprint": effect_fingerprint(log),
                    "source_payload": {"version": 1, "operation_log_ids": members, "parts": [],
                        "evidence_status": "AMBIGUOUS_LEGACY_EFFECT", "reason": str(exc),
                        "source_effect": effect, "source_inventory_effect": log.inventory_effect,
                        "missing_group_sources": missing}})
    return bridges, warnings


def preflight(db: Session) -> dict:
    """SELECT-only preparation; no scopes, balances, reservations or modes are written."""
    control = db.get(StocktakeControl, 1)
    if control is None or control.inventory_mode != "LEGACY" or control.active_round_id or control.epoch:
        raise ValueError("전환 사전검사는 활성 조사 없는 LEGACY epoch 0에서만 가능합니다.")
    if not inventory_operations.is_ledger_active(db):
        raise ValueError("전환 전 재고 작업 원장이 활성화되어 있어야 합니다.")
    if any(db.query(model).first() is not None for model in (DefectPoolCutover, DefectPoolBridge, DefectStockPool, DefectStockMovement)):
        raise ValueError("전환 전용 테이블에 기존 데이터가 있어 자동 덮어쓸 수 없습니다.")
    records = db.query(DefectQuarantineRecord).order_by(DefectQuarantineRecord.record_id).all()
    locations = db.query(InventoryLocation).all()
    descriptors = inventory_scope.plan_scopes(db.query(Department).all(),
        [row.department for row in locations] + [row.department for row in records])
    scopes = {row.physical_department: row.scope_key for row in descriptors}
    existing = {row.scope_key: row for row in db.query(InventoryScope).all()}
    for descriptor in descriptors:
        if descriptor.scope_key in existing:
            row = existing[descriptor.scope_key]
            if (row.department_id, row.physical_department) != (descriptor.department_id, descriptor.physical_department):
                raise ValueError("기존 위치 매핑과 사전검사 위치가 다릅니다.")
    diagnostics = diagnose_inventory_integrity(db)
    blocking = [{"code": check.check_id, "count": check.count, "samples": check.samples}
        for check in diagnostics.checks if check.count and check.severity == "blocking"]
    if diagnostics.blocking_count and not blocking:
        blocking.append({"code": "INVENTORY_INTEGRITY", "count": diagnostics.blocking_count})
    quantities: dict[tuple, int] = defaultdict(int)
    movements: dict[uuid.UUID, list] = defaultdict(list)
    for row in db.query(DefectInventoryMovement).all():
        movements[row.record_id].append(row)
    cutoff = inventory_operations.cutover_at(db)
    for record in records:
        quantity = defect_pool.integer_quantity(record.remaining_quantity)
        key = (str(record.item_id), record.department, record.management_category)
        quantities[key] += quantity
        defect_pool.integer_quantity(quantities[key])
        history = movements[record.record_id]
        if history and sum(defect_pool.integer_quantity(row.quantity_delta) for row in history) != quantity:
            blocking.append({"code": "OCCURRENCE_MOVEMENT_MISMATCH", "record_id": str(record.record_id),
                "current": quantity, "movement_sum": sum(int(row.quantity_delta) for row in history)})
        if not history and not (quantity == 0 and record.is_legacy and record.quarantined_at < cutoff):
            blocking.append({"code": "UNPROVEN_MISSING_MOVEMENT", "record_id": str(record.record_id)})
    record_bridges = pool_bridges.build_record_bridges(db, records, scope_keys=scopes)
    effect_bridges, warnings = _historical_bridges(db, scopes)
    by_record = {row.record_id: row for row in records}
    reserved: dict[tuple, int] = defaultdict(int)
    links = []
    for line, request in db.query(StockRequestLine, StockRequest).join(StockRequest,
        StockRequest.request_id == StockRequestLine.request_id).all():
        if line.from_bucket != RequestBucketEnum.DEFECTIVE:
            continue
        request_reserved = request.status == StockRequestStatusEnum.RESERVED
        line_reserved = line.status == StockRequestStatusEnum.RESERVED
        if request_reserved != line_reserved:
            blocking.append({"code": "RESERVATION_STATE_MISMATCH", "line_id": str(line.line_id)})
        if request.status not in ACTIVE_REQUEST_STATES:
            continue
        record = by_record.get(line.defect_quarantine_record_id)
        if record is None or record.item_id != line.item_id or record.department != line.from_department:
            blocking.append({"code": "UNPROVEN_REQUEST_SOURCE", "line_id": str(line.line_id)})
            continue
        key = (str(record.item_id), record.department, record.management_category)
        quantity = defect_pool.integer_quantity(line.quantity, positive=True)
        defect_only = request_reserved or request.request_type in (
            StockRequestTypeEnum.DEFECT_SCRAP, StockRequestTypeEnum.DEFECT_RETURN, StockRequestTypeEnum.DEFECT_DISASSEMBLE)
        if defect_only and record.management_category != "DEFECT":
            blocking.append({"code": "REQUEST_CATEGORY_NOT_ALLOWED", "line_id": str(line.line_id)})
        if request_reserved and line_reserved:
            reserved[key] += quantity
        links.append({"line_id": str(line.line_id), "request_id": str(request.request_id),
            "key": key, "quantity": quantity, "reserved": request_reserved and line_reserved,
            "source_record_id": str(record.record_id)})
    physical = {(str(row.item_id), row.department): (int(row.quantity), int(row.pending_quantity))
        for row in locations if row.status == LocationStatusEnum.DEFECTIVE}
    projected: dict[tuple, list] = defaultdict(lambda: [0, 0])
    for key in set(quantities) | set(reserved):
        qty, pending = quantities.get(key, 0), reserved.get(key, 0)
        if not 0 <= pending <= qty <= defect_pool.MAX_QUANTITY:
            blocking.append({"code": "POOL_QUANTITY_RANGE", "key": key, "quantity": qty, "pending": pending})
        projected[key[:2]][0] += qty
        projected[key[:2]][1] += pending
    for key in set(physical) | set(projected):
        if list(physical.get(key, (0, 0))) != projected.get(key, [0, 0]):
            blocking.append({"code": "POOL_PHYSICAL_MISMATCH", "key": key,
                "physical": physical.get(key, (0, 0)), "projected": projected.get(key, [0, 0])})
    return {"source_fingerprint": source_fingerprint(db), "blocking": blocking, "warnings": warnings,
        "record_count": len(records), "zero_without_movement": [str(row.record_id) for row in records
            if not movements[row.record_id] and int(row.remaining_quantity) == 0],
        "_scopes": [asdict(row) for row in descriptors], "_bridges": record_bridges + effect_bridges,
        "_pools": [{"key": key, "quantity": quantities[key], "pending_quantity": reserved.get(key, 0)}
            for key in sorted(quantities)], "_request_links": links}


def _checkpoint(stage: str) -> None:
    """Failure-injection seam for transaction/recovery tests; production has no side effect."""


def receipt(db: Session, row: DefectPoolCutover) -> dict:
    """Read the immutable committed identity after success or an uncertain response."""
    return {"cutover_id": str(row.cutover_id), "operation_id": str(row.operation_id),
        "source_fingerprint": row.source_fingerprint, "actor_employee_id": str(row.actor_employee_id),
        "version": row.cutover_version, "performed_at": row.performed_at.isoformat()}


def apply_cutover(db: Session, *, cutover_id: uuid.UUID, expected_fingerprint: str, actor_id: uuid.UUID) -> dict:
    """Commit every bridge/opening/reservation/mode together under the caller's offline writer fence."""
    with transactional(db, control_exclusive=True):
        control = db.query(StocktakeControl).filter_by(id=1).with_for_update().populate_existing().one()
        actor = db.get(Employee, actor_id)
        if actor is None or not actor.is_active or actor.department_role not in {"primary", "deputy"}:
            raise ValueError("공동재고 전환에는 활성 부서 정·부 결재자 식별자가 필요합니다.")
        prior = db.query(DefectPoolCutover).one_or_none()
        if prior is not None:
            if (prior.cutover_id, prior.source_fingerprint, prior.actor_employee_id) != (cutover_id, expected_fingerprint, actor_id) or control.inventory_mode != "POOL":
                raise ValueError("이미 다른 전환이 완료됐거나 영수증 상태가 일치하지 않습니다.")
            return receipt(db, prior)
        plan = preflight(db)
        if plan["source_fingerprint"] != expected_fingerprint:
            raise ValueError("전환 사전검사 이후 데이터 지문이 변경되었습니다.")
        if plan["blocking"]:
            raise ValueError("전환 사전검사에 차단 항목이 있습니다: " + json.dumps(plan["blocking"], ensure_ascii=False, default=str))
        for scope in plan["_scopes"]:
            if db.get(InventoryScope, scope["scope_key"]) is None:
                db.add(InventoryScope(**scope))
        db.flush()
        _checkpoint("scopes")
        operation = inventory_operations.create_business_operation(db, domain="pool", action="cutover",
            display_label="공동재고 전환", actor_name=actor.name, actor_employee_id=actor.employee_id,
            reason="검증된 현재 수량과 역사 증빙 전환", idempotency_key=f"pool-cutover:{cutover_id}")
        if operation is None:
            raise ValueError("공동재고 전환 원장이 비활성입니다.")
        row = DefectPoolCutover(cutover_id=cutover_id, actor_employee_id=actor_id,
            operation_id=operation.operation_id, source_fingerprint=expected_fingerprint,
            cutover_version=1, performed_at=datetime.utcnow())
        db.add(row)
        db.flush()
        pools = {}
        scopes = {entry["physical_department"]: entry["scope_key"] for entry in plan["_scopes"]}
        for entry in plan["_pools"]:
            item_id, department, category = entry["key"]
            pool = DefectStockPool(item_id=uuid.UUID(item_id), scope_key=scopes[department], category=category,
                quantity=0, pending_quantity=0, version=0, cutover_id=cutover_id)
            db.add(pool)
            db.flush()
            if entry["quantity"]:
                defect_pool.apply_delta(db, pool=pool, delta=entry["quantity"], operation=operation, reason="CUTOVER_OPENING")
            pool.pending_quantity = entry["pending_quantity"]
            pools[entry["key"]] = pool
        db.flush()
        _checkpoint("pools")
        for bridge in plan["_bridges"]:
            db.add(DefectPoolBridge(cutover_id=cutover_id, **bridge))
        for link in plan["_request_links"]:
            pool = pools[link["key"]]
            db.get(StockRequestLine, uuid.UUID(link["line_id"])).pool_id = pool.pool_id
            db.add(DefectPoolBridge(cutover_id=cutover_id, source_key=f"reservation:{link['line_id']}",
                source_record_id=uuid.UUID(link["source_record_id"]), scope_key=pool.scope_key,
                cutover_category=pool.category, cutover_remaining=link["quantity"] if link["reserved"] else 0,
                observed_epoch=0, source_fingerprint=hashlib.sha256(json.dumps(link, sort_keys=True).encode()).hexdigest(),
                source_payload=link))
        db.flush()
        _checkpoint("bridges")
        control.inventory_mode = "POOL"
        db.flush()
        _checkpoint("mode")
        diagnosis = diagnose_inventory_integrity(db)
        if diagnosis.blocking_count:
            raise ValueError("전환 후 불변식 검사 실패: " + diagnosis.model_dump_json())
        return receipt(db, row)
