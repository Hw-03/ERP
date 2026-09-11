"""StockRequest 라우터 — 작업자 결재 요청 / 창고 담당자 승인 흐름.

기존 `/api/inventory/*` 즉시 입출고 API 는 그대로 유지된다. 본 라우터는 별도 도메인.
"""

from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import Depends, Query, Request, Response, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.dependencies.verified_actor import (
    CurrentActor,
    VerifiedActor,
    VerifiedActorRouter,
    ensure_actor_employee_id,
)
from app.models import (
    Employee,
    IoBatch,
    Item,
    RequestBucketEnum,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.routers._errors import ErrorCode, http_error
from app.services.dept_hierarchy import approvable_departments, can_approve_department
from app.schemas import (
    ReservationLineResponse,
    StockRequestActionRequest,
    StockRequestCreate,
    StockRequestDraftUpsert,
    StockRequestResponse,
    StockRequestSubmitPayload,
)
from app.services import stock_requests as svc
from app.services.inv_transfer import department_for_item
from app.services import stock_request_actions as action_svc
from app.services._tx import commit_and_refresh, commit_only
from app.services import notifications as notif_svc
from app.services import rate_limit
from app.services.command_idempotency import (
    IdempotencyConflict,
    fingerprint_stock_request_create,
    lock_idempotency_key,
    require_matching_fingerprint,
)
from app._evt import emit as _evt_emit


router = VerifiedActorRouter()


def _idempotency_conflict(reason: str) -> Exception:
    return http_error(
        409,
        ErrorCode.IDEMPOTENCY_CONFLICT,
        "같은 요청 키를 다른 명령에 사용할 수 없습니다.",
        reason=reason,
    )


def _resolve_stock_request_idempotency(
    db: Session,
    *,
    client_request_id: str,
    request_fingerprint: str,
    actor: Employee,
) -> StockRequest | None:
    """exact StockRequest retry만 반환하고 다른 key 소유권은 거부한다."""
    cross_route = (
        db.query(IoBatch.batch_id)
        .filter(IoBatch.client_request_id == client_request_id)
        .first()
    )
    if cross_route is not None:
        raise _idempotency_conflict("route_mismatch")
    existing = (
        db.query(StockRequest)
        .filter(StockRequest.client_request_id == client_request_id)
        .first()
    )
    if existing is None:
        return None
    if existing.requester_employee_id != actor.employee_id:
        raise _idempotency_conflict("actor_mismatch")
    try:
        require_matching_fingerprint(
            existing.request_fingerprint,
            request_fingerprint,
        )
    except IdempotencyConflict as exc:
        raise _idempotency_conflict(exc.reason)
    return existing


def _validate_normal_source_departments(
    db: Session,
    request_type: StockRequestTypeEnum,
    lines,
) -> None:
    """정상 폐기·재작업 출처를 현재 품목코드 부서와 대조한다."""
    if request_type not in {
        StockRequestTypeEnum.SCRAP_NORMAL,
        StockRequestTypeEnum.REWORK_NORMAL,
    }:
        return
    for line in lines:
        if line.from_bucket == RequestBucketEnum.WAREHOUSE:
            if line.from_department is None:
                continue
            raise ValueError("창고 출처 정상 처리에는 from_department 를 지정할 수 없습니다.")
        item = db.query(Item).filter(Item.item_id == line.item_id).first()
        if item is None:
            continue
        expected = department_for_item(item).value
        if line.from_bucket == RequestBucketEnum.PRODUCTION and line.from_department == expected:
            continue
        raise ValueError(
            f"생산 출처 정상 처리의 from_department 는 품목코드 기준 부서여야 합니다: "
            f"{item.mes_code or item.item_id} / 기대 {expected} / 요청 {line.from_department}"
        )


def _validate_direct_automatic_department_routes(
    db: Session,
    payload: StockRequestCreate | StockRequestDraftUpsert,
) -> None:
    """직접 창고↔부서 요청도 품목 코드와 다른 생산부서를 우회하지 못하게 한다."""
    expected_department_field = {
        StockRequestTypeEnum.WAREHOUSE_TO_DEPT: "to_department",
        StockRequestTypeEnum.DEPT_TO_WAREHOUSE: "from_department",
    }.get(payload.request_type)
    if expected_department_field is None:
        _validate_normal_source_departments(db, payload.request_type, payload.lines)
        return
    for line in payload.lines:
        item = db.query(Item).filter(Item.item_id == line.item_id).first()
        if item is None:
            # 기존 서비스가 동일한 422 메시지로 처리한다.
            continue
        expected = department_for_item(item).value
        if expected_department_field is not None:
            actual = getattr(line, expected_department_field)
            if actual == expected:
                continue
            raise ValueError(
                f"품목코드 기준 부서와 요청 부서가 다릅니다: "
                f"{item.mes_code or item.item_id} / 기대 {expected} / 요청 {actual}"
            )


# ---------------------------------------------------------------------------
# 요청 생성
# ---------------------------------------------------------------------------


@router.post("", response_model=StockRequestResponse, status_code=status.HTTP_201_CREATED)
def create_stock_request(
    payload: StockRequestCreate,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
) -> StockRequest:
    ensure_actor_employee_id(actor, payload.requester_employee_id)
    request_fingerprint: str | None = None
    if payload.client_request_id:
        request_fingerprint = fingerprint_stock_request_create(
            actor.employee_id,
            payload,
        )
        replay = _resolve_stock_request_idempotency(
            db,
            client_request_id=payload.client_request_id,
            request_fingerprint=request_fingerprint,
            actor=actor,
        )
        if replay is not None:
            return replay
        lock_idempotency_key(db, payload.client_request_id)
        replay = _resolve_stock_request_idempotency(
            db,
            client_request_id=payload.client_request_id,
            request_fingerprint=request_fingerprint,
            actor=actor,
        )
        if replay is not None:
            return replay

    try:
        _validate_direct_automatic_department_routes(db, payload)
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    lines_input = [
        svc.LineInput(
            record_id=li.record_id,
            item_id=li.item_id,
            quantity=li.quantity,
            from_bucket=li.from_bucket,
            from_department=li.from_department,
            to_bucket=li.to_bucket,
            to_department=li.to_department,
        )
        for li in payload.lines
    ]

    for attempt in range(2):
        try:
            request = action_svc.create_request(
                db,
                requester=actor,
                request_type=payload.request_type,
                lines_input=lines_input,
                reference_no=payload.reference_no,
                notes=payload.notes,
                client_request_id=payload.client_request_id,
                request_fingerprint=request_fingerprint,
                reason_category=payload.reason_category,
                reason_memo=payload.reason_memo,
            )
            return request
        except IntegrityError as exc:
            exc_str = str(exc).lower()
            # failed transaction 정리 뒤 unique winner를 조회한다.
            db.rollback()
            db.expire_all()
            if payload.client_request_id and request_fingerprint is not None:
                # request_code 재시도까지 같은 route 공통 key lock으로 직렬화한다.
                lock_idempotency_key(db, payload.client_request_id)
                replay = _resolve_stock_request_idempotency(
                    db,
                    client_request_id=payload.client_request_id,
                    request_fingerprint=request_fingerprint,
                    actor=actor,
                )
                if replay is not None:
                    return replay
            if attempt == 1 or "request_code" not in exc_str:
                raise http_error(409, ErrorCode.CONFLICT, "요청 코드 충돌, 다시 시도해 주세요.")
            # attempt=0, request_code 충돌 → 재시도 (새 suffix 자동 생성)
        except ValueError as exc:
            raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
        except PermissionError as exc:
            raise http_error(403, ErrorCode.FORBIDDEN, str(exc))


# ---------------------------------------------------------------------------
# 조회: 내 요청 / 승인함 / 점유 목록 / 단건
# ---------------------------------------------------------------------------


def _has_warehouse_approval_role(actor: Employee) -> bool:
    return (actor.warehouse_role or "none").lower() in ("primary", "deputy")


def _require_warehouse_approval_role(actor: Employee) -> None:
    if not _has_warehouse_approval_role(actor):
        raise http_error(403, ErrorCode.FORBIDDEN, "창고 결재 권한이 없습니다.")


def _require_department_approval_role(actor: Employee) -> None:
    if not (actor.department_role or "none").lower() in ("primary", "deputy"):
        raise http_error(403, ErrorCode.FORBIDDEN, "부서 결재 권한이 없습니다.")


@router.get("", response_model=List[StockRequestResponse])
def list_stock_requests(
    requester_employee_id: Optional[uuid.UUID] = Query(None),
    status_filter: Optional[StockRequestStatusEnum] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    target_request_id: uuid.UUID | None = Query(None),
    actor: CurrentActor = None,
    db: Session = Depends(get_db),
):
    ensure_actor_employee_id(actor, requester_employee_id)
    base_query = db.query(StockRequest).filter(
        StockRequest.requester_employee_id == actor.employee_id
    )
    if status_filter is not None:
        base_query = base_query.filter(StockRequest.status == status_filter)
    else:
        # status 미지정 시 DRAFT 제외 — '내 요청' 목록에 장바구니가 섞이면 안 됨.
        base_query = base_query.filter(StockRequest.status != StockRequestStatusEnum.DRAFT)
    rows = base_query.order_by(StockRequest.created_at.desc()).limit(limit).all()
    if target_request_id is not None:
        target = base_query.filter(StockRequest.request_id == target_request_id).first()
        if target is not None:
            rows = [target, *(row for row in rows if row.request_id != target.request_id)][:limit]
    return rows


@router.get("/warehouse-queue", response_model=List[StockRequestResponse])
def list_warehouse_queue(
    limit: int = Query(100, ge=1, le=500),
    target_request_id: uuid.UUID | None = Query(None),
    actor: CurrentActor = None,
    db: Session = Depends(get_db),
):
    """창고 담당자 승인 대기 목록 (RESERVED 또는 SUBMITTED, 승인 필요).

    창고 결재가 아직 완료되지 않은 요청만 반환 (듀얼 승인 케이스에서 창고는 완료, 부서만 대기인
    요청은 부서 큐로 노출).
    """
    _require_warehouse_approval_role(actor)
    base_query = db.query(StockRequest).filter(
        StockRequest.requires_warehouse_approval.is_(True),
        StockRequest.approved_by_employee_id.is_(None),
        StockRequest.status.in_(
            (
                StockRequestStatusEnum.RESERVED,
                StockRequestStatusEnum.SUBMITTED,
            )
        ),
    )
    rows = base_query.order_by(StockRequest.created_at.desc()).limit(limit).all()
    if target_request_id is not None:
        target = base_query.filter(StockRequest.request_id == target_request_id).first()
        if target is not None:
            rows = [target, *(row for row in rows if row.request_id != target.request_id)][:limit]
    return rows


@router.get("/warehouse-queue/count")
def count_warehouse_queue(
    actor: CurrentActor = None,
    db: Session = Depends(get_db),
) -> dict:
    """창고 승인함 대기 건수 — `list_warehouse_queue` 와 동일 필터."""
    _require_warehouse_approval_role(actor)
    n = (
        db.query(StockRequest)
        .filter(
            StockRequest.requires_warehouse_approval.is_(True),
            StockRequest.approved_by_employee_id.is_(None),
            StockRequest.status.in_(
                (
                    StockRequestStatusEnum.RESERVED,
                    StockRequestStatusEnum.SUBMITTED,
                )
            ),
        )
        .count()
    )
    return {"count": int(n)}


@router.get("/department-queue", response_model=List[StockRequestResponse])
def list_department_queue(
    actor_employee_id: uuid.UUID | None = Query(
        None,
        description="현재 직원 ID — 세션 작업자 일치 확인용",
    ),
    limit: int = Query(100, ge=1, le=500),
    target_request_id: uuid.UUID | None = Query(None),
    actor: CurrentActor = None,
    db: Session = Depends(get_db),
):
    """부서 결재 정/부 승인 대기 목록.

    부서 정/부만 창고 외 부서 결재를 조회할 수 있다.
    """
    ensure_actor_employee_id(actor, actor_employee_id)
    _require_department_approval_role(actor)

    visible = approvable_departments(actor)

    base_query = db.query(StockRequest).filter(
        StockRequest.requires_department_approval.is_(True),
        or_(
            StockRequest.requires_warehouse_approval.is_(False),
            StockRequest.approved_by_employee_id.is_not(None),
        ),
        StockRequest.department_approved_by_employee_id.is_(None),
        StockRequest.status.in_(
            (
                StockRequestStatusEnum.RESERVED,
                StockRequestStatusEnum.SUBMITTED,
            )
        ),
    )
    if visible is not None:
        base_query = base_query.filter(
            func.coalesce(
                StockRequest.approval_department,
                StockRequest.requester_department,
            ).in_(list(visible))
        )

    rows = base_query.order_by(StockRequest.created_at.desc()).limit(limit).all()
    if target_request_id is not None:
        target = base_query.filter(StockRequest.request_id == target_request_id).first()
        if target is not None:
            rows = [target, *(row for row in rows if row.request_id != target.request_id)][:limit]
    return rows


@router.get("/department-queue/count")
def count_department_queue(
    actor_employee_id: uuid.UUID | None = Query(
        None,
        description="현재 직원 ID — 세션 작업자 일치 확인용",
    ),
    actor: CurrentActor = None,
    db: Session = Depends(get_db),
) -> dict:
    """부서 승인함 대기 건수 — `list_department_queue` 와 동일 부서 범위 적용."""
    ensure_actor_employee_id(actor, actor_employee_id)
    _require_department_approval_role(actor)

    visible = approvable_departments(actor)

    base_query = db.query(StockRequest).filter(
        StockRequest.requires_department_approval.is_(True),
        or_(
            StockRequest.requires_warehouse_approval.is_(False),
            StockRequest.approved_by_employee_id.is_not(None),
        ),
        StockRequest.department_approved_by_employee_id.is_(None),
        StockRequest.status.in_(
            (
                StockRequestStatusEnum.RESERVED,
                StockRequestStatusEnum.SUBMITTED,
            )
        ),
    )
    if visible is not None:
        base_query = base_query.filter(
            func.coalesce(
                StockRequest.approval_department,
                StockRequest.requester_department,
            ).in_(list(visible))
        )

    return {"count": int(base_query.count())}


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
                from_department=line.from_department,
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
    payload: StockRequestDraftUpsert,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
) -> StockRequest:
    ensure_actor_employee_id(actor, payload.requester_employee_id)

    try:
        _validate_direct_automatic_department_routes(db, payload)
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    lines_input = [
        svc.LineInput(
            record_id=li.record_id,
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
            requester=actor,
            request_type=payload.request_type,
            lines_input=lines_input,
            reference_no=payload.reference_no,
            notes=payload.notes,
            reason_category=payload.reason_category,
            reason_memo=payload.reason_memo,
        )
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    except PermissionError as exc:
        db.rollback()
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))

    commit_and_refresh(db, request)
    return request


