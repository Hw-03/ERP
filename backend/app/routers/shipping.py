"""Shipping request router."""

from __future__ import annotations

import base64
import binascii
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from fastapi import Depends, Query, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, aliased

from app.database import get_db
from app.dependencies.verified_actor import (
    CurrentActor,
    VerifiedActor,
    VerifiedActorRouter,
    ensure_actor_employee_id,
    ensure_actor_employee_name,
)
from app.models import (
    DepartmentEnum,
    Employee,
    Item,
    ShippingRequest,
    ShippingRequestRevision,
    ShippingRequestStatusEnum,
    TransactionLog,
)
from app.routers._errors import ErrorCode, http_error
from app.schemas.shipping import (
    ShippingAllocationResponse,
    ShippingBomLineInput,
    ShippingBomLineResponse,
    ShippingBomMatchRequest,
    ShippingBomMatchResponse,
    ShippingChecklistLineResponse,
    ShippingChecklistUpdate,
    ShippingComponentChangeExecuteRequest,
    ShippingComponentChangePreviewResponse,
    ShippingComponentChangeResultResponse,
    ShippingCompanionLineResponse,
    ShippingPrepareCancelRequest,
    ShippingPrepareCompleteRequest,
    ShippingInvoiceUpdate,
    ShippingHistoryMonthResponse,
    ShippingHistoryPageResponse,
    ShippingRequestRevisionResponse,
    ShippingRequestCreate,
    ShippingRequestResponse,
    ShippingRequestUpdate,
    ShippingStockShortageResponse,
    ShippingTransactionLogResponse,
)
from app.services import shipping as shipping_svc
from app.services import shipping_actions as shipping_actions_svc
from app.services.shipping import ShippingConflictError, ShippingError
from app.utils.search import build_normalized_search_filter


router = VerifiedActorRouter()

_COMPONENT_CHANGE_DEPARTMENTS = {
    DepartmentEnum.ASSEMBLY.value,
    DepartmentEnum.SHIPPING.value,
}
_KST = timezone(timedelta(hours=9))
_LATEST_REVISION_UNSET = object()


def _line_payload(lines: list[ShippingBomLineInput] | None) -> list[dict] | None:
    if lines is None:
        return None
    return [line.model_dump() for line in lines]


def _companion_payload(lines) -> list[dict] | None:
    if lines is None:
        return None
    return [line.model_dump() for line in lines]


def _tx_log_response(log: TransactionLog) -> ShippingTransactionLogResponse:
    return ShippingTransactionLogResponse(
        log_id=log.log_id,
        item_id=log.item_id,
        item_name=log.item.item_name,
        mes_code=log.item.mes_code,
        item_process_type_code=log.item.process_type_code,
        transaction_type=log.transaction_type,
        quantity_change=int(log.quantity_change),
        quantity_before=int(log.quantity_before) if log.quantity_before is not None else None,
        quantity_after=int(log.quantity_after) if log.quantity_after is not None else None,
        warehouse_qty_before=int(log.warehouse_qty_before) if log.warehouse_qty_before is not None else None,
        warehouse_qty_after=int(log.warehouse_qty_after) if log.warehouse_qty_after is not None else None,
        reference_no=log.reference_no,
        produced_by=log.produced_by,
        notes=log.notes,
        shipping_phase=log.shipping_phase,
        created_at=log.created_at,
        cancelled=bool(log.cancelled),
        cancel_reason=log.cancel_reason,
        cancelled_at=log.cancelled_at,
        inventory_effect=log.inventory_effect,
    )


def _revision_response(revision: ShippingRequestRevision) -> ShippingRequestRevisionResponse:
    return ShippingRequestRevisionResponse(
        revision_id=revision.revision_id,
        request_id=revision.request_id,
        edited_by_employee_id=revision.edited_by_employee_id,
        edited_by_name=revision.edited_by_name,
        summary=revision.summary,
        affects_preparation=bool(revision.affects_preparation),
        changes=revision.changes,
        created_at=revision.created_at,
    )


def _latest_preparation_revisions(
    db: Session,
    request_ids: list[uuid.UUID],
) -> dict[uuid.UUID, ShippingRequestRevision]:
    if not request_ids:
        return {}
    ranked = (
        db.query(
            ShippingRequestRevision.revision_id,
            func.row_number()
            .over(
                partition_by=ShippingRequestRevision.request_id,
                order_by=(ShippingRequestRevision.created_at.desc(), ShippingRequestRevision.revision_id.desc()),
            )
            .label("revision_rank"),
        )
        .filter(
            ShippingRequestRevision.request_id.in_(request_ids),
            ShippingRequestRevision.affects_preparation.is_(True),
        )
        .subquery()
    )
    rows = (
        db.query(ShippingRequestRevision)
        .join(ranked, ShippingRequestRevision.revision_id == ranked.c.revision_id)
        .filter(ranked.c.revision_rank == 1)
        .all()
    )
    return {row.request_id: row for row in rows}


