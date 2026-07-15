"""Shipping request router."""

from __future__ import annotations

import uuid
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app._actor import get_actor_emp, set_actor
from app.database import get_db
from app.models import (
    DepartmentEnum,
    Employee,
    ShippingRequest,
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
    ShippingRequestCreate,
    ShippingRequestResponse,
    ShippingRequestUpdate,
    ShippingStockShortageResponse,
    ShippingTransactionLogResponse,
)
from app.services import shipping as shipping_svc
from app.services import shipping_actions as shipping_actions_svc
from app.services.shipping import ShippingError


router = APIRouter()

_COMPONENT_CHANGE_DEPARTMENTS = {
    DepartmentEnum.ASSEMBLY.value,
    DepartmentEnum.SHIPPING.value,
}


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


def _to_response(db: Session, req: ShippingRequest) -> ShippingRequestResponse:
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
        requested_by_name=req.requested_by_name,
        custom_pa_name=req.custom_pa_name,
        custom_pf_name=req.custom_pf_name,
        notes=req.notes,
        prepared_at=req.prepared_at,
        picked_up_at=req.picked_up_at,
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
            for shortage in shipping_svc.prepare_stock_shortages(db, req)
        ],
        transaction_count=len(tx_rows),
    )


def _action_or_422(db: Session, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    try:
        return func(db, *args, **kwargs)
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


def _load_component_change_actor(http_request: Request, db: Session) -> Employee:
    employee_code = get_actor_emp(http_request)
    if employee_code == "-":
        raise http_error(status.HTTP_400_BAD_REQUEST, ErrorCode.BAD_REQUEST, "작업자 사번 헤더가 필요합니다.")
    requester = db.query(Employee).filter(Employee.employee_code == employee_code).first()
    if requester is None:
        raise http_error(status.HTTP_404_NOT_FOUND, ErrorCode.NOT_FOUND, "작업자(직원)를 찾을 수 없습니다.")
    _validate_component_change_actor(requester)
    set_actor(http_request, requester)
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
    http_request: Request,
    db: Session = Depends(get_db),
):
    requester = _load_component_change_actor(http_request, db)

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
            requester_name=requester.name,
            requester_employee_id=requester.employee_id,
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
    rows = query.order_by(ShippingRequest.created_at.desc(), ShippingRequest.request_id.desc()).all()
    return [_to_response(db, row) for row in rows]


@router.post("/requests", response_model=ShippingRequestResponse, status_code=status.HTTP_201_CREATED)
def create_request(payload: ShippingRequestCreate, db: Session = Depends(get_db)):
    req = _action_or_422(
        db,
        shipping_actions_svc.create_request,
        {
            "base_pf_item_id": payload.base_pf_item_id,
            "requested_by_name": payload.requested_by_name,
            "request_quantity": payload.request_quantity,
            "custom_pa_name": payload.custom_pa_name,
            "custom_pf_name": payload.custom_pf_name,
            "notes": payload.notes,
            "bom_lines": _line_payload(payload.bom_lines),
            "companion_lines": _companion_payload(payload.companion_lines),
        },
    )
    return _to_response(db, req)


@router.patch("/requests/{request_id}", response_model=ShippingRequestResponse)
def update_request(request_id: uuid.UUID, payload: ShippingRequestUpdate, db: Session = Depends(get_db)):
    update = payload.model_dump(exclude_unset=True)
    if "bom_lines" in update:
        update["bom_lines"] = _line_payload(payload.bom_lines)
    if "companion_lines" in update:
        update["companion_lines"] = _companion_payload(payload.companion_lines)
    req = _action_or_422(db, shipping_actions_svc.update_request, request_id, update)
    return _to_response(db, req)


@router.delete("/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_request(request_id: uuid.UUID, db: Session = Depends(get_db)):
    _action_or_422(db, shipping_actions_svc.delete_request, request_id)
    return None

@router.post("/requests/{request_id}/send-to-prep", response_model=ShippingRequestResponse)
def send_to_prep(request_id: uuid.UUID, db: Session = Depends(get_db)):
    req = _action_or_422(db, shipping_actions_svc.send_to_prep, request_id)
    return _to_response(db, req)


@router.patch("/requests/{request_id}/checklist", response_model=ShippingRequestResponse)
def update_checklist(request_id: uuid.UUID, payload: ShippingChecklistUpdate, db: Session = Depends(get_db)):
    checks = {line.item_id: line.checked for line in payload.checks}
    req = _action_or_422(db, shipping_actions_svc.update_checklist, request_id, checks)
    return _to_response(db, req)


@router.post("/requests/{request_id}/checklist/clear", response_model=ShippingRequestResponse)
def clear_checklist(request_id: uuid.UUID, db: Session = Depends(get_db)):
    req = _action_or_422(db, shipping_actions_svc.clear_checklist, request_id)
    return _to_response(db, req)


@router.get("/requests/{request_id}/component-change-preview", response_model=ShippingComponentChangePreviewResponse)
def component_change_preview(
    request_id: uuid.UUID,
    requester_employee_id: uuid.UUID = Query(...),
    source_pa_item_id: uuid.UUID = Query(...),
    quantity: int = Query(..., gt=0),
    requested_mode: str = Query("BOM", pattern="^(SPEC|BOM)$"),
    db: Session = Depends(get_db),
):
    _load_component_change_requester(requester_employee_id, db)
    try:
        return shipping_svc.component_change_preview(db, request_id, source_pa_item_id, quantity, requested_mode)
    except ShippingError as exc:
        raise http_error(status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.BUSINESS_RULE, str(exc))


@router.post("/requests/{request_id}/component-change", response_model=ShippingRequestResponse)
def component_change(
    request_id: uuid.UUID,
    payload: ShippingComponentChangeExecuteRequest,
    http_request: Request,
    db: Session = Depends(get_db),
):
    requester = _load_component_change_actor(http_request, db)
    req = _action_or_422(
        db,
        shipping_actions_svc.execute_component_change,
        request_id,
        payload.source_pa_item_id,
        payload.quantity,
        payload.requested_mode,
        payload.memo,
        requester_name=requester.name,
        requester_employee_id=requester.employee_id,
    )
    return _to_response(db, req)


@router.post("/requests/{request_id}/prepare-complete", response_model=ShippingRequestResponse)
def prepare_complete(request_id: uuid.UUID, payload: ShippingPrepareCompleteRequest, db: Session = Depends(get_db)):
    req = _action_or_422(db, shipping_actions_svc.prepare_complete, request_id)
    return _to_response(db, req)


@router.post("/requests/{request_id}/prepare-cancel", response_model=ShippingRequestResponse)
def prepare_cancel(request_id: uuid.UUID, payload: ShippingPrepareCancelRequest, db: Session = Depends(get_db)):
    req = _action_or_422(db, shipping_actions_svc.prepare_cancel, request_id, payload.reason)
    return _to_response(db, req)


@router.post("/requests/{request_id}/pickup-complete", response_model=ShippingRequestResponse)
def pickup_complete(request_id: uuid.UUID, db: Session = Depends(get_db)):
    req = _action_or_422(db, shipping_actions_svc.pickup_complete, request_id)
    return _to_response(db, req)


@router.get("/history", response_model=list[ShippingRequestResponse])
def history(db: Session = Depends(get_db)):
    rows = (
        db.query(ShippingRequest)
        .filter(ShippingRequest.status == ShippingRequestStatusEnum.PICKED_UP)
        .order_by(ShippingRequest.picked_up_at.desc(), ShippingRequest.created_at.desc())
        .all()
    )
    return [_to_response(db, row) for row in rows]


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
