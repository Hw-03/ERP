"""Read-only conversion of proven historical effects into cutover bridge payloads."""

from __future__ import annotations

from datetime import datetime
import hashlib
import json

from sqlalchemy.orm import Session

from app.models import (DefectQuarantineRecord, DefectQuarantineManagementCategoryRevision,
                        DefectQuarantineReconstruction, DefectQuarantineReconstructionAllocation,
                        DefectInventoryMovement, TransactionLog)
from app.services import defect_pool
from app.services.inventory_conflicts import InventoryConflict
from app.services.pool_cancellation import effect_fingerprint


def _ambiguous(message: str) -> InventoryConflict:
    return InventoryConflict("AMBIGUOUS_LEGACY_EFFECT", message, status_code=422)


def category_at(db: Session, record: DefectQuarantineRecord, occurred_at: datetime) -> str:
    """Verify the complete category chain before using its value at a past instant."""
    history = db.query(DefectQuarantineManagementCategoryRevision).filter_by(record_id=record.record_id).order_by(
        DefectQuarantineManagementCategoryRevision.edited_at,
        DefectQuarantineManagementCategoryRevision.revision_id,
    ).all()
    current = None
    selected = None
    for index, row in enumerate(history):
        if (row.next_category not in defect_pool.CATEGORIES or row.previous_category != current
                or bool(row.is_initial) != (index == 0)):
            raise _ambiguous("분류 변경 이력의 연결을 증명할 수 없습니다.")
        current = row.next_category
        if row.edited_at <= occurred_at:
            selected = current
    if selected is None or current != record.management_category:
        raise _ambiguous("과거 시점의 분류 또는 전환 시점의 분류를 증명할 수 없습니다.")
    return selected


def build_effect_bridges(db: Session, logs: list[TransactionLog], *, scope_keys: dict[str, str] | None = None) -> list[dict]:
    """Return complete effect evidence only; never write pools, bridges, or mode flags."""
    from app.services.inventory_operation_cancellation import normalized_effect_for_cancellation

    provided = {log.log_id for log in logs}
    for log in logs:
        query = db.query(TransactionLog.log_id)
        if log.operation_id is not None:
            query = query.filter(TransactionLog.operation_id == log.operation_id)
        elif log.operation_batch_id is not None:
            query = query.filter(TransactionLog.operation_batch_id == log.operation_batch_id)
        elif (log.reference_no or "").startswith("defect-disassemble:"):
            query = query.filter(TransactionLog.reference_no == log.reference_no,
                                 TransactionLog.reverses_log_id.is_(None))
        else:
            query = query.filter(TransactionLog.log_id == log.log_id)
        if {row[0] for row in query.all()} != provided:
            raise _ambiguous("원 reference/작업의 전체 거래를 제공해야 합니다.")
    log_ids = sorted(str(log.log_id) for log in logs)
    result = []
    for log in logs:
        for ordinal, effect in enumerate(normalized_effect_for_cancellation(log)):
            if effect.get("scope") != "location" or effect.get("status") != "DEFECTIVE" or not effect["delta"]:
                continue
            delta = defect_pool.integer_quantity(effect["delta"])
            allocations = db.query(DefectQuarantineReconstructionAllocation).filter_by(transaction_log_id=log.log_id).all()
            sources: list[tuple[DefectQuarantineRecord, int]] = []
            if allocations and delta < 0:
                for allocation in allocations:
                    record = db.get(DefectQuarantineRecord, allocation.record_id)
                    if record is None:
                        raise _ambiguous("과거 소비 할당의 발생 기록이 없습니다.")
                    sources.append((record, -int(allocation.quantity)))
            elif log.defect_quarantine_record_id is not None:
                record = db.get(DefectQuarantineRecord, log.defect_quarantine_record_id)
                if record is not None:
                    sources.append((record, delta))
            if not sources or sum(quantity for _record, quantity in sources) != delta:
                raise _ambiguous("과거 효과 전체 수량과 발생/소비 할당을 증명할 수 없습니다.")
            parts = []
            consumed = False
            for record, quantity in sorted(sources, key=lambda entry: str(entry[0].record_id)):
                if record.item_id != log.item_id or record.department != effect["department"]:
                    raise _ambiguous("과거 효과와 발생/소비 할당의 물리 셀이 다릅니다.")
                original_category = category_at(db, record, log.created_at)
                category = record.management_category if quantity > 0 else original_category
                if quantity > 0:
                    consumed |= int(record.remaining_quantity) != quantity or int(record.original_quantity) != quantity
                parts.append({"category": category, "delta": quantity, "record_id": str(record.record_id)})
            scope_key = scope_keys[effect["department"]] if scope_keys is not None else defect_pool.scope_for_department(db, effect["department"]).scope_key
            result.append({
                "source_key": f"effect:{log.log_id}:{ordinal}", "source_transaction_id": log.log_id,
                "scope_key": scope_key, "cutover_remaining": sum(int(record.remaining_quantity) for record, _ in sources),
                "observed_epoch": 0, "source_fingerprint": effect_fingerprint(log),
                "source_payload": {"version": 1, "operation_log_ids": log_ids, "parts": parts,
                                   "original_consumed": bool(consumed),
                                   "allocation_ids": sorted(str(row.allocation_id) for row in allocations)},
            })
    return result


