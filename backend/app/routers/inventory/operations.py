"""공통 재고 작업 단위 이력·상세·취소 API."""

from __future__ import annotations

import uuid
from dataclasses import asdict
from typing import Optional

from fastapi import Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.verified_actor import (
    VerifiedActor,
    VerifiedActorRouter,
    ensure_actor_employee_code,
)
from app.models import (
    Employee,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationKindEnum,
    Item,
    TransactionLog,
)
from app.routers._errors import ErrorCode, http_error
from app.services import inventory_operation_cancellation as cancellation_svc
from app.services import rate_limit


router = VerifiedActorRouter()


class OperationCancelRequest(BaseModel):
    reason: str = Field(..., min_length=1)
    employee_code: str = Field(..., min_length=1, max_length=30)
    pin: str = Field(..., min_length=1, max_length=20)
    plan_hash: str = Field(..., min_length=64, max_length=64)


def _line_payload(log: TransactionLog, item: Item | None) -> dict:
    return {
        "log_id": str(log.log_id),
        "item_id": str(log.item_id),
        "item_name": item.item_name if item else None,
        "mes_code": item.mes_code if item else None,
        "transaction_type": log.transaction_type.value,
        "quantity_change": str(log.quantity_change),
        "quantity_before": (
            str(log.quantity_before) if log.quantity_before is not None else None
        ),
        "quantity_after": (
            str(log.quantity_after) if log.quantity_after is not None else None
        ),
        "transfer_qty": str(log.transfer_qty) if log.transfer_qty is not None else None,
        "department": log.department,
        "operation_role": log.operation_role.value if log.operation_role else None,
        "reverses_log_id": str(log.reverses_log_id) if log.reverses_log_id else None,
        "reference_no": log.reference_no,
        "notes": log.notes,
        "created_at": log.created_at,
    }


def _operation_payload(
    db: Session,
    operation: InventoryOperation,
    *,
    selected_item_id: uuid.UUID | None = None,
) -> dict:
    logs = (
        db.query(TransactionLog)
        .filter(TransactionLog.operation_id == operation.operation_id)
        .order_by(TransactionLog.created_at.asc(), TransactionLog.log_id.asc())
        .all()
    )
    item_ids = {log.item_id for log in logs}
    items = {
        item.item_id: item
        for item in db.query(Item).filter(Item.item_id.in_(item_ids)).all()
    } if item_ids else {}
    reversal = (
        db.query(InventoryOperation)
        .filter(InventoryOperation.reverses_operation_id == operation.operation_id)
        .one_or_none()
    )
    effects = (
        db.query(InventoryOperationEffect)
        .filter(InventoryOperationEffect.operation_id == operation.operation_id)
        .order_by(
            InventoryOperationEffect.created_at.asc(),
            InventoryOperationEffect.effect_id.asc(),
        )
        .all()
    )
    if operation.kind == InventoryOperationKindEnum.CANCELLATION:
        effective_status = "cancellation"
    elif reversal is not None:
        effective_status = "cancelled"
    else:
        effective_status = "active"
    matching_lines = [
        _line_payload(log, items.get(log.item_id))
        for log in logs
        if selected_item_id is None or log.item_id == selected_item_id
    ]
    try:
        cancel_plan = cancellation_svc.preview_cancellation(
            db,
            operation.operation_id,
        )
        can_cancel = cancel_plan.can_cancel
        cancel_blockers = list(cancel_plan.blockers)
        cancel_warnings = list(cancel_plan.warnings)
    except cancellation_svc.CancellationError as exc:
        can_cancel = False
        cancel_blockers = [str(exc)]
        cancel_warnings = []
    return {
        "operation_id": str(operation.operation_id),
        "kind": operation.kind.value,
        "domain": operation.domain,
        "action": operation.action,
        "display_label": operation.display_label,
        "effective_status": effective_status,
        "actor_employee_id": (
            str(operation.actor_employee_id) if operation.actor_employee_id else None
        ),
        "actor_name": operation.actor_name,
        "department": operation.department,
        "reason": operation.reason,
        "effective_at": operation.effective_at,
        "reverses_operation_id": (
            str(operation.reverses_operation_id)
            if operation.reverses_operation_id
            else None
        ),
        "reversal_operation_id": str(reversal.operation_id) if reversal else None,
        "can_cancel": can_cancel,
        "cancel_blockers": cancel_blockers,
        "cancel_warnings": cancel_warnings,
        "lines": [_line_payload(log, items.get(log.item_id)) for log in logs],
        "matching_lines": matching_lines,
        "effects": [
            {
                "effect_id": str(effect.effect_id),
                "effect_kind": effect.effect_kind.value,
                "subject_type": effect.subject_type,
                "subject_id": effect.subject_id,
                "role": effect.role,
                "before_state": effect.before_state,
                "after_state": effect.after_state,
                "reverses_effect_id": (
                    str(effect.reverses_effect_id)
                    if effect.reverses_effect_id
                    else None
                ),
            }
            for effect in effects
        ],
    }


