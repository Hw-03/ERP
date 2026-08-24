"""건별 불량 격리 수량의 조회·예약·차감 규칙."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    DefectQuarantineRecord,
    DefectQuarantineMemoRevision,
    StockRequestLine,
    StockRequestStatusEnum,
)


def _department_value(department: object) -> str:
    return str(getattr(department, "value", department))


def create_record(
    db: Session,
    *,
    item_id: uuid.UUID,
    department: object,
    quantity: Decimal,
    actor_employee_id: Optional[uuid.UUID],
    actor_name: Optional[str],
    reason_category: Optional[str],
    memo: Optional[str],
    quarantined_at: Optional[datetime] = None,
) -> DefectQuarantineRecord:
    """한 번의 격리와 최초 메모 감사 행을 같은 세션에 생성한다."""
    quantity = Decimal(str(quantity))
    if quantity <= 0:
        raise ValueError("격리 수량은 0보다 커야 합니다.")
    occurred_at = quarantined_at or datetime.utcnow()
    record = DefectQuarantineRecord(
        item_id=item_id,
        department=_department_value(department),
        original_quantity=quantity,
        remaining_quantity=quantity,
        quarantined_at=occurred_at,
        quarantined_by_employee_id=actor_employee_id,
        quarantined_by_name=actor_name,
        reason_category=reason_category,
        current_memo=memo,
        is_legacy=False,
    )
    db.add(record)
    db.flush()
    db.add(
        DefectQuarantineMemoRevision(
            record_id=record.record_id,
            previous_memo=None,
            next_memo=memo,
            edited_by_employee_id=actor_employee_id,
            edited_by_name=actor_name or "시스템",
            edited_at=occurred_at,
            is_initial=True,
        )
    )
    return record


def get_record_for_action(
    db: Session,
    *,
    record_id: Optional[uuid.UUID],
    item_id: uuid.UUID,
    department: object,
    lock: bool = True,
) -> Optional[DefectQuarantineRecord]:
    """선택 기록을 검증하고, 구형 단일 기록 호출만 안전하게 보완한다."""
    department_value = _department_value(department)
    query = db.query(DefectQuarantineRecord)
    if record_id is not None:
        query = query.filter(DefectQuarantineRecord.record_id == record_id)
    else:
        query = query.filter(
            DefectQuarantineRecord.item_id == item_id,
            DefectQuarantineRecord.department == department_value,
            DefectQuarantineRecord.remaining_quantity > 0,
        )
    if lock and db.bind is not None and db.bind.dialect.name != "sqlite":
        query = query.with_for_update()
    records = query.all()

    if record_id is None and len(records) > 1:
        raise ValueError("격리 기록이 여러 건입니다. 처리할 기록을 선택해 주세요.")
    if not records:
        # 마이그레이션 이전에 생성된 위치만 있는 데이터는 기존 집계 처리와 호환한다.
        return None

    record = records[0]
    if record.item_id != item_id or str(record.department) != department_value:
        raise ValueError("선택한 격리 기록의 품목 또는 부서가 일치하지 않습니다.")
    return record


def pending_quantity(
    db: Session,
    record_id: uuid.UUID,
    *,
    exclude_line_id: Optional[uuid.UUID] = None,
) -> Decimal:
    """기록에 연결된 활성 승인 대기 수량을 계산한다."""
    query = db.query(func.coalesce(func.sum(StockRequestLine.quantity), 0)).filter(
        StockRequestLine.defect_quarantine_record_id == record_id,
        StockRequestLine.status == StockRequestStatusEnum.RESERVED,
    )
    if exclude_line_id is not None:
        query = query.filter(StockRequestLine.line_id != exclude_line_id)
    return Decimal(str(query.scalar() or 0))


def ensure_available(
    db: Session,
    record: DefectQuarantineRecord,
    quantity: Decimal,
    *,
    exclude_line_id: Optional[uuid.UUID] = None,
) -> None:
    """남은 수량에서 다른 승인 대기 수량을 뺀 범위인지 검증한다."""
    quantity = Decimal(str(quantity))
    pending = pending_quantity(
        db,
        record.record_id,
        exclude_line_id=exclude_line_id,
    )
    available = Decimal(str(record.remaining_quantity or 0)) - pending
    if quantity <= 0:
        raise ValueError("처리 수량은 0보다 커야 합니다.")
    if available < quantity:
        raise ValueError(
            f"선택한 격리 기록의 처리 가능 수량이 부족합니다: "
            f"가능 {available}개, 요청 {quantity}개."
        )


def decrement_record(
    db: Session,
    record: DefectQuarantineRecord,
    quantity: Decimal,
    *,
    exclude_line_id: Optional[uuid.UUID] = None,
) -> None:
    """검증된 수량만 선택 기록에서 차감한다."""
    quantity = Decimal(str(quantity))
    ensure_available(
        db,
        record,
        quantity,
        exclude_line_id=exclude_line_id,
    )
    record.remaining_quantity = Decimal(str(record.remaining_quantity)) - quantity
