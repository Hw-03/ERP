"""거래 수량 보정·취소 업무 명령의 트랜잭션 경계."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    DefectInventoryMovement,
    DefectQuarantineRecord,
    DefectQuarantineReconstructionAllocation,
    Employee,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationEffectKindEnum,
    InventoryOperationKindEnum,
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


class UnsupportedTransactionQuantityCorrection(ValueError):
    """수량 보정을 지원하지 않는 거래 유형 또는 부호일 때 발생한다."""


class TransactionQuantityCorrectionShortage(ValueError):
    """수량 보정 결과가 창고 재고 또는 예약을 침범할 때 발생한다."""


_CORRECTION_CONFLICT_MESSAGES = {
    "already_corrected": "이미 수량 보정된 거래입니다.",
    "transaction_cancelled": "취소된 거래는 수량 보정할 수 없습니다.",
    "workflow_linked": "연결된 업무 거래는 수량 보정할 수 없습니다.",
    "multiple_inventory_effects": "여러 재고 효과가 연결된 거래는 수량 보정할 수 없습니다.",
    "non_warehouse_effect": "창고 외 재고 효과가 연결된 거래는 수량 보정할 수 없습니다.",
    "unproven_inventory_effect": "단일 창고 재고 효과를 증명할 수 없는 거래입니다.",
    "inventory_effect_mismatch": "거래 수량과 창고 재고 효과가 일치하지 않습니다.",
    "non_inventory_side_effect": "재고 외 효과가 연결된 거래는 수량 보정할 수 없습니다.",
    "ledger_unavailable": "재고 작업 원장이 활성화되지 않아 수량 보정할 수 없습니다.",
}


class CorrectionConflict(ValueError):
    """동시 상태 또는 원장 증거 때문에 수량 보정을 안전하게 확정할 수 없음."""

    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(_CORRECTION_CONFLICT_MESSAGES[reason])


@dataclass(frozen=True)
class QuantityCorrectionResult:
    """잠금 안에서 확정한 원본·보정 로그와 응답용 품목."""

    original: TransactionLog
    correction: TransactionLog
    item: Item


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


def _lock_correction_operation(
    db: Session,
    operation_id: uuid.UUID,
) -> InventoryOperation:
    """취소와 동일한 owning operation 행을 먼저 잠근다."""
    query = db.query(InventoryOperation).filter(
        InventoryOperation.operation_id == operation_id
    )
    if db.get_bind().dialect.name != "sqlite":
        query = query.with_for_update()
    operation = query.one_or_none()
    if operation is None:
        raise CorrectionConflict("unproven_inventory_effect")
    return operation


def _lock_correction_log(
    db: Session,
    log_id: uuid.UUID,
) -> TransactionLog:
    """수량 보정 대상 로그를 현재 transaction 안에서 신선하게 잠근다."""
    query = (
        db.query(TransactionLog)
        .populate_existing()
        .filter(TransactionLog.log_id == log_id)
    )
    if db.get_bind().dialect.name != "sqlite":
        query = query.with_for_update()
    log = query.one_or_none()
    if log is None:
        raise TransactionLogNotFound("거래를 찾을 수 없습니다.")
    return log


def _correction_operation_and_log(
    db: Session,
    log_id: uuid.UUID,
) -> tuple[InventoryOperation | None, TransactionLog]:
    """기존 operation 거래는 취소와 같은 lock order로, legacy는 log부터 잠근다."""
    operation_id = db.query(TransactionLog.operation_id).filter(
        TransactionLog.log_id == log_id
    ).scalar()
    operation = (
        _lock_correction_operation(db, operation_id)
        if operation_id is not None
        else None
    )
    log = _lock_correction_log(db, log_id)
    if log.operation_id is not None and operation is None:
        operation = _lock_correction_operation(db, log.operation_id)
    if operation is not None and log.operation_id != operation.operation_id:
        raise CorrectionConflict("workflow_linked")
    return operation, log


def _assert_single_warehouse_effect(log: TransactionLog) -> None:
    effect = log.inventory_effect
    if not isinstance(effect, list) or not effect:
        raise CorrectionConflict("unproven_inventory_effect")
    if len(effect) != 1:
        raise CorrectionConflict("multiple_inventory_effects")
    cell = effect[0]
    if not isinstance(cell, dict) or "delta" not in cell:
        raise CorrectionConflict("unproven_inventory_effect")
    if cell.get("scope") != "warehouse":
        raise CorrectionConflict("non_warehouse_effect")
    try:
        effect_delta = Decimal(str(cell["delta"]))
    except (TypeError, ValueError):
        raise CorrectionConflict("unproven_inventory_effect") from None
    if effect_delta == 0:
        raise CorrectionConflict("unproven_inventory_effect")
    if effect_delta != Decimal(str(log.quantity_change)):
        raise CorrectionConflict("inventory_effect_mismatch")
    warehouse_snapshots = (log.warehouse_qty_before, log.warehouse_qty_after)
    if any(value is not None for value in warehouse_snapshots):
        if any(value is None for value in warehouse_snapshots):
            raise CorrectionConflict("inventory_effect_mismatch")
        warehouse_delta = Decimal(str(log.warehouse_qty_after)) - Decimal(
            str(log.warehouse_qty_before)
        )
        if warehouse_delta != effect_delta:
            raise CorrectionConflict("inventory_effect_mismatch")
    department_snapshots = (log.department_qty_before, log.department_qty_after)
    if any(value is not None for value in department_snapshots):
        if any(value is None for value in department_snapshots):
            raise CorrectionConflict("inventory_effect_mismatch")
        if Decimal(str(log.department_qty_before)) != Decimal(
            str(log.department_qty_after)
        ):
            raise CorrectionConflict("inventory_effect_mismatch")


def _assert_correction_source(
    db: Session,
    *,
    log: TransactionLog,
    operation: InventoryOperation | None,
) -> None:
    if log.cancelled or log.reverses_log_id is not None or (
        db.query(TransactionLog.log_id)
        .filter(TransactionLog.reverses_log_id == log.log_id)
        .first()
        is not None
    ):
        raise CorrectionConflict("transaction_cancelled")
    if (
        db.query(TransactionEditLog.edit_id)
        .filter(
            TransactionEditLog.original_log_id == log.log_id,
            TransactionEditLog.correction_log_id.isnot(None),
        )
        .first()
        is not None
    ):
        raise CorrectionConflict("already_corrected")
    if any(
        value is not None
        for value in (
            log.operation_batch_id,
            log.operation_line_id,
            log.shipping_request_id,
            log.shipping_phase,
            log.defect_quarantine_record_id,
            log.client_request_id,
        )
    ) or bool((log.reference_no or "").strip()):
        raise CorrectionConflict("workflow_linked")
    if operation is None and log.operation_role is not None:
        raise CorrectionConflict("workflow_linked")

    _assert_single_warehouse_effect(log)
    if operation is None:
        return
    if operation.kind != InventoryOperationKindEnum.BUSINESS:
        raise CorrectionConflict("transaction_cancelled")
    if log.operation_role != InventoryOperationRoleEnum.PRIMARY:
        raise CorrectionConflict("workflow_linked")
    expected_action = {
        TransactionTypeEnum.RECEIVE: "receive",
        TransactionTypeEnum.SHIP: "ship",
    }[log.transaction_type]
    if (
        operation.domain != "inventory_io"
        or operation.action != expected_action
        or operation.idempotency_key is not None
    ):
        raise CorrectionConflict("workflow_linked")
    if (
        db.query(InventoryOperation.operation_id)
        .filter(InventoryOperation.reverses_operation_id == operation.operation_id)
        .first()
        is not None
    ):
        raise CorrectionConflict("transaction_cancelled")
    operation_logs = (
        db.query(TransactionLog.log_id)
        .filter(TransactionLog.operation_id == operation.operation_id)
        .all()
    )
    if len(operation_logs) != 1 or operation_logs[0][0] != log.log_id:
        raise CorrectionConflict("multiple_inventory_effects")
    operation_effects = db.query(InventoryOperationEffect).filter(
        InventoryOperationEffect.operation_id == operation.operation_id
    ).all()
    if any(
        effect.effect_kind == InventoryOperationEffectKindEnum.WORKFLOW
        for effect in operation_effects
    ):
        raise CorrectionConflict("workflow_linked")
    if operation_effects or (
        db.query(DefectInventoryMovement.movement_id)
        .filter(DefectInventoryMovement.operation_id == operation.operation_id)
        .first()
        is not None
    ):
        raise CorrectionConflict("non_inventory_side_effect")


def _is_correction_unique_violation(exc: IntegrityError) -> bool:
    constraint = getattr(getattr(exc, "orig", None), "diag", None)
    constraint_name = getattr(constraint, "constraint_name", None)
    if constraint_name == "uq_transaction_edit_log_quantity_correction":
        return True
    message = str(getattr(exc, "orig", exc)).lower()
    return (
        "transaction_edit_logs.original_log_id" in message
        and "unique" in message
    )


def correct_transaction_quantity(
    db: Session,
    *,
    log_id: uuid.UUID,
    editor: Employee,
    new_quantity: Decimal,
    reason: str,
    request: Optional[Request],
) -> QuantityCorrectionResult:
    """재고 보정과 보정 원장·수정 이력·감사를 원자적으로 확정한다."""
    try:
        with transactional(db):
            owning_operation, log = _correction_operation_and_log(db, log_id)
            item = item_repository.get(db, log.item_id)
            if item is None:
                raise TransactionItemNotFound("품목을 찾을 수 없습니다.")
            if log.transaction_type not in {
                TransactionTypeEnum.RECEIVE,
                TransactionTypeEnum.SHIP,
            }:
                tx_type = getattr(log.transaction_type, "value", log.transaction_type)
                raise UnsupportedTransactionQuantityCorrection(
                    f"수량 보정은 RECEIVE / SHIP 유형만 지원합니다 (현재: {tx_type})."
                )
            if log.transaction_type == TransactionTypeEnum.SHIP and new_quantity >= 0:
                raise UnsupportedTransactionQuantityCorrection(
                    "SHIP의 수량 변화량은 음수여야 합니다."
                )
            if log.transaction_type == TransactionTypeEnum.RECEIVE and new_quantity <= 0:
                raise UnsupportedTransactionQuantityCorrection(
                    "RECEIVE의 수량 변화량은 양수여야 합니다."
                )

            _assert_correction_source(db, log=log, operation=owning_operation)
            locked_inventory = inventory_svc.lock_inventories(db, [log.item_id]).get(
                log.item_id
            )
            if locked_inventory is None:
                raise TransactionInventoryNotFound(log.item_id)
            delta = new_quantity - Decimal(str(log.quantity_change))
            new_warehouse = Decimal(str(locked_inventory.warehouse_qty or 0)) + delta
            if new_warehouse < 0:
                raise TransactionQuantityCorrectionShortage(
                    f"재고 부족: 보정 후 창고 재고가 {float(new_warehouse)}로 음수가 됩니다."
                )
            pending = Decimal(str(locked_inventory.pending_quantity or 0))
            if new_warehouse < pending:
                raise TransactionQuantityCorrectionShortage(
                    "예약 수량보다 창고 재고가 낮아질 수 없습니다."
                )

            before = _metadata_snapshot(log)
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
            if operation is None:
                raise CorrectionConflict("ledger_unavailable")
            cells_before = inv_effect._snapshot_cells(db, log.item_id)
            adjusted_inv, qty_before, applied_delta = inventory_svc._adjust_warehouse(
                db, log.item_id, new_warehouse
            )
            if Decimal(str(applied_delta)) != delta:
                raise CorrectionConflict("inventory_effect_mismatch")
            correction_log = operation_svc._attach_transaction(
                TransactionLog(
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
                    **inv_effect._capture_log_stock_snapshot(
                        db, log.item_id, cells_before
                    ),
                ),
                operation,
                InventoryOperationRoleEnum.CORRECTION,
            )
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
            db.flush()
            audit.record(
                db,
                request=request,
                action="transaction.quantity_correction",
                target_type="transaction_log",
                target_id=str(log.log_id),
                payload_summary=f"{editor.name}: delta={float(delta)}, {reason}",
            )
            result = QuantityCorrectionResult(
                original=log,
                correction=correction_log,
                item=item,
            )
    except IntegrityError as exc:
        if _is_correction_unique_violation(exc):
            raise CorrectionConflict("already_corrected") from exc
        raise
    return result


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
