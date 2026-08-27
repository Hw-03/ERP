"""거래 수량 보정·취소 업무 명령의 트랜잭션 경계."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import (
    DefectQuarantineRecord,
    DefectQuarantineReconstructionAllocation,
    Employee,
    InventoryOperationRoleEnum,
    Item,
    LocationStatusEnum,
    StockRequestLine,
    StockRequestStatusEnum,
    TransactionEditLog,
    TransactionLog,
    TransactionTypeEnum,
)
from app.repositories import inventory_repository, item_repository
from app.services import audit, inv_effect, inventory as inventory_svc
from app.services import inventory_operations as operation_svc
from app.services import legacy_inventory_operation_adoption as legacy_adoption_svc
from app.services._tx import transactional
from app.services.inv_calc import _sync_total


class TransactionInventoryNotFound(LookupError):
    """취소할 거래에 대응하는 재고 레코드가 없을 때 발생한다."""

    def __init__(self, item_id: uuid.UUID) -> None:
        self.item_id = item_id
        super().__init__(f"재고 레코드를 찾을 수 없습니다 (item={item_id}).")


class TransactionLogNotFound(LookupError):
    """수정·취소할 원본 거래가 없을 때 발생한다."""


class TransactionItemNotFound(LookupError):
    """원본 거래가 가리키는 품목이 없을 때 발생한다."""


class UnsupportedTransactionMetadata(ValueError):
    """메타데이터 수정을 허용하지 않는 거래 유형일 때 발생한다."""


_META_CORRECTABLE = {
    TransactionTypeEnum.RECEIVE,
    TransactionTypeEnum.SHIP,
    TransactionTypeEnum.ADJUST,
    TransactionTypeEnum.TRANSFER_TO_PROD,
    TransactionTypeEnum.TRANSFER_TO_WH,
    TransactionTypeEnum.TRANSFER_DEPT,
    TransactionTypeEnum.MARK_DEFECTIVE,
    TransactionTypeEnum.SUPPLIER_RETURN,
}


def _metadata_snapshot(log: TransactionLog) -> dict[str, Any]:
    """감사 이력에 남길 TransactionLog 가변 필드를 직렬화한다."""
    return {
        "transaction_type": log.transaction_type.value if log.transaction_type else None,
        "quantity_change": str(log.quantity_change) if log.quantity_change is not None else None,
        "reference_no": log.reference_no,
        "produced_by": log.produced_by,
        "notes": log.notes,
    }


def edit_transaction_metadata(
    db: Session,
    *,
    log_id: uuid.UUID,
    editor: Employee,
    reason: str,
    notes: str | None,
    reference_no: str | None,
    produced_by: str | None,
    request: Optional[Request],
) -> tuple[TransactionLog, Item]:
    """거래 메타데이터와 수정·감사 이력을 하나의 트랜잭션으로 확정한다."""
    with transactional(db):
        log = db.query(TransactionLog).filter(TransactionLog.log_id == log_id).first()
        if log is None:
            raise TransactionLogNotFound("거래를 찾을 수 없습니다.")

        item = item_repository.get(db, log.item_id)
        if item is None:
            raise TransactionItemNotFound("품목을 찾을 수 없습니다.")

        if log.transaction_type not in _META_CORRECTABLE:
            tx_type = getattr(log.transaction_type, "value", log.transaction_type)
            raise UnsupportedTransactionMetadata(
                f"이 거래 유형({tx_type})은 수정을 지원하지 않습니다."
            )

        before = _metadata_snapshot(log)
        if notes is not None:
            log.notes = notes
        if reference_no is not None:
            log.reference_no = reference_no or None
        if produced_by is not None:
            log.produced_by = produced_by or None
        after = _metadata_snapshot(log)

        db.add(
            TransactionEditLog(
                original_log_id=log.log_id,
                edited_by_employee_id=editor.employee_id,
                edited_by_name=editor.name,
                reason=reason,
                before_payload=json.dumps(before, ensure_ascii=False),
                after_payload=json.dumps(after, ensure_ascii=False),
                correction_log_id=None,
            )
        )
        audit.record(
            db,
            request=request,
            action="transaction.meta_edit",
            target_type="transaction_log",
            target_id=str(log.log_id),
            payload_summary=f"{editor.name}: {reason}",
        )
    return log, item


def correct_transaction_quantity(
    db: Session,
    *,
    log: TransactionLog,
    editor: Employee,
    new_warehouse: Decimal,
    delta: Decimal,
    reason: str,
    before: dict[str, Any],
    request: Optional[Request],
) -> TransactionLog:
    """재고 보정과 보정 원장·수정 이력·감사를 원자적으로 확정한다."""
    with transactional(db):
        operation = operation_svc._create_business_operation(
            db,
            domain="transaction",
            action="quantity_correction",
            display_label="수량 보정",
            actor_name=editor.name,
            actor_employee_id=editor.employee_id,
            department="창고",
            reason=reason,
            idempotency_key=f"transaction_correction:{log.log_id}",
        )
        cells_before = inv_effect._snapshot_cells(db, log.item_id)
        adjusted_inv, qty_before, _applied_delta = inventory_svc._adjust_warehouse(
            db, log.item_id, new_warehouse
        )
        correction_log = operation_svc._attach_transaction(TransactionLog(
            item_id=log.item_id,
            transaction_type=TransactionTypeEnum.ADJUST,
            quantity_change=delta,
            quantity_before=qty_before,
            quantity_after=adjusted_inv.quantity,
            notes=f"보정: {reason}",
            reference_no=str(log.log_id),
            produced_by=editor.name,
            producer_employee_id=editor.employee_id,
            department="창고",
            **inv_effect._capture_log_stock_snapshot(db, log.item_id, cells_before),
        ), operation, InventoryOperationRoleEnum.CORRECTION)
        db.add(correction_log)
        db.flush()

        after = {
            **before,
            "_correction_log_id": str(correction_log.log_id),
            "_applied_delta": str(delta),
        }
        db.add(
            TransactionEditLog(
                original_log_id=log.log_id,
                edited_by_employee_id=editor.employee_id,
                edited_by_name=editor.name,
                reason=reason,
                before_payload=json.dumps(before, ensure_ascii=False),
                after_payload=json.dumps(after, ensure_ascii=False),
                correction_log_id=correction_log.log_id,
            )
        )
        audit.record(
            db,
            request=request,
            action="transaction.quantity_correction",
            target_type="transaction_log",
            target_id=str(log.log_id),
            payload_summary=f"{editor.name}: delta={float(delta)}, {reason}",
        )
    return correction_log


def _normalize_effect_for_cancel(effect: object) -> object:
    """레거시 단일 효과 객체를 검증한 뒤 한 항목 목록으로 읽는다."""
    if not isinstance(effect, dict):
        return effect

    try:
        delta = int(effect.get("delta", 0))
    except (TypeError, ValueError):
        delta = 0
    scope = effect.get("scope")
    is_valid = delta != 0

    if scope == "location":
        department = effect.get("department")
        status = effect.get("status")
        try:
            LocationStatusEnum(status)
        except (TypeError, ValueError):
            is_valid = False
        is_valid = is_valid and isinstance(department, str) and bool(department.strip())
    elif scope == "warehouse_box":
        is_valid = is_valid and bool(effect.get("box_id"))
    elif scope != "warehouse":
        is_valid = False

    if not is_valid:
        raise ValueError("재고 효과 기록 형식이 올바르지 않아 자동 취소할 수 없습니다.")
    return [effect]


def _defective_delta_for_record(
    effect: object,
    record: DefectQuarantineRecord,
) -> Decimal:
    """거래 효과 중 선택 격리 기록 부서의 불량 위치 증감만 합산한다."""
    normalized = _normalize_effect_for_cancel(effect)
    if not isinstance(normalized, list):
        return Decimal("0")
    total = Decimal("0")
    for cell in normalized:
        if not isinstance(cell, dict):
            continue
        if (
            cell.get("scope") == "location"
            and str(cell.get("department")) == str(record.department)
            and str(cell.get("status")) == LocationStatusEnum.DEFECTIVE.value
        ):
            total += Decimal(str(cell.get("delta", 0)))
    return total


def _record_for_cancel(
    db: Session,
    record_id: uuid.UUID,
) -> DefectQuarantineRecord:
    """취소 대상 격리 기록을 잠그고 존재 여부를 검증한다."""
    query = db.query(DefectQuarantineRecord).filter(
        DefectQuarantineRecord.record_id == record_id
    )
    if db.bind is not None and db.bind.dialect.name != "sqlite":
        query = query.with_for_update()
    record = query.first()
    if record is None:
        raise ValueError("연결된 격리 기록을 찾을 수 없어 거래를 취소할 수 없습니다.")
    return record


def _restore_reconstruction_allocations(
    db: Session,
    log: TransactionLog,
) -> bool:
    """과거 FIFO 차감 거래라면 할당된 모든 자식 기록의 잔량을 복원한다."""
    allocations = (
        db.query(DefectQuarantineReconstructionAllocation)
        .filter(
            DefectQuarantineReconstructionAllocation.transaction_log_id == log.log_id
        )
        .order_by(DefectQuarantineReconstructionAllocation.created_at)
        .all()
    )
    if not allocations:
        return False
    for allocation in allocations:
        record = _record_for_cancel(db, allocation.record_id)
        restored = Decimal(str(record.remaining_quantity)) + Decimal(
            str(allocation.quantity)
        )
        if restored > Decimal(str(record.original_quantity)):
            raise ValueError("격리 기록의 원수량을 초과해 FIFO 차감을 취소할 수 없습니다.")
        record.remaining_quantity = restored
    return True


def _has_downstream_defect_usage(
    db: Session,
    *,
    record: DefectQuarantineRecord,
    source_log_id: uuid.UUID,
) -> bool:
    """최초 격리 이후의 직접 처리·복원 할당·승인 예약이 남았는지 확인한다."""
    direct_log = (
        db.query(TransactionLog.log_id)
        .filter(
            TransactionLog.defect_quarantine_record_id == record.record_id,
            TransactionLog.log_id != source_log_id,
            TransactionLog.cancelled.is_(False),
        )
        .first()
    )
    if direct_log is not None:
        return True
    allocated_log = (
        db.query(DefectQuarantineReconstructionAllocation.allocation_id)
        .join(
            TransactionLog,
            TransactionLog.log_id
            == DefectQuarantineReconstructionAllocation.transaction_log_id,
        )
        .filter(
            DefectQuarantineReconstructionAllocation.record_id == record.record_id,
            TransactionLog.cancelled.is_(False),
        )
        .first()
    )
    if allocated_log is not None:
        return True
    pending_line = (
        db.query(StockRequestLine.line_id)
        .filter(
            StockRequestLine.defect_quarantine_record_id == record.record_id,
            StockRequestLine.status == StockRequestStatusEnum.RESERVED,
        )
        .first()
    )
    return pending_line is not None


def _reverse_linked_defect_record(db: Session, log: TransactionLog) -> None:
    """거래 취소에 맞춰 직접 연결 또는 복원 FIFO 원장의 잔량을 역전한다."""
    if _restore_reconstruction_allocations(db, log):
        return
    if log.defect_quarantine_record_id is None:
        return

    record = _record_for_cancel(db, log.defect_quarantine_record_id)
    delta = _defective_delta_for_record(log.inventory_effect, record)
    if delta == 0:
        return
    if delta < 0:
        restored = Decimal(str(record.remaining_quantity)) - delta
        if restored > Decimal(str(record.original_quantity)):
            raise ValueError("격리 기록의 원수량을 초과해 처리를 취소할 수 없습니다.")
        record.remaining_quantity = restored
        return

    original = Decimal(str(record.original_quantity))
    remaining = Decimal(str(record.remaining_quantity))
    if (
        delta != original
        or remaining != original
        or _has_downstream_defect_usage(
            db,
            record=record,
            source_log_id=log.log_id,
        )
    ):
        raise ValueError(
            "후속 처리 또는 승인 예약이 연결된 최초 격리 거래는 취소할 수 없습니다."
        )
    record.remaining_quantity = remaining - delta


def _cancel_one_log(db: Session, log: TransactionLog) -> None:
    """기록된 재고 효과를 역재생한다."""
    effect = log.inventory_effect
    if (
        log.reference_no
        and log.reference_no.startswith("defect-disassemble:")
        and log.transaction_type == TransactionTypeEnum.DEFECT_SCRAP
        and log.notes == "[rework:scrap_child]"
        and effect == []
    ):
        return
    if effect is None:
        raise ValueError("재고 효과 기록이 없어 자동 취소할 수 없습니다.")
    effect = _normalize_effect_for_cancel(effect)
    if not isinstance(effect, list) or not effect:
        raise ValueError("재고 효과 기록이 비어 있어 자동 취소할 수 없습니다.")
    try:
        has_nonzero_delta = any(
            isinstance(cell, dict) and int(cell.get("delta", 0)) != 0
            for cell in effect
        )
    except (TypeError, ValueError):
        has_nonzero_delta = False
    if not has_nonzero_delta:
        raise ValueError("재고 효과 기록이 비어 있어 자동 취소할 수 없습니다.")
    _reverse_linked_defect_record(db, log)
    inv_effect._apply_effect_reverse(db, log.item_id, effect)


def _claim_cancel_logs(db: Session, log_id: uuid.UUID) -> list[TransactionLog]:
    """취소 권한을 원자적으로 선점하고 묶음 로그를 결정적 순서로 잠근다."""
    target = (
        db.query(TransactionLog)
        .populate_existing()
        .filter(TransactionLog.log_id == log_id)
        .one_or_none()
    )
    if target is None:
        raise TransactionLogNotFound("거래를 찾을 수 없습니다.")
    group_query = db.query(TransactionLog)
    if target.operation_batch_id:
        group_query = group_query.filter(
            TransactionLog.operation_batch_id == target.operation_batch_id
        )
    elif target.reference_no and target.reference_no.startswith("defect-disassemble:"):
        group_query = group_query.filter(
            TransactionLog.reference_no == target.reference_no
        )
    else:
        claimed = (
            db.query(TransactionLog)
            .filter(
                TransactionLog.log_id == log_id,
                TransactionLog.cancelled.is_(False),
            )
            .update({TransactionLog.cancelled: True}, synchronize_session=False)
        )
        if claimed != 1:
            raise ValueError("이미 취소된 거래입니다.")
        target.cancelled = True
        return [target]

    group_query = group_query.order_by(TransactionLog.log_id)
    if db.bind is not None and db.bind.dialect.name != "sqlite":
        group_query = group_query.with_for_update()
    group_logs = group_query.populate_existing().all()
    if not any(str(group_log.log_id) == str(log_id) for group_log in group_logs):
        raise TransactionLogNotFound("거래 묶음에서 대상 거래를 찾을 수 없습니다.")
    if any(group_log.cancelled for group_log in group_logs):
        raise ValueError("이미 취소된 거래가 포함된 묶음입니다.")
    group_ids = [group_log.log_id for group_log in group_logs]
    claimed_group = (
        db.query(TransactionLog)
        .filter(
            TransactionLog.log_id.in_(group_ids),
            TransactionLog.cancelled.is_(False),
        )
        .update({TransactionLog.cancelled: True}, synchronize_session=False)
    )
    if claimed_group != len(group_ids):
        raise ValueError("거래 묶음이 다른 요청에서 이미 취소되었습니다.")
    for group_log in group_logs:
        group_log.cancelled = True
    return group_logs


def cancel_transaction(
    db: Session,
    *,
    log: TransactionLog,
    canceller: Employee,
    reason: str,
    request: Optional[Request],
) -> TransactionLog:
    """재고 역재생과 거래 취소 상태·감사를 원자적으로 확정한다."""
    with transactional(db):
        now = datetime.utcnow()
        if operation_svc.is_ledger_active(db, at=now):
            legacy_adoption_svc.adopt_and_cancel(
                db,
                selected_log_id=log.log_id,
                canceller=canceller,
                reason=reason,
                now=now,
            )
            audit.record(
                db,
                request=request,
                action="transaction.cancel",
                target_type="transaction_log",
                target_id=str(log.log_id),
                payload_summary=f"{canceller.name}: {reason}",
            )
            return log
        batch_logs = _claim_cancel_logs(db, log.log_id)

        inventory_svc.lock_inventories(
            db,
            sorted({batch_log.item_id for batch_log in batch_logs}),
        )
        for batch_log in batch_logs:
            inventory = inventory_repository.get(db, batch_log.item_id)
            if inventory is None:
                raise TransactionInventoryNotFound(batch_log.item_id)
            _cancel_one_log(db, batch_log)
            _sync_total(db, inventory)
            batch_log.cancel_reason = reason
            batch_log.cancelled_by = canceller.employee_id
            batch_log.cancelled_at = now

        audit.record(
            db,
            request=request,
            action="transaction.cancel",
            target_type="transaction_log",
            target_id=str(log.log_id),
            payload_summary=f"{canceller.name}: {reason}",
        )
    return log