def _to_response(
    db: Session,
    req: ShippingRequest,
    latest_preparation_revision: ShippingRequestRevision | None | object = _LATEST_REVISION_UNSET,
) -> ShippingRequestResponse:
    if latest_preparation_revision is _LATEST_REVISION_UNSET:
        latest_preparation_revision = (
            db.query(ShippingRequestRevision)
            .filter(
                ShippingRequestRevision.request_id == req.request_id,
                ShippingRequestRevision.affects_preparation.is_(True),
            )
            .order_by(ShippingRequestRevision.created_at.desc(), ShippingRequestRevision.revision_id.desc())
            .first()
        )
    tx_rows = (
        db.query(TransactionLog)
        .filter(TransactionLog.shipping_request_id == req.request_id)
        .order_by(TransactionLog.created_at.asc(), TransactionLog.log_id.asc())
        .all()
    )
    return ShippingRequestResponse(
        request_id=req.request_id,
        status=req.status,
        base_pf_item_id=req.base_pf_item_id,
        base_pf_item_name=req.base_pf_item.item_name,
        base_pf_mes_code=req.base_pf_item.mes_code,
        request_quantity=int(req.request_quantity or 1),
        final_pa_item_id=req.final_pa_item_id,
        final_pa_item_name=req.final_pa_item.item_name if req.final_pa_item else None,
        final_pf_item_id=req.final_pf_item_id,
        final_pf_item_name=req.final_pf_item.item_name if req.final_pf_item else None,
        finalization_mode=req.finalization_mode,
        reuse_pf_item_id=req.reuse_pf_item_id,
        requested_by_name=req.requested_by_name,
        custom_pa_name=req.custom_pa_name,
        custom_pf_name=req.custom_pf_name,
        notes=req.notes,
        invoice_number=req.invoice_number,
        serial_numbers=req.serial_numbers,
        prepared_at=req.prepared_at,
        prepared_by_employee_id=req.prepared_by_employee_id,
        prepared_by_name=req.prepared_by_name,
        picked_up_at=req.picked_up_at,
        cancelled_at=req.cancelled_at,
        cancelled_by_employee_id=req.cancelled_by_employee_id,
        cancelled_by_name=req.cancelled_by_name,
        created_at=req.created_at,
        updated_at=req.updated_at,
        bom_lines=[
            ShippingBomLineResponse(
                line_id=line.line_id,
                parent_stage=line.parent_stage,
                child_item_id=line.child_item_id,
                item_name=line.child_item.item_name,
                mes_code=line.child_item.mes_code,
                process_type_code=line.child_item.process_type_code,
                quantity=int(line.quantity),
                unit=line.unit,
                included=bool(line.included),
                origin=line.origin,
            )
            for line in req.bom_lines
        ],
        companion_lines=[
            ShippingCompanionLineResponse(
                line_id=line.line_id,
                item_id=line.item_id,
                item_name=line.item.item_name,
                mes_code=line.item.mes_code,
                process_type_code=line.item.process_type_code,
                quantity=int(line.quantity),
                unit=line.unit,
            )
            for line in req.companion_lines
        ],
        checklist_lines=[
            ShippingChecklistLineResponse(
                line_id=line.line_id,
                item_id=line.item_id,
                item_name=line.item.item_name,
                mes_code=line.item.mes_code,
                process_type_code=line.item.process_type_code,
                quantity=int(line.quantity),
                checked=bool(line.checked),
            )
            for line in req.checklist_lines
        ],
        events=list(req.events),
        latest_preparation_revision=(
            _revision_response(latest_preparation_revision)
            if isinstance(latest_preparation_revision, ShippingRequestRevision)
            else None
        ),
        transactions=[_tx_log_response(log) for log in tx_rows],
        allocations=[
            ShippingAllocationResponse(
                allocation_id=allocation.allocation_id,
                request_id=allocation.request_id,
                item_id=allocation.item_id,
                item_name=allocation.item.item_name,
                mes_code=allocation.item.mes_code,
                process_type_code=allocation.item.process_type_code,
                quantity=int(allocation.quantity),
                unit=allocation.unit,
                department=allocation.department,
                status=allocation.status,
                reference_no=allocation.reference_no,
                created_at=allocation.created_at,
                released_at=allocation.released_at,
                consumed_at=allocation.consumed_at,
                released_reason=allocation.released_reason,
            )
            for allocation in req.allocations
        ],
        stock_shortages=[
            ShippingStockShortageResponse(**shortage)
            for shortage in shipping_svc._prepare_stock_shortages(db, req)
        ],
        transaction_count=len(tx_rows),
    )