def build_record_bridges(db: Session, records: list[DefectQuarantineRecord], *, scope_keys: dict[str, str] | None = None) -> list[dict]:
    """Preserve zero parents/consumed children without inventing opening movements."""
    result = []
    for record in records:
        category_at(db, record, datetime.max)
        remaining = defect_pool.integer_quantity(record.remaining_quantity)
        if remaining < 0 or remaining > int(record.original_quantity):
            raise _ambiguous("발생 기록의 전환 잔량이 유효하지 않습니다.")
        children = db.query(DefectQuarantineReconstruction).filter_by(parent_record_id=record.record_id).all()
        parent = db.get(DefectQuarantineReconstruction, record.record_id)
        allocations = db.query(DefectQuarantineReconstructionAllocation).filter_by(record_id=record.record_id).all()
        movements = db.query(DefectInventoryMovement).filter_by(record_id=record.record_id).all()
        if record.is_legacy and not movements and remaining == 0:
            if not children and not (parent and sum(int(row.quantity) for row in allocations) == int(record.original_quantity)):
                raise _ambiguous("이동행 없는 잔량 0 기록의 복원·전량 소비 증빙이 부족합니다.")
        history = db.query(DefectQuarantineManagementCategoryRevision).filter_by(record_id=record.record_id).order_by(
            DefectQuarantineManagementCategoryRevision.edited_at,
            DefectQuarantineManagementCategoryRevision.revision_id,
        ).all()
        payload = {"version": 1, "record_id": str(record.record_id), "item_id": str(record.item_id),
            "department": record.department, "original_quantity": int(record.original_quantity),
            "remaining_quantity": remaining, "management_category": record.management_category,
            "is_legacy": bool(record.is_legacy), "quarantined_at": record.quarantined_at.isoformat(),
            "parent_id": str(parent.parent_record_id) if parent else None,
            "source_transaction_id": str(parent.source_transaction_log_id) if parent else None,
            "children": [{"record_id": str(row.child_record_id), "source_transaction_id": str(row.source_transaction_log_id)}
                         for row in sorted(children, key=lambda row: str(row.child_record_id))],
            "allocations": [{"allocation_id": str(row.allocation_id), "transaction_log_id": str(row.transaction_log_id),
                             "quantity": int(row.quantity)} for row in sorted(allocations, key=lambda row: str(row.allocation_id))],
            "movement_ids": sorted(str(row.movement_id) for row in movements),
            "category_history": [{"revision_id": str(row.revision_id), "previous": row.previous_category,
                "next": row.next_category, "at": row.edited_at.isoformat(), "initial": bool(row.is_initial)} for row in history]}
        result.append({"source_key": f"record:{record.record_id}", "source_record_id": record.record_id,
            "scope_key": scope_keys[record.department] if scope_keys is not None else defect_pool.scope_for_department(db, record.department).scope_key,
            "original_category": history[0].next_category, "cutover_category": record.management_category,
            "cutover_remaining": remaining, "observed_epoch": 0, "source_payload": payload,
            "source_fingerprint": hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()})
    return result