@router.get("/draft", response_model=Optional[StockRequestResponse])
def get_stock_request_draft(
    requester_employee_id: uuid.UUID = Query(...),
    request_type: StockRequestTypeEnum = Query(...),
    actor: CurrentActor = None,
    db: Session = Depends(get_db),
):
    """단일 DRAFT 조회. 없으면 200 + null."""
    ensure_actor_employee_id(actor, requester_employee_id)
    return svc.get_draft_request(
        db,
        requester_employee_id=requester_employee_id,
        request_type=request_type,
    )


@router.get("/drafts", response_model=List[StockRequestResponse])
def list_stock_request_drafts(
    requester_employee_id: uuid.UUID = Query(...),
    actor: CurrentActor = None,
    db: Session = Depends(get_db),
):
    """본인 DRAFT 목록만. 다른 직원 draft 노출 금지."""
    ensure_actor_employee_id(actor, requester_employee_id)
    return svc.list_draft_requests(db, requester_employee_id=requester_employee_id)


@router.delete(
    "/draft/{request_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_stock_request_draft(
    request_id: uuid.UUID,
    actor: VerifiedActor,
    requester_employee_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
) -> None:
    ensure_actor_employee_id(actor, requester_employee_id)
    try:
        svc.delete_draft_request(
            db,
            request_id=request_id,
            requester=actor,
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
def get_stock_request(
    request_id: uuid.UUID,
    actor: CurrentActor = None,
    db: Session = Depends(get_db),
):
    request = db.query(StockRequest).filter(StockRequest.request_id == request_id).first()
    if request is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "요청을 찾을 수 없습니다.")
    approval_department = request.approval_department or request.requester_department
    can_read = (
        request.requester_employee_id == actor.employee_id
        or (
            bool(request.requires_warehouse_approval)
            and _has_warehouse_approval_role(actor)
        )
        or (
            bool(request.requires_department_approval)
            and (
                not request.requires_warehouse_approval
                or request.approved_by_employee_id is not None
            )
            and can_approve_department(actor, approval_department)
        )
    )
    if not can_read:
        raise http_error(403, ErrorCode.FORBIDDEN, "요청을 조회할 권한이 없습니다.")
    return request


