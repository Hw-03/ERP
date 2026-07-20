"""거래 수량 보정·취소 업무 명령의 트랜잭션 경계."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import Employee, Item, TransactionEditLog, TransactionLog, TransactionTypeEnum
from app.repositories import inventory_repository, item_repository
from app.services import audit, inv_effect, inventory as inventory_svc
from app.services._tx import transactional
from app.services.inv_calc import _sync_total


class TransactionInventoryNotFound(LookupError):
    """취소할 거래에 대응하는 재고 레코드가 없을 때 발생한다."""

    def __init__(self, item_id: uuid.UUID) -> None:
        self.item_id = item_id
        super().__init__(f"재고 레코드를 찾을 수 없습니다 (item={item_id}).")


class TransactionLogNotFound(LookupError):
    """메타데이터를 수정할 원본 거래가 없을 때 발생한다."""


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
        cells_before = inv_effect.snapshot_cells(db, log.item_id)
        adjusted_inv, qty_before, _applied_delta = inventory_svc.adjust_warehouse(
            db, log.item_id, new_warehouse
        )
        correction_log = TransactionLog(
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
            inventory_effect=inv_effect.capture_effect(db, log.item_id, cells_before),
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
        audit.record(
            db,
            request=request,
            action="transaction.quantity_correction",
            target_type="transaction_log",
            target_id=str(log.log_id),
            payload_summary=f"{editor.name}: delta={float(delta)}, {reason}",
        )
    return correction_log


def _cancel_one_log(db: Session, log: TransactionLog) -> None:
    """기록된 재고 효과를 역재생한다."""
    effect = log.inventory_effect
    if effect is None:
        raise ValueError("재고 효과 기록이 없어 자동 취소할 수 없습니다.")
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
    inv_effect.apply_effect_reverse(db, log.item_id, effect)


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
        batch_logs: list[TransactionLog] = []
        if log.operation_batch_id:
            batch_logs = (
                db.query(TransactionLog)
                .filter(
                    TransactionLog.operation_batch_id == log.operation_batch_id,
                    TransactionLog.cancelled.is_(False),
                )
                .all()
            )
        elif log.reference_no and log.reference_no.startswith("defect-disassemble:"):
            batch_logs = (
                db.query(TransactionLog)
                .filter(
                    TransactionLog.reference_no == log.reference_no,
                    TransactionLog.cancelled.is_(False),
                )
                .all()
            )
        if not batch_logs:
            batch_logs = [log]

        now = datetime.utcnow()
        for batch_log in batch_logs:
            inventory = inventory_repository.get(db, batch_log.item_id)
            if inventory is None:
                raise TransactionInventoryNotFound(batch_log.item_id)
            _cancel_one_log(db, batch_log)
            _sync_total(db, inventory)
            batch_log.cancelled = True
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
