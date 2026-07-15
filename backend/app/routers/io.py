"""입출고 탭 2.0 API router."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    IoBatchResponse,
    IoDraftUpsert,
    IoPreviewRequest,
    IoPreviewResponse,
    IoSubmitRequest,
    IoSubmitResponse,
)
from app.schemas.shipping import (
    ItemConversionExecuteRequest,
    ShippingComponentChangePreviewResponse,
    ShippingComponentChangeResultResponse,
    ShippingTransactionLogResponse,
)
from app._evt import emit as _evt_emit
from app.services import io as io_svc
from app.services import io_actions as io_actions_svc
from app.services import shipping as shipping_svc
from app.services import shipping_actions as shipping_actions_svc
from app.services.shipping import ShippingError
from app.services._tx import commit_only
from app.models import Employee, TransactionLog


router = APIRouter()


def _load_item_conversion_requester(db: Session, employee_id: uuid.UUID) -> Employee:
    """활성 조립·출하 직원만 품목 전환 요청자로 반환한다."""
    requester = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if requester is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "요청자(직원)를 찾을 수 없습니다.")
    if not bool(requester.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원은 요청할 수 없습니다.")
    department = getattr(requester.department, "value", requester.department)
    if department not in {"조립", "출하"}:
        raise http_error(
            403,
            ErrorCode.FORBIDDEN,
            "조립 또는 출하 부서 직원만 품목 전환이 가능합니다.",
        )
    return requester


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


@router.get("/item-conversion-preview", response_model=ShippingComponentChangePreviewResponse)
def item_conversion_preview(
    requester_employee_id: uuid.UUID = Query(...),
    source_item_id: uuid.UUID = Query(...),
    target_item_id: uuid.UUID = Query(...),
    quantity: int = Query(..., gt=0),
    requested_mode: Optional[str] = Query(None, pattern="^(SPEC|BOM)$"),
    db: Session = Depends(get_db),
):
    _load_item_conversion_requester(db, requester_employee_id)
    try:
        return shipping_svc.component_change_preview_independent(
            db,
            source_item_id,
            target_item_id,
            quantity,
            requested_mode,
        )
    except ShippingError as exc:
        db.rollback()
        raise http_error(status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.BUSINESS_RULE, str(exc))


@router.post("/item-conversion", response_model=ShippingComponentChangeResultResponse)
def execute_item_conversion(payload: ItemConversionExecuteRequest, db: Session = Depends(get_db)):
    requester = _load_item_conversion_requester(db, payload.requester_employee_id)

    try:
        result = shipping_actions_svc.execute_component_change_independent(
            db,
            payload.source_item_id,
            payload.target_item_id,
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


@router.post("/preview", response_model=IoPreviewResponse)
def preview_io(payload: IoPreviewRequest, db: Session = Depends(get_db)):
    try:
        if payload.work_type == "internal_use" or payload.sub_type == "internal_use_out":
            if payload.requester_employee_id is None:
                raise ValueError("사내 사용 미리보기에는 requester_employee_id가 필요합니다.")
            requester = io_svc._load_requester(db, payload.requester_employee_id)
            io_svc.validate_internal_use_requester(
                requester,
                work_type=payload.work_type,
                sub_type=payload.sub_type,
            )
        return io_svc.preview(
            db,
            work_type=payload.work_type,
            sub_type=payload.sub_type,
            from_department=payload.from_department,
            to_department=payload.to_department,
            targets=payload.targets,
        )
    except PermissionError as exc:
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))


@router.put("/draft", response_model=IoBatchResponse)
def save_io_draft(payload: IoDraftUpsert, http_request: Request, db: Session = Depends(get_db)):
    try:
        draft = io_svc.save_draft(db, payload)
    except PermissionError as exc:
        db.rollback()
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    commit_only(db)
    _evt_emit(
        "io_draft",
        request=http_request,
        batch_id=str(draft.get("batch_id"))[:8],
        work_type=draft.get("work_type"),
        sub_type=draft.get("sub_type"),
        lines=len(draft.get("bundles") or []),
        requester=draft.get("requester_name"),
    )
    return draft


@router.get("/draft", response_model=Optional[IoBatchResponse])
def get_io_draft(
    requester_employee_id: uuid.UUID = Query(...),
    work_type: str = Query(...),
    sub_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return io_svc.get_draft(
        db,
        requester_employee_id=requester_employee_id,
        work_type=work_type,
        sub_type=sub_type,
    )


@router.get("/drafts", response_model=list[IoBatchResponse])
def list_io_drafts(
    requester_employee_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    return io_svc.list_drafts(db, requester_employee_id=requester_employee_id)


@router.delete("/draft/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_io_draft(
    batch_id: uuid.UUID,
    requester_employee_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    try:
        io_svc.delete_draft(
            db,
            batch_id=batch_id,
            requester_employee_id=requester_employee_id,
        )
    except PermissionError as exc:
        db.rollback()
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    commit_only(db)
    return None


@router.post("/submit", response_model=IoSubmitResponse, status_code=status.HTTP_201_CREATED)
def submit_io(payload: IoSubmitRequest, http_request: Request, db: Session = Depends(get_db)):
    try:
        result = io_actions_svc.submit(db, payload)
        _batch = result.get("batch") or {}
        _evt_emit(
            "io_submit",
            request=http_request,
            batch_id=str(_batch.get("batch_id"))[:8],
            work_type=_batch.get("work_type"),
            sub_type=_batch.get("sub_type"),
            lines=len(_batch.get("bundles") or []),
            requires_approval=result.get("requires_approval"),
            requester=_batch.get("requester_name"),
        )
        return result
    except PermissionError as exc:
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    except IntegrityError as exc:
        # client_request_id 중복 → 기존 batch 멱등 반환 (더블클릭/네트워크 retry 보호)
        if payload.client_request_id and "client_request_id" in str(exc).lower():
            existing = io_svc.find_by_client_request_id(db, payload.client_request_id)
            if existing is not None:
                return io_svc.build_idempotent_response(existing)
            raise http_error(
                409,
                ErrorCode.CONFLICT,
                "이미 처리된 요청입니다. 새 작업으로 다시 시도해 주세요.",
            )
        # 그 외 unique 제약 위반 (request_code 충돌 등) — 즉시 재시도 권장.
        raise http_error(
            409,
            ErrorCode.CONFLICT,
            f"제출에 일시적 충돌이 발생했습니다. 잠시 후 다시 시도해 주세요. ({exc.__class__.__name__})",
        )


@router.post(
    "/draft/{batch_id}/submit",
    response_model=IoSubmitResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_io_draft(
    batch_id: uuid.UUID,
    http_request: Request,
    requester_employee_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    try:
        result = io_actions_svc.submit_existing_draft(
            db,
            batch_id=batch_id,
            requester_employee_id=requester_employee_id,
        )
    except PermissionError as exc:
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    _batch = result.get("batch") or {}
    _evt_emit(
        "io_submit",
        request=http_request,
        batch_id=str(_batch.get("batch_id"))[:8],
        work_type=_batch.get("work_type"),
        sub_type=_batch.get("sub_type"),
        lines=len(_batch.get("bundles") or []),
        requires_approval=result.get("requires_approval"),
        requester=_batch.get("requester_name"),
        source="draft",
    )
    return result


@router.get("/{batch_id}", response_model=IoBatchResponse)
def get_io_batch(batch_id: uuid.UUID, db: Session = Depends(get_db)):
    batch = io_svc.get_batch(db, batch_id=batch_id)
    if batch is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "입출고 작업 묶음을 찾을 수 없습니다.")
    return batch