# ---------------------------------------------------------------------------
# 승인 / 반려 / 취소
# ---------------------------------------------------------------------------


def _load_request_for_action(db: Session, request_id: uuid.UUID) -> StockRequest:
    """승인/반려/취소 전용 조회 — PostgreSQL: FOR UPDATE 행 잠금으로 중복 처리 방지."""
    q = db.query(StockRequest).filter(StockRequest.request_id == request_id)
    if db.bind is not None and db.bind.dialect.name != "sqlite":
        q = q.with_for_update()
    request = q.first()
    if request is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "요청을 찾을 수 없습니다.")
    return request


def _raise_pin_rate_limited(exc: Exception) -> None:
    raise http_error(429, ErrorCode.TOO_MANY_REQUESTS, str(exc))


@router.post("/{request_id}/approve", response_model=StockRequestResponse)
def approve_stock_request(
    request_id: uuid.UUID,
    payload: StockRequestActionRequest,
    http_request: Request,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
) -> StockRequest:
    ensure_actor_employee_id(actor, payload.actor_employee_id)
    request = _load_request_for_action(db, request_id)

    try:
        action_svc.approve_warehouse_request(
            db,
            request,
            approver=actor,
            pin=payload.pin,
            http_request=http_request,
        )
    except rate_limit.OperatorPinRateLimitExceeded as exc:
        _raise_pin_rate_limited(exc)
    except PermissionError as exc:
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except svc.FailedApprovalError as exc:
        raise http_error(409, ErrorCode.CONFLICT, f"승인 실패: {exc}")
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    _evt_emit(
        "sr_approve_warehouse",
        request=http_request,
        req_id=str(request.request_id)[:8],
        approver_emp=actor.employee_code,
        result=request.status.value,
    )
    return request


