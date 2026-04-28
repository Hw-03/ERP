"""StockRequest 라우터 — 작업자 결재 요청 / 창고 담당자 승인 흐름.

기존 `/api/inventory/*` 즉시 입출고 API 는 그대로 유지된다. 본 라우터는 별도 도메인.
"""

from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Employee,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    ReservationLineResponse,
    StockRequestActionRequest,
    StockRequestCreate,
    StockRequestDraftUpsert,
    StockRequestResponse,
    StockRequestSubmitPayload,
)
from app.services import stock_requests as svc
from app.services._tx import commit_and_refresh, commit_only


router = APIRouter()


# ---------------------------------------------------------------------------
# 요청 생성
# ---------------------------------------------------------------------------


@router.post("", response_model=StockRequestResponse, status_code=status.HTTP_201_CREATED)
def create_stock_request(payload: StockRequestCreate, db: Session = Depends(get_db)):
    requester = (
        db.query(Employee)
        .filter(Employee.employee_id == payload.requester_employee_id)
        .first()
    )
    if requester is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "요청자(직원)를 찾을 수 없습니다.")
    if not bool(requester.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원은 요청할 수 없습니다.")

    lines_input = [
        svc.LineInput(
            item_id=li.item_id,
            quantity=li.quantity,
            from_bucket=li.from_bucket,
            from_department=li.from_department,
            to_bucket=li.to_bucket,
            to_department=li.to_department,
        )
        for li in payload.lines
    ]

    try:
        request = svc.create_request(
            db,
            requester=requester,
            request_type=payload.request_type,
            lines_input=lines_input,
            reference_no=payload.reference_no,
            notes=payload.notes,
        )
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    commit_and_refresh(db, request)
    db.refresh(request)
    return request


# ---------------------------------------------------------------------------
# 조회: 내 요청 / 승인함 / 점유 목록 / 단건
# ---------------------------------------------------------------------------


@router.get("", response_model=List[StockRequestResponse])
def list_stock_requests(
    requester_employee_id: Optional[uuid.UUID] = Query(None),
    status_filter: Optional[StockRequestStatusEnum] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(StockRequest)
    if requester_employee_id is not None:
        query = query.filter(StockRequest.requester_employee_id == requester_employee_id)
    if status_filter is not None:
        query = query.filter(StockRequest.status == status_filter)
    else:
        # status 미지정 시 DRAFT 제외 — '내 요청' 목록에 장바구니가 섞이면 안 됨.
        query = query.filter(StockRequest.status != StockRequestStatusEnum.DRAFT)
    rows = query.order_by(StockRequest.created_at.desc()).limit(limit).all()
    return rows


@router.get("/warehouse-queue", response_model=List[StockRequestResponse])
def list_warehouse_queue(db: Session = Depends(get_db), limit: int = Query(100, ge=1, le=500)):
    """창고 담당자 승인 대기 목록 (RESERVED 또는 SUBMITTED, 승인 필요)."""
    rows = (
        db.query(StockRequest)
        .filter(
            StockRequest.requires_warehouse_approval.is_(True),
            StockRequest.status.in_(
                (
                    StockRequestStatusEnum.RESERVED,
                    StockRequestStatusEnum.SUBMITTED,
                )
            ),
        )
        .order_by(StockRequest.created_at.asc())
        .limit(limit)
        .all()
    )
    return rows


@router.get("/reservations", response_model=List[ReservationLineResponse])
def list_item_reservations(
    item_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    """품목별 점유 라인 — InventoryDetailPanel 표시용."""
    lines = svc.list_active_reservations(db, item_id)
    out: List[ReservationLineResponse] = []
    for line in lines:
        req = line.request
        out.append(
            ReservationLineResponse(
                line_id=line.line_id,
                request_id=line.request_id,
                request_code=req.request_code,
                requester_name=req.requester_name,
                requester_department=req.requester_department,
                quantity=line.quantity,
                from_bucket=line.from_bucket,
                to_bucket=line.to_bucket,
                to_department=line.to_department,
                created_at=line.created_at,
            )
        )
    return out


# ---------------------------------------------------------------------------
# 장바구니(DRAFT) — 직원별 저장형 입출고 요청 초안
# ---------------------------------------------------------------------------
# 라우트 매칭 순서 주의: /draft, /drafts, /draft/{id} 는 /{request_id} 보다 먼저 등록.


@router.put("/draft", response_model=StockRequestResponse)
def upsert_stock_request_draft(
    payload: StockRequestDraftUpsert, db: Session = Depends(get_db)
):
    requester = (
        db.query(Employee)
        .filter(Employee.employee_id == payload.requester_employee_id)
        .first()
    )
    if requester is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "요청자(직원)를 찾을 수 없습니다.")
    if not bool(requester.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원은 요청할 수 없습니다.")

    lines_input = [
        svc.LineInput(
            item_id=li.item_id,
            quantity=li.quantity,
            from_bucket=li.from_bucket,
            from_department=li.from_department,
            to_bucket=li.to_bucket,
            to_department=li.to_department,
        )
        for li in payload.lines
    ]

    try:
        request = svc.upsert_draft_request(
            db,
            requester=requester,
            request_type=payload.request_type,
            lines_input=lines_input,
            reference_no=payload.reference_no,
            notes=payload.notes,
        )
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    commit_and_refresh(db, request)
    return request


@router.get("/draft", response_model=Optional[StockRequestResponse])
def get_stock_request_draft(
    requester_employee_id: uuid.UUID = Query(...),
    request_type: StockRequestTypeEnum = Query(...),
    db: Session = Depends(get_db),
):
    """단일 DRAFT 조회. 없으면 200 + null."""
    return svc.get_draft_request(
        db,
        requester_employee_id=requester_employee_id,
        request_type=request_type,
    )


@router.get("/drafts", response_model=List[StockRequestResponse])
def list_stock_request_drafts(
    requester_employee_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    """본인 DRAFT 목록만. 다른 직원 draft 노출 금지."""
    return svc.list_draft_requests(db, requester_employee_id=requester_employee_id)


@router.delete("/draft/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stock_request_draft(
    request_id: uuid.UUID,
    requester_employee_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    try:
        svc.delete_draft_request(
            db,
            request_id=request_id,
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


@router.get("/{request_id}", response_model=StockRequestResponse)
def get_stock_request(request_id: uuid.UUID, db: Session = Depends(get_db)):
    request = db.query(StockRequest).filter(StockRequest.request_id == request_id).first()
    if request is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "요청을 찾을 수 없습니다.")
    return request


# ---------------------------------------------------------------------------
# 승인 / 반려 / 취소
# ---------------------------------------------------------------------------


def _load_request_for_action(db: Session, request_id: uuid.UUID) -> StockRequest:
    request = db.query(StockRequest).filter(StockRequest.request_id == request_id).first()
    if request is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "요청을 찾을 수 없습니다.")
    return request


def _load_actor(db: Session, employee_id: uuid.UUID) -> Employee:
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if employee is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")
    if not bool(employee.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원입니다.")
    return employee


@router.post("/{request_id}/approve", response_model=StockRequestResponse)
def approve_stock_request(
    request_id: uuid.UUID,
    payload: StockRequestActionRequest,
    db: Session = Depends(get_db),
):
    request = _load_request_for_action(db, request_id)
    approver = _load_actor(db, payload.actor_employee_id)

    try:
        svc.approve_request(db, request, approver=approver, pin=payload.pin)
    except PermissionError as exc:
        db.rollback()
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except svc.FailedApprovalError as exc:
        # 검증 실패 — 원본 트랜잭션 rollback 후 별도 트랜잭션으로 status 만 기록.
        db.rollback()
        request = _load_request_for_action(db, request_id)
        approver = _load_actor(db, payload.actor_employee_id)
        svc.mark_failed_approval(db, request, approver=approver, reason=str(exc))
        commit_and_refresh(db, request)
        raise http_error(409, ErrorCode.CONFLICT, f"승인 실패: {exc}")
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    commit_and_refresh(db, request)
    return request


@router.post("/{request_id}/reject", response_model=StockRequestResponse)
def reject_stock_request(
    request_id: uuid.UUID,
    payload: StockRequestActionRequest,
    db: Session = Depends(get_db),
):
    request = _load_request_for_action(db, request_id)
    approver = _load_actor(db, payload.actor_employee_id)
    if not payload.reason or not payload.reason.strip():
        raise http_error(422, ErrorCode.UNPROCESSABLE, "반려 사유를 입력하세요.")

    try:
        svc.reject_request(
            db, request, approver=approver, pin=payload.pin, reason=payload.reason
        )
    except PermissionError as exc:
        db.rollback()
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    commit_and_refresh(db, request)
    return request


@router.post("/{request_id}/cancel", response_model=StockRequestResponse)
def cancel_stock_request(
    request_id: uuid.UUID,
    payload: StockRequestActionRequest,
    db: Session = Depends(get_db),
):
    request = _load_request_for_action(db, request_id)
    requester = _load_actor(db, payload.actor_employee_id)

    try:
        svc.cancel_request(db, request, requester=requester, pin=payload.pin)
    except PermissionError as exc:
        db.rollback()
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    commit_and_refresh(db, request)
    return request


@router.post("/{request_id}/submit", response_model=StockRequestResponse)
def submit_stock_request_draft(
    request_id: uuid.UUID,
    payload: StockRequestSubmitPayload,
    db: Session = Depends(get_db),
):
    """DRAFT → 제출 전환. status=DRAFT 만 허용, 본인만, 빈 lines 거부."""
    try:
        request = svc.submit_draft_request(
            db,
            request_id=request_id,
            requester_employee_id=payload.requester_employee_id,
        )
    except PermissionError as exc:
        db.rollback()
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    commit_and_refresh(db, request)
    return request
