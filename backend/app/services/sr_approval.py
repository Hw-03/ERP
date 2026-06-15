"""StockRequest 승인/반려/취소 관련 함수."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app._actor import set_actor
from app.models import (
    Employee,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.services import inventory as inventory_svc
from app.services.dept_hierarchy import can_approve_department
from app.services.io_persist import sync_batch_from_stock_request
from app.services.pin_auth import verify_pin
from app.services.sr_execution import _execute_all_lines, release_reservation
from app.services.sr_validation import line_requires_pending

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
    if not verify_pin(approver.pin_hash, pin):
        raise PermissionError("PIN이 일치하지 않습니다.")
    set_actor(http_request, approver)

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

    sync_batch_from_stock_request(db, request)

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

    - actor: department_role in {primary, deputy} 또는 admin
    - actor.department == request.requester_department (다른 부서 결재 불가)
    - MANUAL_ADJUSTMENT 단독: 승인 즉시 io_dispatch.execute_batch_after_dept_approval 호출
    - 듀얼(창고+부서): 양쪽 모두 충족 시 _execute_all_lines, 아니면 status 유지
    """
    if not request.requires_department_approval:
        raise ValueError("부서 결재가 필요하지 않은 요청입니다.")

    # 결재 권한 (그릴 합의 — docs/defect-handling-redesign.md):
    #   - 부서 정/부: 생산 라인 6개(튜브/고압/진공/튜닝/조립/출하) 결재
    #   - 창고 정/부: 모든 부서 결재
    #   - admin: 모든 부서 결재
    # 사람 이름 박지 않음. 자세한 룰은 `dept_hierarchy.can_approve_department`.
    if not can_approve_department(approver, request.requester_department):
        raise PermissionError(
            "결재 권한이 없습니다 (부서 정/부 또는 창고 정/부 필요)."
        )
    if not verify_pin(approver.pin_hash, pin):
        raise PermissionError("PIN이 일치하지 않습니다.")
    set_actor(http_request, approver)

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

    if request.request_type == StockRequestTypeEnum.MANUAL_ADJUSTMENT:
        # io_dispatch 가 원본 IoBatch 라인을 _apply_line 식으로 실행.
        execute_batch_after_dept_approval(db, request=request, approver=approver)
    else:
        # 듀얼 승인 케이스 — _execute_all_lines.
        try:
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

    sync_batch_from_stock_request(db, request)
    return request


def _release_pending_best_effort(db: Session, request: StockRequest) -> None:
    """pending_quantity를 요청 라인만큼 best-effort로 해제.

    pending이 이미 0이거나 부족하면 ValueError를 무시하고 넘어간다(no-op).
    재고 리셋 후 고아가 된 요청을 안전하게 정리할 때 사용.
    """
    pending_lines = [
        line for line in request.lines if line_requires_pending(line.from_bucket, line.to_bucket)
    ]
    agg: dict[uuid.UUID, Decimal] = {}
    for line in pending_lines:
        agg[line.item_id] = agg.get(line.item_id, Decimal("0")) + (line.quantity or Decimal("0"))
    for item_id, qty in agg.items():
        try:
            inventory_svc.release(db, item_id, qty)
        except ValueError:
            pass  # 이미 release 됐거나 pending=0 — 무시.