@router.post("/{request_id}/reject", response_model=StockRequestResponse)
def reject_stock_request(
    request_id: uuid.UUID,
    payload: StockRequestActionRequest,
    http_request: Request,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
) -> StockRequest:
    ensure_actor_employee_id(actor, payload.actor_employee_id)
    request = _load_request_for_action(db, request_id)
    if not payload.reason or not payload.reason.strip():
        raise http_error(422, ErrorCode.UNPROCESSABLE, "반려 사유를 입력하세요.")

    try:
        svc.reject_request(
            db, request, approver=actor, pin=payload.pin, reason=payload.reason,
            http_request=http_request,
        )
    except rate_limit.OperatorPinRateLimitExceeded as exc:
        db.rollback()
        _raise_pin_rate_limited(exc)
    except PermissionError as exc:
        db.rollback()
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    notif_svc._notify_request_decided(db, request, decision="rejected")
    commit_and_refresh(db, request)
    _evt_emit(
        "sr_reject_warehouse",
        request=http_request,
        req_id=str(request.request_id)[:8],
        approver_emp=actor.employee_code,
    )
    return request


@router.post("/{request_id}/department-approve", response_model=StockRequestResponse)
def department_approve_stock_request(
    request_id: uuid.UUID,
    payload: StockRequestActionRequest,
    http_request: Request,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
) -> StockRequest:
    """부서 결재 승인 — 부서 정/부만 허용."""
    ensure_actor_employee_id(actor, payload.actor_employee_id)
    request = _load_request_for_action(db, request_id)

    try:
        action_svc.approve_department_request(
            db,
            request,
            approver=actor,
            pin=payload.pin,
            http_request=http_request,
        )
    except rate_limit.OperatorPinRateLimitExceeded as exc:
        _raise_pin_rate_limited(exc)
    except PermissionError as exc:
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except svc.FailedApprovalError as exc:
        raise http_error(409, ErrorCode.CONFLICT, f"승인 실패: {exc}")
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    _evt_emit(
        "sr_approve_dept",
        request=http_request,
        req_id=str(request.request_id)[:8],
        approver_emp=actor.employee_code,
        result=request.status.value,
    )
    return request


