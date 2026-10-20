"""공통 재고 작업 단위 이력·상세·취소 API."""

from __future__ import annotations

import csv
import json
import uuid
from dataclasses import asdict
from datetime import date
from io import StringIO
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app._actor import set_actor
from app.database import get_db
from app.models import (
    BusinessCorrection,
    DefectStockMovement,
    DefectStockPool,
    Employee,
    InventoryOperation,
    InventoryOperationKindEnum,
    IoBatch,
    Item,
    StocktakeApplication,
    StocktakeApplicationLine,
    TransactionLog,
)
from app.routers._errors import ErrorCode, http_error
from app.routers.inventory._tx_filters import _history_request_date_expr
from app.routers.inventory.transactions import _enforce_export_limit, _require_export_range
from app.services import inventory_operation_cancellation as cancellation_svc
from app.services.pin_auth import verify_pin
from app.services.export_helpers import csv_streaming_response
from app.services.request_order_stock import load_request_order_stock
from app.services.inventory_operation_history import (
    item_operation_ids, operation_payload as _operation_payload,
    _correction_operation_ids,
)


router = APIRouter()


class OperationCancelRequest(BaseModel):
    reason: str = Field(..., min_length=1)
    employee_code: str = Field(..., min_length=1, max_length=30)
    pin: str = Field(..., min_length=1, max_length=20)
    plan_hash: str = Field(..., min_length=64, max_length=64)


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
        matching_ids = item_operation_ids(db, item_id)
        query = query.filter(InventoryOperation.operation_id.in_(matching_ids))
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


OPERATION_EXPORT_COLUMNS = [
    "row_type", "effective_at", "operation_id", "domain", "action", "display_label",
    "actor_name", "item_id", "item_name", "mes_code", "scope_key", "source_id",
    "source_operation_id", "source_operation_ids", "transaction_log_id", "count_id", "confirmation_revision_id",
    "quantity_change", "before_quantities",
    "after_quantities", "observation_epoch_before", "observation_epoch_after", "reason",
]


def _operation_export_rows(db: Session, start_date: date | None, end_date: date | None) -> list[dict]:
    """Export typed evidence without inventing a transaction for a zero delta."""
    start_dt, end_dt = _require_export_range(start_date, end_date)
    operations = db.query(InventoryOperation).filter(
        InventoryOperation.effective_at >= start_dt,
        InventoryOperation.effective_at < end_dt,
    ).order_by(InventoryOperation.effective_at.desc(), InventoryOperation.operation_id.desc()).all()
    rows = []
    for operation in operations:
        base = {
            "effective_at": operation.effective_at.isoformat(),
            "operation_id": str(operation.operation_id),
            "domain": operation.domain,
            "action": operation.action,
            "display_label": operation.display_label,
            "actor_name": operation.actor_name,
            "reason": operation.reason or "",
        }
        logs = db.query(TransactionLog, Item).join(Item, Item.item_id == TransactionLog.item_id).filter(
            TransactionLog.operation_id == operation.operation_id
        ).order_by(TransactionLog.created_at, TransactionLog.log_id).all()
        for log, item in logs:
            rows.append({**base, "row_type": "TRANSACTION", "item_id": str(item.item_id),
                "item_name": item.item_name, "mes_code": item.mes_code or "",
                "source_id": str(log.log_id), "transaction_log_id": str(log.log_id),
                "quantity_change": str(log.quantity_change)})
        observations = db.query(StocktakeApplicationLine, StocktakeApplication, Item).join(
            StocktakeApplication, StocktakeApplication.application_id == StocktakeApplicationLine.application_id
        ).join(Item, Item.item_id == StocktakeApplicationLine.item_id).filter(
            StocktakeApplication.operation_id == operation.operation_id
        ).order_by(StocktakeApplicationLine.scope_key, StocktakeApplicationLine.item_id).all()
        for line, application, item in observations:
            rows.append({**base, "row_type": "STOCKTAKE_OBSERVATION", "item_id": str(item.item_id),
                "item_name": item.item_name, "mes_code": item.mes_code or "",
                "scope_key": line.scope_key, "source_id": str(application.application_id),
                "count_id": str(line.count_id),
                "confirmation_revision_id": str(line.confirmation_revision_id),
                "before_quantities": json.dumps(line.before_quantities, ensure_ascii=False, sort_keys=True),
                "after_quantities": json.dumps(line.after_quantities, ensure_ascii=False, sort_keys=True),
                "observation_epoch_before": line.observation_epoch_before,
                "observation_epoch_after": line.observation_epoch_after})
        correction = db.query(BusinessCorrection).filter_by(application_operation_id=operation.operation_id).one_or_none()
        if correction is not None:
            source_operation_ids = _correction_operation_ids(db, correction)
            rows.append({**base, "row_type": "BUSINESS_CORRECTION", "source_id": str(correction.correction_id),
                "source_operation_id": source_operation_ids[0] if len(source_operation_ids) == 1 else "",
                "source_operation_ids": json.dumps(source_operation_ids)})
        if not logs and not observations and correction is None:
            rows.append({**base, "row_type": "OPERATION"})
        _enforce_export_limit(len(rows))
    return rows


@router.get("/operations/export.csv")
def export_operations_csv(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    db: Session = Depends(get_db),
):
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=OPERATION_EXPORT_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(_operation_export_rows(db, start_date, end_date))
    return csv_streaming_response(buffer, "operations-export.csv")


@router.get("/operations/export.xlsx")
def export_operations_xlsx(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    db: Session = Depends(get_db),
):
    from openpyxl import Workbook
    from app.utils.excel import apply_header, auto_width, make_xlsx_response

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "작업 이력"
    apply_header(sheet, OPERATION_EXPORT_COLUMNS)
    for row in _operation_export_rows(db, start_date, end_date):
        sheet.append([row.get(column, "") for column in OPERATION_EXPORT_COLUMNS])
    auto_width(sheet)
    return make_xlsx_response(workbook, "operations-export.xlsx")


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
    """배치 요청자를 본인으로 판정하고, 배치가 없는 직접 작업만 실행자를 사용한다."""
    employee = db.query(Employee).filter(Employee.employee_code == employee_code).one_or_none()
    if employee is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")
    if not bool(employee.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원은 작업을 취소할 수 없습니다.")
    if not verify_pin(employee.pin_hash, pin):
        raise http_error(403, ErrorCode.FORBIDDEN, "PIN이 올바르지 않습니다.")
    requester_ids = {
        requester_id
        for (requester_id,) in db.query(IoBatch.requester_employee_id)
        .join(TransactionLog, TransactionLog.operation_batch_id == IoBatch.batch_id)
        .filter(TransactionLog.operation_id == operation.operation_id)
        .distinct()
        .all()
    }
    is_self = (
        requester_ids == {employee.employee_id}
        if requester_ids
        else operation.actor_employee_id == employee.employee_id
    )
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
