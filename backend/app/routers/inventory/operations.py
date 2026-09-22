"""공통 재고 작업 단위 이력·상세·취소 API."""

from __future__ import annotations

import uuid
from dataclasses import asdict
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app._actor import set_actor
from app.database import get_db
from app.models import (
    DefectInventoryMovement,
    Employee,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationKindEnum,
    Item,
    TransactionLog,
)
from app.routers._errors import ErrorCode, http_error
from app.routers.inventory._tx_filters import (
    _batch_name_map,
    _history_batch_response,
    _history_request_date_expr,
    _stock_request_info_map,
    _to_log_response,
)
from app.schemas import RequestOrderStockResponse, TransactionLogResponse
from app.services import inventory_operation_cancellation as cancellation_svc
from app.services.pin_auth import verify_pin
from app.services.request_order_stock import load_request_order_stock


router = APIRouter()


class OperationCancelRequest(BaseModel):
    reason: str = Field(..., min_length=1)
    employee_code: str = Field(..., min_length=1, max_length=30)
    pin: str = Field(..., min_length=1, max_length=20)
    plan_hash: str = Field(..., min_length=64, max_length=64)


def _line_payload(
    log: TransactionLog,
    item: Item | None,
    *,
    movement_quantity: object | None = None,
    history_log: TransactionLogResponse | None = None,
) -> dict:
    transfer_qty = log.transfer_qty if log.transfer_qty is not None else movement_quantity
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
        "transfer_qty": str(transfer_qty) if transfer_qty is not None else None,
        "department": log.department,
        "operation_role": log.operation_role.value if log.operation_role else None,
        "reverses_log_id": str(log.reverses_log_id) if log.reverses_log_id else None,
        "reference_no": log.reference_no,
        "notes": log.notes,
        "created_at": log.created_at,
        "history_log": history_log,
    }


def _history_log_map(
    db: Session,
    logs: list[TransactionLog],
    items: dict[uuid.UUID, Item],
    operation: InventoryOperation,
    reversal: InventoryOperation | None,
    request_order_stock: dict[uuid.UUID, RequestOrderStockResponse],
) -> dict[uuid.UUID, TransactionLogResponse]:
    """작업 행을 기존 거래 이력과 동일한 감사 응답으로 보강한다."""
    batch_map = _batch_name_map(
        db, {log.operation_batch_id for log in logs if log.operation_batch_id}
    )
    stock_request_map = _stock_request_info_map(
        db, {log.reference_no for log in logs if log.reference_no}
    )
    response_by_log_id: dict[uuid.UUID, TransactionLogResponse] = {}
    for log in logs:
        item = items.get(log.item_id)
        if item is None:
            continue
        info = stock_request_map.get(log.reference_no) if log.reference_no else None
        if info is None:
            info = batch_map.get(log.operation_batch_id)
        response = _to_log_response(
            log,
            item,
            requester_name=info.requester_name if info else None,
            approver_name=info.approver_name if info else None,
            requested_at=info.requested_at if info else None,
            approved_at=info.approved_at if info else None,
            operation=operation,
            reversal=reversal,
            history_batch=_history_batch_response(batch_map.get(log.operation_batch_id)),
        )
        response.request_order_stock = request_order_stock.get(log.log_id)
        response_by_log_id[log.log_id] = response
    return response_by_log_id


