"""출하 단계의 잠금과 처리 회차를 두 취소 진입점에서 공유한다."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session, aliased

from app.models import (
    InventoryOperation, InventoryOperationEffect, InventoryOperationEffectKindEnum,
    InventoryOperationKindEnum, ShippingRequest,
)


def lock_request(db: Session, request_id: uuid.UUID) -> ShippingRequest | None:
    """대기 중 다른 명령이 바꾼 상태까지 다시 읽은 뒤 단계 전이를 판정한다."""
    query = db.query(ShippingRequest).filter(ShippingRequest.request_id == request_id)
    if db.get_bind().dialect.name != "sqlite":
        query = query.with_for_update()
    return query.populate_existing().one_or_none()


def latest_operation(
    db: Session, request_id: uuid.UUID, action: str, *, active_only: bool = False,
) -> InventoryOperation | None:
    """키 문자열이 아닌 업무 연결로 회차를 찾으므로 기존 보정 기록도 지원한다."""
    query = (
        db.query(InventoryOperation)
        .join(InventoryOperationEffect, InventoryOperationEffect.operation_id == InventoryOperation.operation_id)
        .filter(
            InventoryOperation.kind == InventoryOperationKindEnum.BUSINESS,
            InventoryOperation.domain == "shipping",
            InventoryOperation.action == action,
            InventoryOperationEffect.effect_kind == InventoryOperationEffectKindEnum.WORKFLOW,
            InventoryOperationEffect.subject_type == "ShippingRequest",
            InventoryOperationEffect.subject_id == str(request_id),
        )
    )
    if active_only:
        reversal = aliased(InventoryOperation)
        query = query.filter(~db.query(reversal.operation_id).filter(
            reversal.reverses_operation_id == InventoryOperation.operation_id,
        ).exists())
    return query.order_by(InventoryOperation.effective_at.desc(), InventoryOperation.created_at.desc(), InventoryOperation.operation_id.desc()).first()


def next_operation_key(db: Session, request_id: uuid.UUID, action: str) -> str:
    """같은 명령의 재시도는 상태 잠금으로 막고 정상 재처리는 새 회차로 기록한다."""
    previous = latest_operation(db, request_id, action)
    key = f"shipping:{request_id}:{action}"
    return f"{key}:after:{previous.operation_id}" if previous else key