@router.post("/{request_id}/department-reject", response_model=StockRequestResponse)
def department_reject_stock_request(
    request_id: uuid.UUID,
    payload: StockRequestActionRequest,
    http_request: Request,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
) -> StockRequest:
    """부서 결재 반려."""
    ensure_actor_employee_id(actor, payload.actor_employee_id)
    request = _load_request_for_action(db, request_id)
    if not payload.reason or not payload.reason.strip():
        raise http_error(422, ErrorCode.UNPROCESSABLE, "반려 사유를 입력하세요.")

    try:
        svc.reject_request_department(
            db, request, approver=actor, pin=payload.pin, reason=payload.reason,
            http_request=http_request,
        )
    except rate_limit.OperatorPinRateLimitExceeded as exc:
        db.rollback()
        _raise_pin_rate_limited(exc)
    except PermissionError as exc:
        db.rollback()
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    notif_svc._notify_request_decided(db, request, decision="rejected")
    commit_and_refresh(db, request)
    _evt_emit(
        "sr_reject_dept",
        request=http_request,
        req_id=str(request.request_id)[:8],
        approver_emp=actor.employee_code,
    )
    return request


@router.post("/{request_id}/cancel", response_model=StockRequestResponse)
def cancel_stock_request(
    request_id: uuid.UUID,
    payload: StockRequestActionRequest,
    http_request: Request,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
) -> StockRequest:
    ensure_actor_employee_id(actor, payload.actor_employee_id)
    request = _load_request_for_action(db, request_id)

    try:
        action_svc.cancel_request(
            db,
            request,
            requester=actor,
            pin=payload.pin,
            http_request=http_request,
        )
    except rate_limit.OperatorPinRateLimitExceeded as exc:
        _raise_pin_rate_limited(exc)
    except PermissionError as exc:
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    _evt_emit(
        "sr_cancel",
        request=http_request,
        req_id=str(request.request_id)[:8],
        requester_emp=actor.employee_code,
    )
    return request