def _operation_payload(
    db: Session,
    operation: InventoryOperation,
    *,
    selected_item_id: uuid.UUID | None = None,
    request_order_stock: dict[uuid.UUID, RequestOrderStockResponse] | None = None,
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
    movement_quantities = {
        item_id: abs(quantity)
        for item_id, quantity in (
            db.query(
                DefectInventoryMovement.item_id,
                func.sum(DefectInventoryMovement.quantity_delta),
            )
            .filter(DefectInventoryMovement.operation_id == operation.operation_id)
            .group_by(DefectInventoryMovement.item_id)
            .all()
        )
        if quantity is not None and quantity != 0
    }
    if operation.kind == InventoryOperationKindEnum.CANCELLATION:
        effective_status = "cancellation"
    elif reversal is not None:
        effective_status = "cancelled"
    else:
        effective_status = "active"
    if request_order_stock is None:
        request_order_stock = load_request_order_stock(
            db,
            item_ids,
            request_date_expr=_history_request_date_expr(),
        )
    history_logs = _history_log_map(
        db,
        logs,
        items,
        operation,
        reversal,
        request_order_stock,
    )
    matching_lines = [
        _line_payload(
            log,
            items.get(log.item_id),
            movement_quantity=movement_quantities.get(log.item_id),
            history_log=history_logs.get(log.log_id),
        )
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
    except cancellation_svc.CancellationError as exc:
        can_cancel = False
        cancel_blockers = [str(exc)]
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
        "lines": [
            _line_payload(
                log,
                items.get(log.item_id),
                movement_quantity=movement_quantities.get(log.item_id),
                history_log=history_logs.get(log.log_id),
            )
            for log in logs
        ],
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
    page_item_ids = {
        item_id
        for (item_id,) in (
            db.query(TransactionLog.item_id)
            .filter(TransactionLog.operation_id.in_([row.operation_id for row in rows]))
            .distinct()
            .all()
        )
    } if rows else set()
    request_order_stock = load_request_order_stock(
        db,
        page_item_ids,
        request_date_expr=_history_request_date_expr(),
    )
    return {
        "items": [
            _operation_payload(
                db,
                operation,
                selected_item_id=item_id,
                request_order_stock=request_order_stock,
            )
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
    item_ids = {
        item_id
        for (item_id,) in (
            db.query(TransactionLog.item_id)
            .filter(TransactionLog.operation_id == operation.operation_id)
            .distinct()
            .all()
        )
    }
    request_order_stock = load_request_order_stock(
        db,
        item_ids,
        request_date_expr=_history_request_date_expr(),
    )
    return _operation_payload(
        db,
        operation,
        request_order_stock=request_order_stock,
    )


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
    db: Session,
    *,
    operation: InventoryOperation,
    employee_code: str,
    pin: str,
) -> Employee:
    employee = db.query(Employee).filter(Employee.employee_code == employee_code).one_or_none()
    if employee is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")
    if not bool(employee.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원은 작업을 취소할 수 없습니다.")
    if not verify_pin(employee.pin_hash, pin):
        raise http_error(403, ErrorCode.FORBIDDEN, "PIN이 올바르지 않습니다.")
    is_self = operation.actor_employee_id == employee.employee_id
    is_approver = (
        (employee.warehouse_role or "none").lower() != "none"
        or (employee.department_role or "none").lower() != "none"
    )
    if not (is_self or is_approver):
        raise http_error(403, ErrorCode.FORBIDDEN, "본인 작업 또는 결재 권한자만 취소할 수 있습니다.")
    return employee


@router.post("/operations/{operation_id}/cancel")
def cancel_operation(
    operation_id: uuid.UUID,
    payload: OperationCancelRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    operation = db.get(InventoryOperation, operation_id)
    if operation is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "작업을 찾을 수 없습니다.")
    canceller = _verified_canceller(
        db,
        operation=operation,
        employee_code=payload.employee_code,
        pin=payload.pin,
    )
    set_actor(request, canceller)
    try:
        cancellation = cancellation_svc.cancel_operation(
            db,
            operation_id=operation_id,
            canceller=canceller,
            reason=payload.reason,
            plan_hash=payload.plan_hash,
        )
    except cancellation_svc.CancellationPlanChanged as exc:
        raise http_error(409, ErrorCode.CONFLICT, str(exc)) from exc
    except cancellation_svc.CancellationNotAllowed as exc:
        raise http_error(422, ErrorCode.BUSINESS_RULE, str(exc)) from exc
    return _operation_payload(db, cancellation)
