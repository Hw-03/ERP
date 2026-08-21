"""StockRequest 승인/반려/취소 관련 함수."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app._actor import set_actor as _set_actor
from app.models import (
    Employee,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.services import inventory as inventory_svc
from app.services import rate_limit
from app.services.dept_hierarchy import can_approve_department as _can_approve_department
from app.services.io_persist import (
    ensure_stock_request_batch_is_mutable as _ensure_stock_request_batch_is_mutable,
    _sync_batch_from_stock_request,
)
from app.services.sr_execution import (
    _execute_all_lines,
    _request_inventory_item_ids,
    release_reservation as _release_reservation,
)

# 주의: io_dispatch.execute_batch_after_dept_approval 만 함수 내부 지연 import 한다.
# 정적 import 하면 순환 고리가 닫힌다:
#   sr_approval → io_dispatch → stock_requests(top-level) → sr_approval(부분 초기화)
# → ImportError. io_persist 는 stock_requests 를 import 하지 않아 순환이 없으므로 위처럼 정적 import 가능.


class FailedApprovalError(Exception):
    """승인 시점 시스템 검증 실패. 라우터가 catch 해서 별도 트랜잭션으로 status 기록."""


def approve_request(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    pin: str,
    http_request: Optional[Request] = None,
) -> StockRequest:
    """승인 + 재고 반영을 한 트랜잭션에서 처리.

    Raises:
        PermissionError: PIN 불일치 또는 warehouse_role 권한 없음.
        ValueError: 승인 불가능한 상태 (이미 처리됨).
        FailedApprovalError: 시스템 검증 실패 — pending 안전 원복 후 status=failed_approval.
    """
    role = (approver.warehouse_role or "none").lower()
    if role not in ("primary", "deputy"):
        raise PermissionError("창고 담당자만 승인할 수 있습니다.")
    if not rate_limit.verify_operator_pin(approver, pin, http_request):
        raise PermissionError("PIN이 일치하지 않습니다.")
    _set_actor(http_request, approver)
    _ensure_stock_request_batch_is_mutable(db, request)

    # 이미 완료된 경우 멱등 반환 (중복 승인 클릭 / 동시 승인 2번째 요청)
    if request.status == StockRequestStatusEnum.COMPLETED:
        return request
    if request.status not in (StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.SUBMITTED):
        raise ValueError(f"승인할 수 없는 상태입니다: {request.status.value}")
    if not request.requires_warehouse_approval:
        raise ValueError("승인이 필요하지 않은 요청입니다.")

    now = datetime.utcnow()
    # 창고 결재 기록 (감사용 — dept 결재 대기 중에도 노출).
    request.approved_by_employee_id = approver.employee_id
    request.approved_by_name = approver.name
    request.approved_at = now

    # 부서 결재가 아직 필요한 경우 — 실행 없이 status 유지 (SUBMITTED/RESERVED).
    if (
        request.requires_department_approval
        and request.department_approved_by_employee_id is None
    ):
        return request

    try:
        _release_reservation(db, request, actor=approver)
        _execute_all_lines(
            db,
            request,
            list(request.lines),
            operator_name=approver.name,
            approver=approver,
            is_approval=True,
        )
    except ValueError as exc:
        # 시스템 검증 실패 — pending 을 안전하게 원복하고 failed_approval 로 저장.
        # 부분 release 가능성: 일부 라인은 이미 release+이동 완료, 일부는 미처리.
        # 호출측 라우터가 rollback 하므로 DB 변경은 모두 무효화된다 → 원본 RESERVED 상태로 복귀.
        # 우리는 별도 트랜잭션으로 status=failed_approval 만 기록.
        raise FailedApprovalError(str(exc))

    request.status = StockRequestStatusEnum.COMPLETED
    request.completed_at = now
    for line in request.lines:
        line.status = StockRequestStatusEnum.COMPLETED

    _sync_batch_from_stock_request(db, request)

    return request


def approve_request_department(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    pin: str,
    http_request: Optional[Request] = None,
) -> StockRequest:
    """부서 결재 승인.

    - actor: `can_approve_department`가 허용하는 부서 정/부 또는 창고 정/부
    - MANUAL_ADJUSTMENT 단독: 승인 즉시 io_dispatch.execute_batch_after_dept_approval 호출
    - 듀얼(창고+부서): 양쪽 모두 충족 시 _execute_all_lines, 아니면 status 유지
    """
    if not request.requires_department_approval:
        raise ValueError("부서 결재가 필요하지 않은 요청입니다.")

    # 결재 권한 (그릴 합의 — docs/defect-handling-redesign.md):
    #   - 부서 정/부: 창고 외 부서 결재
    #   - 창고 정/부: 모든 부서 결재
    #   - admin level 단독: 결재 권한 없음
    # 사람 이름 박지 않음. 자세한 룰은 `dept_hierarchy.can_approve_department`.
    approval_department = request.approval_department or request.requester_department
    if not _can_approve_department(approver, approval_department):
        raise PermissionError(
            "결재 권한이 없습니다 (부서 정/부 또는 창고 정/부 필요)."
        )
    if not rate_limit.verify_operator_pin(approver, pin, http_request):
        raise PermissionError("PIN이 일치하지 않습니다.")
    _set_actor(http_request, approver)
    _ensure_stock_request_batch_is_mutable(db, request)

    if request.status == StockRequestStatusEnum.COMPLETED:
        return request
    if request.status not in (StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.SUBMITTED):
        raise ValueError(f"승인할 수 없는 상태입니다: {request.status.value}")
    if request.department_approved_by_employee_id is not None:
        raise ValueError("이미 부서 결재가 완료된 요청입니다.")

    now = datetime.utcnow()
    request.department_approved_by_employee_id = approver.employee_id
    request.department_approved_by_name = approver.name
    request.department_approved_at = now

    # 창고 결재가 아직 필요한 경우 — 실행 없이 status 유지.
    if (
        request.requires_warehouse_approval
        and request.approved_by_employee_id is None
    ):
        return request

    # 실행 경로 분기
    # 지연 import: io_dispatch 는 stock_requests 를 top-level import 하고,
    # stock_requests 는 다시 sr_approval 을 re-export → 정적 import 시 순환 ImportError.
    from app.services.io_dispatch import execute_batch_after_dept_approval

    try:
        _release_reservation(db, request, actor=approver)
        if request.request_type == StockRequestTypeEnum.MANUAL_ADJUSTMENT:
            # io_dispatch 가 원본 IoBatch 라인을 _apply_line 식으로 실행.
            execute_batch_after_dept_approval(db, request=request, approver=approver)
        else:
            # 듀얼 승인 케이스 — _execute_all_lines.
            _execute_all_lines(
                db,
                request,
                list(request.lines),
                operator_name=approver.name,
                approver=approver,
                is_approval=True,
            )
    except ValueError as exc:
        raise FailedApprovalError(str(exc))

    request.status = StockRequestStatusEnum.COMPLETED
    request.completed_at = now
    for line in request.lines:
        line.status = StockRequestStatusEnum.COMPLETED

    _sync_batch_from_stock_request(db, request)
    return request


def _release_pending_best_effort(db: Session, request: StockRequest) -> None:
    """pending_quantity를 요청 라인만큼 best-effort로 해제.

    pending이 이미 0이거나 부족하면 ValueError를 무시하고 넘어간다(no-op).
    재고 리셋 후 고아가 된 요청을 안전하게 정리할 때 사용.
    """
    from app.services import sr_reservation

    sr_reservation._release_lines_best_effort(
        db,
        request.lines,
        request_id=request.request_id,
    )


def mark_failed_approval(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    reason: str,
) -> StockRequest:
    """승인 실패 처리: RESERVED pending 원복 + 요청/라인 실패 기록.

    원래 트랜잭션이 rollback 된 직후 별도 트랜잭션에서 호출한다. rollback 후에도
    RESERVED인 요청만 해제를 재시도하고, 예약이 없던 legacy SUBMITTED는 건너뛴다.
    """
    if request.status == StockRequestStatusEnum.RESERVED:
        _release_pending_best_effort(db, request)

    now = datetime.utcnow()
    request.status = StockRequestStatusEnum.FAILED_APPROVAL
    request.rejected_by_employee_id = approver.employee_id
    request.rejected_by_name = approver.name
    request.rejected_at = now
    request.rejected_reason = f"승인 실패: {reason}"
    for line in request.lines:
        line.status = StockRequestStatusEnum.FAILED_APPROVAL
    _sync_batch_from_stock_request(db, request)
    return request


def reject_request(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    pin: str,
    reason: str,
    http_request: Optional[Request] = None,
) -> StockRequest:
    role = (approver.warehouse_role or "none").lower()
    if role not in ("primary", "deputy"):
        raise PermissionError("창고 담당자만 반려할 수 있습니다.")
    if not rate_limit.verify_operator_pin(approver, pin, http_request):
        raise PermissionError("PIN이 일치하지 않습니다.")
    _set_actor(http_request, approver)
    _ensure_stock_request_batch_is_mutable(db, request)
    if not reason or not reason.strip():
        raise ValueError("반려 사유를 입력하세요.")
    # 이미 반려된 경우 멱등 반환
    if request.status == StockRequestStatusEnum.REJECTED:
        return request
    if request.status not in (StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.SUBMITTED):
        raise ValueError(f"반려할 수 없는 상태입니다: {request.status.value}")

    _release_reservation(db, request, actor=approver)

    now = datetime.utcnow()
    request.status = StockRequestStatusEnum.REJECTED
    request.rejected_by_employee_id = approver.employee_id
    request.rejected_by_name = approver.name
    request.rejected_at = now
    request.rejected_reason = reason.strip()
    for line in request.lines:
        line.status = StockRequestStatusEnum.REJECTED
    _sync_batch_from_stock_request(db, request)
    return request


def reject_request_department(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    pin: str,
    reason: str,
    http_request: Optional[Request] = None,
) -> StockRequest:
    """부서 결재 반려. 권한 + PIN + 사유 필수.

    권한 룰은 `can_approve_department` 와 동일 (승인/반려 대칭).
    """
    if not request.requires_department_approval:
        raise ValueError("부서 결재가 필요하지 않은 요청입니다.")

    approval_department = request.approval_department or request.requester_department
    if not _can_approve_department(approver, approval_department):
        raise PermissionError(
            "결재 권한이 없습니다 (부서 정/부 또는 창고 정/부 필요)."
        )
    if not rate_limit.verify_operator_pin(approver, pin, http_request):
        raise PermissionError("PIN이 일치하지 않습니다.")
    _set_actor(http_request, approver)
    _ensure_stock_request_batch_is_mutable(db, request)
    if not reason or not reason.strip():
        raise ValueError("반려 사유를 입력하세요.")

    if request.status == StockRequestStatusEnum.REJECTED:
        return request
    if request.status not in (StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.SUBMITTED):
        raise ValueError(f"반려할 수 없는 상태입니다: {request.status.value}")

    # source-aware RESERVED 라인의 창고/부서 위치 점유를 원복한다.
    _release_reservation(db, request, actor=approver)

    now = datetime.utcnow()
    request.status = StockRequestStatusEnum.REJECTED
    request.rejected_by_employee_id = approver.employee_id
    request.rejected_by_name = approver.name
    request.rejected_at = now
    request.rejected_reason = reason.strip()
    for line in request.lines:
        line.status = StockRequestStatusEnum.REJECTED
    _sync_batch_from_stock_request(db, request)
    return request


def cancel_request(
    db: Session,
    request: StockRequest,
    *,
    requester: Employee,
    pin: str,
    http_request: Optional[Request] = None,
) -> StockRequest:
    """요청자 본인 또는 결재 권한자(창고/부서 role) 취소."""
    is_self = request.requester_employee_id == requester.employee_id
    is_approver = (
        (getattr(requester, "warehouse_role", None) or "none").lower() != "none"
        or (getattr(requester, "department_role", None) or "none").lower() != "none"
    )
    if not (is_self or is_approver):
        raise PermissionError("본인 요청 또는 결재 권한자만 취소할 수 있습니다.")
    if not rate_limit.verify_operator_pin(requester, pin, http_request):
        raise PermissionError("PIN이 일치하지 않습니다.")
    _set_actor(http_request, requester)
    _ensure_stock_request_batch_is_mutable(db, request)
    # 이미 취소된 경우 멱등 반환
    if request.status == StockRequestStatusEnum.CANCELLED:
        return request
    if request.status in (
        StockRequestStatusEnum.COMPLETED,
        StockRequestStatusEnum.REJECTED,
        StockRequestStatusEnum.FAILED_APPROVAL,
    ):
        raise ValueError(f"취소할 수 없는 상태입니다: {request.status.value}")

    _release_reservation(db, request, actor=requester)

    now = datetime.utcnow()
    request.status = StockRequestStatusEnum.CANCELLED
    request.cancelled_at = now
    for line in request.lines:
        line.status = StockRequestStatusEnum.CANCELLED
    _sync_batch_from_stock_request(db, request)
    return request


def _cancel_open_stock_requests(db: Session, *, reason: str) -> int:
    """RESERVED/SUBMITTED 상태인 미결 요청을 모두 CANCELLED로 일괄 전이.

    권한·PIN 검증 없는 시스템 정리 전용. 재고 리셋/재적재 직전에 호출해
    inventory.pending 과 stock_requests 상태 불일치를 예방한다.

    RESERVED 요청의 pending만 남은 만큼 best-effort 해제한다. 예약이 없던 legacy
    SUBMITTED 요청은 상태와 라인만 취소한다.

    **commit은 호출측 책임 — 이 함수는 flush만 한다.** flush 이후 commit 전에 예외가 나면
    CANCELLED 상태와 pending release 가 부분 반영된 채 남을 수 있으므로, 호출측은 반드시
    이어서 commit 하거나 실패 시 rollback 해야 한다. 리셋 스크립트는 호출 직후 가드로
    미결 잔존을 재확인한 뒤 진행한다.

    Returns:
        취소 처리된 요청 건수.
    """
    open_statuses = (StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.SUBMITTED)
    open_requests = (
        db.query(StockRequest)
        .filter(StockRequest.status.in_(open_statuses))
        .order_by(StockRequest.request_id)
        .with_for_update()
        .all()
    )
    for req in open_requests:
        _ensure_stock_request_batch_is_mutable(db, req)

    all_item_ids: set[uuid.UUID] = set()
    for req in open_requests:
        if req.status == StockRequestStatusEnum.RESERVED:
            all_item_ids.update(
                _request_inventory_item_ids(db, req, list(req.lines))
            )
    if all_item_ids:
        inventory_svc._ensure_and_lock_inventories(db, sorted(all_item_ids))

    now = datetime.utcnow()
    for req in open_requests:
        if req.status == StockRequestStatusEnum.RESERVED:
            _release_pending_best_effort(db, req)
        req.status = StockRequestStatusEnum.CANCELLED
        req.cancelled_at = now
        for line in req.lines:
            line.status = StockRequestStatusEnum.CANCELLED
        _sync_batch_from_stock_request(db, req)
        # SessionLocal은 autoflush=False다. 다음 요청의 reconciliation이 방금 취소한
        # 요청을 활성 예약으로 다시 보호하지 않도록 요청별 전이를 먼저 반영한다.
        db.flush()
    return len(open_requests)