@router.post("/{request_id}/submit", response_model=StockRequestResponse)
def submit_stock_request_draft(
    request_id: uuid.UUID,
    payload: StockRequestSubmitPayload,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
) -> StockRequest:
    """DRAFT → 제출 전환. status=DRAFT 만 허용, 본인만, 빈 lines 거부."""
    ensure_actor_employee_id(actor, payload.requester_employee_id)
    draft = db.query(StockRequest).filter(StockRequest.request_id == request_id).first()
    if (
        draft is not None
        and draft.requester_employee_id == actor.employee_id
        and draft.status == StockRequestStatusEnum.DRAFT
    ):
        try:
            _validate_normal_source_departments(db, draft.request_type, draft.lines)
        except ValueError as exc:
            raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    for attempt in range(2):
        try:
            request = svc.submit_draft_request(
                db,
                request_id=request_id,
                requester=actor,
            )
            notif_svc._notify_request_arrived(db, request)
            commit_and_refresh(db, request)
            return request
        except IntegrityError as exc:
            db.rollback()
            if attempt == 1 or "request_code" not in str(exc).lower():
                raise http_error(409, ErrorCode.CONFLICT, "요청 코드 충돌, 다시 시도해 주세요.")
            # attempt=0, request_code 충돌 → 재시도
        except svc.RequestNotFoundError as exc:
            db.rollback()
            raise http_error(404, ErrorCode.NOT_FOUND, str(exc))
        except PermissionError as exc:
            db.rollback()
            raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
        except ValueError as exc:
            db.rollback()
            raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))


@router.post("/{request_id}/revert-to-draft", status_code=204)
def revert_stock_request_to_draft(
    request_id: uuid.UUID,
    payload: StockRequestActionRequest,
    http_request: Request,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
) -> Response:
    """연결된 미결 요청을 모두 취소하고 IoBatch 전체를 draft로 복원한다."""
    ensure_actor_employee_id(actor, payload.actor_employee_id)
    request = db.query(StockRequest).filter(StockRequest.request_id == request_id).first()
    if request is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "요청을 찾을 수 없습니다.")

    try:
        action_svc.revert_to_draft(
            db,
            request=request,
            requester=actor,
            pin=payload.pin,
            http_request=http_request,
        )
    except rate_limit.OperatorPinRateLimitExceeded as exc:
        db.rollback()
        _raise_pin_rate_limited(exc)
    except PermissionError as exc:
        db.rollback()
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    return Response(status_code=204)