def mark_failed_approval(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    reason: str,
) -> StockRequest:
    """승인 실패 처리: pending 원복 + status=failed_approval 기록.

    원래 트랜잭션이 rollback 된 직후 별도 트랜잭션에서 호출. release 는 다시 시도한다.
    이미 release 된 상태이거나 pending 이 부족하면 release() 가 ValueError → 무시.
    """
    _release_pending_best_effort(db, request)

    now = datetime.utcnow()
    request.status = StockRequestStatusEnum.FAILED_APPROVAL
    request.rejected_by_employee_id = approver.employee_id
    request.rejected_by_name = approver.name
    request.rejected_at = now
    request.rejected_reason = f"승인 실패: {reason}"
    sync_batch_from_stock_request(db, request)
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
    if not verify_pin(approver.pin_hash, pin):
        raise PermissionError("PIN이 일치하지 않습니다.")
    set_actor(http_request, approver)
    if not reason or not reason.strip():
        raise ValueError("반려 사유를 입력하세요.")
    # 이미 반려된 경우 멱등 반환
    if request.status == StockRequestStatusEnum.REJECTED:
        return request
    if request.status not in (StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.SUBMITTED):
        raise ValueError(f"반려할 수 없는 상태입니다: {request.status.value}")

    release_reservation(db, request)

    now = datetime.utcnow()
    request.status = StockRequestStatusEnum.REJECTED
    request.rejected_by_employee_id = approver.employee_id
    request.rejected_by_name = approver.name
    request.rejected_at = now
    request.rejected_reason = reason.strip()
    for line in request.lines:
        line.status = StockRequestStatusEnum.REJECTED
    sync_batch_from_stock_request(db, request)
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

    if not can_approve_department(approver, request.requester_department):
        raise PermissionError(
            "결재 권한이 없습니다 (부서 정/부 또는 창고 정/부 필요)."
        )
    if not verify_pin(approver.pin_hash, pin):
        raise PermissionError("PIN이 일치하지 않습니다.")
    set_actor(http_request, approver)
    if not reason or not reason.strip():
        raise ValueError("반려 사유를 입력하세요.")

    if request.status == StockRequestStatusEnum.REJECTED:
        return request
    if request.status not in (StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.SUBMITTED):
        raise ValueError(f"반려할 수 없는 상태입니다: {request.status.value}")

    # warehouse-reserved 라인 점유 원복 (MANUAL_ADJUSTMENT 는 점유 없음 — release_reservation 가 no-op).
    release_reservation(db, request)

    now = datetime.utcnow()
    request.status = StockRequestStatusEnum.REJECTED
    request.rejected_by_employee_id = approver.employee_id
    request.rejected_by_name = approver.name
    request.rejected_at = now
    request.rejected_reason = reason.strip()
    for line in request.lines:
        line.status = StockRequestStatusEnum.REJECTED
    sync_batch_from_stock_request(db, request)
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
    if not verify_pin(requester.pin_hash, pin):
        raise PermissionError("PIN이 일치하지 않습니다.")
    set_actor(http_request, requester)
    # 이미 취소된 경우 멱등 반환
    if request.status == StockRequestStatusEnum.CANCELLED:
        return request
    if request.status in (
        StockRequestStatusEnum.COMPLETED,
        StockRequestStatusEnum.REJECTED,
        StockRequestStatusEnum.FAILED_APPROVAL,
    ):
        raise ValueError(f"취소할 수 없는 상태입니다: {request.status.value}")

    release_reservation(db, request)

    now = datetime.utcnow()
    request.status = StockRequestStatusEnum.CANCELLED
    request.cancelled_at = now
    for line in request.lines:
        line.status = StockRequestStatusEnum.CANCELLED
    sync_batch_from_stock_request(db, request)
    return request


def cancel_open_stock_requests(db: Session, *, reason: str) -> int:
    """RESERVED/SUBMITTED 상태인 미결 요청을 모두 CANCELLED로 일괄 전이.

    권한·PIN 검증 없는 시스템 정리 전용. 재고 리셋/재적재 직전에 호출해
    inventory.pending 과 stock_requests 상태 불일치를 예방한다.

    pending은 남은 만큼만 best-effort 해제(pending=0이어도 안전).
    commit은 호출측 책임 — 이 함수는 flush만 한다.

    Returns:
        취소 처리된 요청 건수.
    """
    open_statuses = (StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.SUBMITTED)
    open_requests = (
        db.query(StockRequest)
        .filter(StockRequest.status.in_(open_statuses))
        .all()
    )
    now = datetime.utcnow()
    for req in open_requests:
        _release_pending_best_effort(db, req)
        req.status = StockRequestStatusEnum.CANCELLED
        req.cancelled_at = now
        for line in req.lines:
            line.status = StockRequestStatusEnum.CANCELLED
        sync_batch_from_stock_request(db, req)
    if open_requests:
        db.flush()
    return len(open_requests)