@router.get("/operations/summary")
def operation_summary(db: Session = Depends(get_db)) -> dict:
    rows = (
        db.query(InventoryOperation.kind, func.count(InventoryOperation.operation_id))
        .group_by(InventoryOperation.kind)
        .all()
    )
    counts = {kind: int(count) for kind, count in rows}
    business = counts.get(InventoryOperationKindEnum.BUSINESS, 0)
    cancellations = counts.get(InventoryOperationKindEnum.CANCELLATION, 0)
    return {
        "total": business + cancellations,
        "business_count": business,
        "cancellation_count": cancellations,
    }


@router.get("/operations")
def list_operations(
    item_id: Optional[uuid.UUID] = Query(None),
    kind: Optional[InventoryOperationKindEnum] = Query(None),
    domain: Optional[str] = Query(None),
    cursor: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(InventoryOperation)
    if item_id is not None:
        query = query.join(
            TransactionLog,
            TransactionLog.operation_id == InventoryOperation.operation_id,
        ).filter(TransactionLog.item_id == item_id)
    if kind is not None:
        query = query.filter(InventoryOperation.kind == kind)
    if domain:
        query = query.filter(InventoryOperation.domain == domain)
    if cursor:
        try:
            cursor_time_raw, cursor_id_raw = cursor.rsplit("|", 1)
            from datetime import datetime

            cursor_time = datetime.fromisoformat(cursor_time_raw)
            cursor_id = uuid.UUID(cursor_id_raw)
        except (TypeError, ValueError) as exc:
            raise http_error(400, ErrorCode.BAD_REQUEST, "커서 형식이 올바르지 않습니다.") from exc
        query = query.filter(
            (InventoryOperation.effective_at < cursor_time)
            | (
                (InventoryOperation.effective_at == cursor_time)
                & (InventoryOperation.operation_id < cursor_id)
            )
        )
    rows = (
        query.distinct()
        .order_by(
            InventoryOperation.effective_at.desc(),
            InventoryOperation.operation_id.desc(),
        )
        .limit(limit + 1)
        .all()
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = None
    if has_more and rows:
        last = rows[-1]
        next_cursor = f"{last.effective_at.isoformat()}|{last.operation_id}"
    return {
        "items": [
            _operation_payload(db, operation, selected_item_id=item_id)
            for operation in rows
        ],
        "next_cursor": next_cursor,
    }


@router.get("/operations/{operation_id}")
def get_operation(
    operation_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> dict:
    operation = db.get(InventoryOperation, operation_id)
    if operation is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "작업을 찾을 수 없습니다.")
    return _operation_payload(db, operation)


@router.post("/operations/{operation_id}/cancel/preview")
def preview_operation_cancel(
    operation_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> dict:
    try:
        plan = cancellation_svc.preview_cancellation(db, operation_id)
    except cancellation_svc.CancellationOperationNotFound as exc:
        raise http_error(404, ErrorCode.NOT_FOUND, str(exc)) from exc
    return asdict(plan)


def _verified_canceller(
    *,
    operation: InventoryOperation,
    actor: Employee,
    pin: str,
    http_request: Request,
) -> Employee:
    if not bool(actor.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원은 작업을 취소할 수 없습니다.")
    try:
        pin_is_valid = rate_limit.verify_operator_pin(actor, pin, http_request)
    except rate_limit.OperatorPinRateLimitExceeded as exc:
        raise http_error(429, ErrorCode.TOO_MANY_REQUESTS, str(exc)) from exc
    if not pin_is_valid:
        raise http_error(403, ErrorCode.FORBIDDEN, "PIN이 올바르지 않습니다.")
    is_self = operation.actor_employee_id == actor.employee_id
    is_approver = (
        (actor.warehouse_role or "none").lower() != "none"
        or (actor.department_role or "none").lower() != "none"
    )
    if not (is_self or is_approver):
        raise http_error(403, ErrorCode.FORBIDDEN, "본인 작업 또는 결재 권한자만 취소할 수 있습니다.")
    return actor


@router.post("/operations/{operation_id}/cancel")
def cancel_operation(
    operation_id: uuid.UUID,
    payload: OperationCancelRequest,
    http_request: Request,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
) -> dict:
    operation = db.get(InventoryOperation, operation_id)
    if operation is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "작업을 찾을 수 없습니다.")
    ensure_actor_employee_code(actor, payload.employee_code)
    canceller = _verified_canceller(
        operation=operation,
        actor=actor,
        pin=payload.pin,
        http_request=http_request,
    )
    try:
        cancellation = cancellation_svc.cancel_operation(
            db,
            operation_id=operation_id,
            canceller=canceller,
            reason=payload.reason,
            plan_hash=payload.plan_hash,
        )
    except cancellation_svc.WorkflowCancellationConflict as exc:
        raise http_error(409, exc.reason_code, str(exc)) from exc
    except cancellation_svc.CancellationPlanChanged as exc:
        raise http_error(409, ErrorCode.CONFLICT, str(exc)) from exc
    except cancellation_svc.CancellationNotAllowed as exc:
        raise http_error(422, ErrorCode.BUSINESS_RULE, str(exc)) from exc
    return _operation_payload(db, cancellation)