def _action_or_422(db: Session, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    try:
        return func(db, *args, **kwargs)
    except ShippingConflictError as exc:
        raise http_error(status.HTTP_409_CONFLICT, ErrorCode.CONFLICT, str(exc))
    except ShippingError as exc:
        raise http_error(status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.BUSINESS_RULE, str(exc))
    except ValueError as exc:
        raise http_error(status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.STOCK_SHORTAGE, str(exc))


def _validate_component_change_actor(requester: Employee) -> None:
    """품목 전환은 활성 조립·출하 직원에게만 허용한다."""
    if not bool(requester.is_active):
        raise http_error(
            status.HTTP_403_FORBIDDEN,
            ErrorCode.FORBIDDEN,
            "비활성 직원은 품목 전환을 실행할 수 없습니다.",
        )
    department = getattr(requester.department, "value", requester.department)
    if department not in _COMPONENT_CHANGE_DEPARTMENTS:
        raise http_error(
            status.HTTP_403_FORBIDDEN,
            ErrorCode.FORBIDDEN,
            "품목 전환은 조립·출하 부서만 사용할 수 있습니다.",
        )


def _load_component_change_requester(
    requester_employee_id: uuid.UUID,
    db: Session,
) -> Employee:
    requester = (
        db.query(Employee)
        .filter(Employee.employee_id == requester_employee_id)
        .first()
    )
    if requester is None:
        raise http_error(status.HTTP_404_NOT_FOUND, ErrorCode.NOT_FOUND, "작업자(직원)를 찾을 수 없습니다.")
    _validate_component_change_actor(requester)
    return requester


@router.get("/component-change-preview", response_model=ShippingComponentChangePreviewResponse)
def component_change_preview_independent(
    requester_employee_id: uuid.UUID = Query(...),
    source_pa_item_id: uuid.UUID = Query(...),
    target_pa_item_id: uuid.UUID = Query(...),
    quantity: int = Query(..., gt=0),
    requested_mode: str = Query("BOM", pattern="^(SPEC|BOM)$"),
    db: Session = Depends(get_db),
):
    _load_component_change_requester(requester_employee_id, db)
    try:
        return shipping_svc.component_change_preview_independent(
            db,
            source_pa_item_id,
            target_pa_item_id,
            quantity,
            requested_mode,
        )
    except ShippingError as exc:
        raise http_error(status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.BUSINESS_RULE, str(exc))


@router.post("/component-change", response_model=ShippingComponentChangeResultResponse)
def component_change_independent(
    payload: ShippingComponentChangeExecuteRequest,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
):
    _validate_component_change_actor(actor)

    if payload.target_pa_item_id is None:
        raise http_error(status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.BUSINESS_RULE, "대상 PA를 선택해야 합니다.")
    try:
        result = shipping_actions_svc.execute_component_change_independent(
            db,
            payload.source_pa_item_id,
            payload.target_pa_item_id,
            payload.quantity,
            payload.memo,
            payload.requested_mode,
            actor=actor,
        )
        return ShippingComponentChangeResultResponse(
            **{key: value for key, value in result.items() if key != "transactions"},
            transactions=[_tx_log_response(log) for log in result["transactions"]],
        )
    except ShippingError as exc:
        raise http_error(status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.BUSINESS_RULE, str(exc))
    except ValueError as exc:
        raise http_error(status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.STOCK_SHORTAGE, str(exc))

@router.get("/requests", response_model=list[ShippingRequestResponse])
def list_requests(
    status_filter: Optional[ShippingRequestStatusEnum] = Query(None, alias="status"),
    db: Session = Depends(get_db),
):
    query = db.query(ShippingRequest)
    if status_filter is not None:
        query = query.filter(ShippingRequest.status == status_filter)
    else:
        query = query.filter(ShippingRequest.status != ShippingRequestStatusEnum.CANCELLED)
    rows = query.order_by(ShippingRequest.created_at.desc(), ShippingRequest.request_id.desc()).all()
    latest_revisions = _latest_preparation_revisions(db, [row.request_id for row in rows])
    return [_to_response(db, row, latest_revisions.get(row.request_id)) for row in rows]


@router.get("/requests/{request_id}", response_model=ShippingRequestResponse)
def get_request(request_id: uuid.UUID, db: Session = Depends(get_db)):
    try:
        req = shipping_svc.get_request(db, request_id)
    except ShippingError as exc:
        raise http_error(status.HTTP_404_NOT_FOUND, ErrorCode.NOT_FOUND, str(exc))
    return _to_response(db, req)


@router.post("/requests", response_model=ShippingRequestResponse, status_code=status.HTTP_201_CREATED)
def create_request(
    payload: ShippingRequestCreate,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
):
    ensure_actor_employee_name(actor, payload.requested_by_name)
    req = _action_or_422(
        db,
        shipping_actions_svc.create_request,
        {
            "base_pf_item_id": payload.base_pf_item_id,
            "finalization_mode": payload.finalization_mode,
            "reuse_pf_item_id": payload.reuse_pf_item_id,
            "requested_by_name": actor.name,
            "request_quantity": payload.request_quantity,
            "custom_pa_name": payload.custom_pa_name,
            "custom_pf_name": payload.custom_pf_name,
            "notes": payload.notes,
            "invoice_number": payload.invoice_number,
            "bom_lines": _line_payload(payload.bom_lines),
            "companion_lines": _companion_payload(payload.companion_lines),
        },
        actor,
    )
    return _to_response(db, req)


@router.patch("/requests/{request_id}", response_model=ShippingRequestResponse)
def update_request(
    request_id: uuid.UUID,
    payload: ShippingRequestUpdate,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
):
    ensure_actor_employee_name(actor, payload.requested_by_name)
    update = payload.model_dump(exclude_unset=True)
    if "requested_by_name" in update:
        update["requested_by_name"] = actor.name
    if "bom_lines" in update:
        update["bom_lines"] = _line_payload(payload.bom_lines)
    if "companion_lines" in update:
        update["companion_lines"] = _companion_payload(payload.companion_lines)
    req = _action_or_422(db, shipping_actions_svc.update_request, request_id, update, actor)
    return _to_response(db, req)


@router.delete("/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_request(request_id: uuid.UUID, actor: VerifiedActor, db: Session = Depends(get_db)):
    _action_or_422(db, shipping_actions_svc.delete_request, request_id, actor)
    return None


@router.patch("/requests/{request_id}/invoice", response_model=ShippingRequestResponse)
def update_invoice(
    request_id: uuid.UUID,
    payload: ShippingInvoiceUpdate,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
):
    req = _action_or_422(
        db,
        shipping_actions_svc.update_invoice,
        request_id,
        payload.invoice_number,
        actor,
    )
    return _to_response(db, req)


@router.get("/requests/{request_id}/revisions", response_model=list[ShippingRequestRevisionResponse])
def list_revisions(request_id: uuid.UUID, db: Session = Depends(get_db)):
    _action_or_422(db, shipping_svc._get_request, request_id)
    rows = (
        db.query(ShippingRequestRevision)
        .filter(ShippingRequestRevision.request_id == request_id)
        .order_by(ShippingRequestRevision.created_at.desc(), ShippingRequestRevision.revision_id.desc())
        .all()
    )
    return [_revision_response(row) for row in rows]

@router.post("/requests/{request_id}/send-to-prep", response_model=ShippingRequestResponse)
def send_to_prep(request_id: uuid.UUID, actor: VerifiedActor, db: Session = Depends(get_db)):
    req = _action_or_422(db, shipping_actions_svc.send_to_prep, request_id, actor)
    return _to_response(db, req)


@router.patch("/requests/{request_id}/checklist", response_model=ShippingRequestResponse)
def update_checklist(request_id: uuid.UUID, payload: ShippingChecklistUpdate, actor: VerifiedActor, db: Session = Depends(get_db)):
    checks = {line.item_id: line.checked for line in payload.checks}
    req = _action_or_422(db, shipping_actions_svc.update_checklist, request_id, checks, actor)
    return _to_response(db, req)


@router.post("/requests/{request_id}/checklist/clear", response_model=ShippingRequestResponse)
def clear_checklist(request_id: uuid.UUID, actor: VerifiedActor, db: Session = Depends(get_db)):
    req = _action_or_422(db, shipping_actions_svc.clear_checklist, request_id, actor)
    return _to_response(db, req)


@router.get("/requests/{request_id}/component-change-preview", response_model=ShippingComponentChangePreviewResponse)
def component_change_preview(
    request_id: uuid.UUID,
    actor: CurrentActor,
    source_pa_item_id: uuid.UUID = Query(...),
    quantity: int = Query(..., gt=0),
    requester_employee_id: uuid.UUID | None = Query(None),
    requested_mode: str = Query("BOM", pattern="^(SPEC|BOM)$"),
    db: Session = Depends(get_db),
):
    _validate_component_change_actor(actor)
    ensure_actor_employee_id(actor, requester_employee_id)
    return _action_or_422(
        db,
        shipping_actions_svc.component_change_preview,
        request_id,
        source_pa_item_id,
        quantity,
        requested_mode,
        actor=actor,
    )


@router.post("/requests/{request_id}/component-change", response_model=ShippingRequestResponse)
def component_change(
    request_id: uuid.UUID,
    payload: ShippingComponentChangeExecuteRequest,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
):
    _validate_component_change_actor(actor)
    req = _action_or_422(
        db,
        shipping_actions_svc.execute_component_change,
        request_id,
        payload.source_pa_item_id,
        payload.quantity,
        payload.requested_mode,
        payload.memo,
        actor=actor,
    )
    return _to_response(db, req)


@router.post("/requests/{request_id}/prepare-complete", response_model=ShippingRequestResponse)
def prepare_complete(
    request_id: uuid.UUID,
    payload: ShippingPrepareCompleteRequest,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
):
    req = _action_or_422(
        db,
        shipping_actions_svc.prepare_complete,
        request_id,
        payload.serial_numbers,
        actor=actor,
    )
    return _to_response(db, req)


@router.post("/requests/{request_id}/prepare-cancel", response_model=ShippingRequestResponse)
def prepare_cancel(request_id: uuid.UUID, payload: ShippingPrepareCancelRequest, actor: VerifiedActor, db: Session = Depends(get_db)):
    req = _action_or_422(
        db,
        shipping_actions_svc.prepare_cancel,
        request_id,
        payload.reason,
        actor=actor,
    )
    return _to_response(db, req)


@router.post("/requests/{request_id}/pickup-complete", response_model=ShippingRequestResponse)
def pickup_complete(request_id: uuid.UUID, actor: VerifiedActor, db: Session = Depends(get_db)):
    req = _action_or_422(db, shipping_actions_svc.pickup_complete, request_id, actor)
    return _to_response(db, req)


@router.post("/requests/{request_id}/pickup-cancel", response_model=ShippingRequestResponse)
def pickup_cancel(request_id: uuid.UUID, actor: VerifiedActor, db: Session = Depends(get_db)):
    req = _action_or_422(db, shipping_actions_svc.pickup_cancel, request_id, actor)
    return _to_response(db, req)


def _history_cursor(request: ShippingRequest, sort_at: datetime) -> str:
    payload = {"sort_at": sort_at.isoformat(), "request_id": str(request.request_id)}
    return base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")


def _decode_history_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        value = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
        return datetime.fromisoformat(value["sort_at"]), uuid.UUID(value["request_id"])
    except (ValueError, KeyError, TypeError, UnicodeDecodeError, json.JSONDecodeError, binascii.Error):
        raise http_error(status.HTTP_400_BAD_REQUEST, ErrorCode.BAD_REQUEST, "유효하지 않은 출하 이력 커서입니다.")


def _history_sort_at(request: ShippingRequest) -> datetime:
    return request.picked_up_at if request.status == ShippingRequestStatusEnum.PICKED_UP else request.cancelled_at


def _to_kst(timestamp: datetime) -> datetime:
    """UTC naive로 저장된 이력 시각을 KST 업무 시각으로 바꾼다."""
    return timestamp.replace(tzinfo=timezone.utc).astimezone(_KST) if timestamp.tzinfo is None else timestamp.astimezone(_KST)


def _kst_month_bounds_utc(year: int, month: int | None) -> tuple[datetime, datetime]:
    start = datetime(year, month or 1, 1, tzinfo=_KST)
    end = (
        datetime(year + 1, 1, 1, tzinfo=_KST)
        if month is None or month == 12
        else datetime(year, month + 1, 1, tzinfo=_KST)
    )
    return (
        start.astimezone(timezone.utc).replace(tzinfo=None),
        end.astimezone(timezone.utc).replace(tzinfo=None),
    )


@router.get("/history/months", response_model=list[ShippingHistoryMonthResponse])
def history_months(
    status_filter: ShippingRequestStatusEnum | None = Query(None, alias="status"),
    year: int | None = Query(None, ge=2020, le=2100),
    db: Session = Depends(get_db),
):
    allowed = [ShippingRequestStatusEnum.PICKED_UP, ShippingRequestStatusEnum.CANCELLED]
    if status_filter is not None:
        if status_filter not in allowed:
            raise http_error(status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.UNPROCESSABLE, "출하 이력은 완료 또는 취소 상태만 조회할 수 있습니다.")
        allowed = [status_filter]
    rows = (
        db.query(
            ShippingRequest.status,
            ShippingRequest.picked_up_at,
            ShippingRequest.cancelled_at,
        )
        .filter(ShippingRequest.status.in_(allowed))
        .all()
    )
    counts: dict[tuple[int, int], int] = {}
    for request_status, picked_up_at, cancelled_at in rows:
        sort_at = picked_up_at if request_status == ShippingRequestStatusEnum.PICKED_UP else cancelled_at
        if sort_at is None:
            continue
        kst_at = _to_kst(sort_at)
        if year is None or kst_at.year == year:
            key = (kst_at.year, kst_at.month)
            counts[key] = counts.get(key, 0) + 1
    return [
        ShippingHistoryMonthResponse(year=month_year, month=month, count=count)
        for (month_year, month), count in sorted(counts.items(), reverse=True)
    ]


@router.get("/history", response_model=ShippingHistoryPageResponse)
def history(
    status_filter: ShippingRequestStatusEnum | None = Query(None, alias="status"),
    year: int | None = Query(None, ge=2020, le=2100),
    month: int | None = Query(None, ge=1, le=12),
    q: str | None = Query(None, max_length=100),
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=50),
    db: Session = Depends(get_db),
):
    if month is not None and year is None:
        raise http_error(status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.UNPROCESSABLE, "월 필터에는 연도 필터가 필요합니다.")
    allowed = [ShippingRequestStatusEnum.PICKED_UP, ShippingRequestStatusEnum.CANCELLED]
    if status_filter is not None:
        if status_filter not in allowed:
            raise http_error(status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.UNPROCESSABLE, "출하 이력은 완료 또는 취소 상태만 조회할 수 있습니다.")
        allowed = [status_filter]
    final_pf = aliased(Item)
    base_pf = aliased(Item)
    sort_at = func.coalesce(ShippingRequest.picked_up_at, ShippingRequest.cancelled_at)
    effective_pf_name = func.coalesce(
        final_pf.item_name,
        func.nullif(ShippingRequest.custom_pf_name, ""),
        base_pf.item_name,
    )
    query = (
        db.query(ShippingRequest)
        .outerjoin(final_pf, ShippingRequest.final_pf_item_id == final_pf.item_id)
        .join(base_pf, ShippingRequest.base_pf_item_id == base_pf.item_id)
        .filter(ShippingRequest.status.in_(allowed))
    )
    if year is not None:
        start, end = _kst_month_bounds_utc(year, month)
        query = query.filter(sort_at >= start, sort_at < end)
    search_filter = build_normalized_search_filter(
        q,
        ShippingRequest.invoice_number,
        effective_pf_name,
    )
    if search_filter is not None:
        query = query.filter(search_filter)
    if cursor:
        cursor_at, cursor_id = _decode_history_cursor(cursor)
        query = query.filter(or_(sort_at < cursor_at, and_(sort_at == cursor_at, ShippingRequest.request_id < cursor_id)))
    rows = query.order_by(sort_at.desc(), ShippingRequest.request_id.desc()).limit(limit + 1).all()
    page = rows[:limit]
    has_more = len(rows) > limit
    latest_revisions = _latest_preparation_revisions(db, [row.request_id for row in page])
    return ShippingHistoryPageResponse(
        requests=[_to_response(db, row, latest_revisions.get(row.request_id)) for row in page],
        next_cursor=_history_cursor(page[-1], _history_sort_at(page[-1])) if has_more and page else None,
        has_more=has_more,
    )


@router.post("/bom-match", response_model=ShippingBomMatchResponse)
def bom_match(payload: ShippingBomMatchRequest, db: Session = Depends(get_db)):
    try:
        return shipping_svc.match_bom(
            db,
            [line.model_dump() for line in payload.bom_lines],
            payload.base_pf_item_id,
        )
    except ShippingError as exc:
        raise http_error(status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.BUSINESS_RULE, str(exc))
