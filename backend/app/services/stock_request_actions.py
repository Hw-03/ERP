"""StockRequest HTTP 업무 명령의 트랜잭션 경계."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Optional, Sequence

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import (
    Employee,
    IoBatch,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.services import notifications as notification_svc
from app.services import stock_requests as stock_request_svc
from app.services._tx import transactional
from app.services.io_persist import ensure_batch_is_mutable
from app.services.pin_auth import verify_pin
from app.services.sr_validation import LineInput


def create_request(
    db: Session,
    *,
    requester: Employee,
    request_type: StockRequestTypeEnum,
    lines_input: Sequence[LineInput],
    reference_no: Optional[str],
    notes: Optional[str],
    client_request_id: Optional[str] = None,
    reason_category: Optional[str] = None,
    reason_memo: Optional[str] = None,
    supplier_id: uuid.UUID | None = None,
) -> StockRequest:
    """요청·라인·점유·도착 알림을 한 번에 확정한다."""
    with transactional(db):
        request = stock_request_svc.create_request(
            db,
            requester=requester,
            request_type=request_type,
            lines_input=lines_input,
            reference_no=reference_no,
            notes=notes,
            client_request_id=client_request_id,
            reason_category=reason_category,
            reason_memo=reason_memo,
            supplier_id=supplier_id,
        )
        notification_svc.notify_request_arrived(db, request)
    return request


def _record_failed_approval(
    db: Session,
    *,
    request_id: uuid.UUID,
    approver_id: uuid.UUID,
    reason: str,
) -> None:
    """실패한 승인 결과만 첫 실행과 분리된 트랜잭션으로 기록한다."""
    with transactional(db):
        request_query = db.query(StockRequest).filter(
            StockRequest.request_id == request_id
        )
        if db.bind is not None and db.bind.dialect.name != "sqlite":
            request_query = request_query.with_for_update()
        request = request_query.one()
        approver = db.query(Employee).filter(Employee.employee_id == approver_id).one()
        stock_request_svc.mark_failed_approval(
            db,
            request,
            approver=approver,
            reason=reason,
        )


def _record_failed_decision(
    db: Session,
    *,
    request_id: uuid.UUID,
    approver_id: uuid.UUID,
    reason: str,
) -> None:
    """일반 단건 승인 실패 결과를 rollback 뒤 별도 트랜잭션에 남긴다."""
    _record_failed_approval(
        db,
        request_id=request_id,
        approver_id=approver_id,
        reason=reason,
    )


def _run_decision_with_failure_boundary(
    db: Session,
    *,
    request_id: uuid.UUID,
    approver: Employee,
    internal_use_batch_id: uuid.UUID | None,
    command: Callable[[], None],
    rejected_request_id: uuid.UUID | None = None,
    rejected_reason: str | None = None,
    rejected_target_section: str | None = None,
) -> None:
    """internal-use 실패는 잠금을 유지해 기록하고 일반 요청만 기존처럼 재기록한다."""
    post_commit_error: stock_request_svc.FailedApprovalError | None = None
    try:
        with transactional(db):
            try:
                command()
            except stock_request_svc.FailedApprovalError as exc:
                if internal_use_batch_id is None:
                    raise
                from app.services.internal_use_approval import mark_batch_failed

                mark_batch_failed(
                    db,
                    batch_id=internal_use_batch_id,
                    approver=approver,
                    reason=str(exc),
                    rejected_request_id=rejected_request_id,
                    rejected_reason=rejected_reason,
                )
                if rejected_request_id is not None and rejected_target_section is not None:
                    notification_svc.mark_approval_request_notifications_read(
                        db,
                        request_id=rejected_request_id,
                        target_section=rejected_target_section,
                    )
                post_commit_error = exc
    except stock_request_svc.FailedApprovalError as exc:
        _record_failed_decision(
            db,
            request_id=request_id,
            approver_id=approver.employee_id,
            reason=str(exc),
        )
        raise
    if post_commit_error is not None:
        raise post_commit_error


def approve_warehouse_request(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    pin: str,
    http_request: Optional[Request] = None,
) -> StockRequest:
    """창고 승인 실행과 완료 알림을 확정하고 검증 실패만 별도 기록한다."""
    request_id = request.request_id
    from app.services import internal_use_approval

    internal_use_batch_id = (
        request.operation_batch_id
        if internal_use_approval.is_internal_use_request(db, request)
        else None
    )

    def decide() -> None:
        previous_status = request.status
        stock_request_svc.approve_request(
            db,
            request,
            approver=approver,
            pin=pin,
            http_request=http_request,
        )
        notification_svc.mark_approval_request_notifications_read(
            db,
            request_id=request.request_id,
            target_section="queue",
        )
        if (
            request.status == StockRequestStatusEnum.COMPLETED
            and previous_status != StockRequestStatusEnum.COMPLETED
        ):
            notification_svc.notify_request_decided(
                db,
                request,
                decision="approved",
            )

    _run_decision_with_failure_boundary(
        db,
        request_id=request_id,
        approver=approver,
        internal_use_batch_id=internal_use_batch_id,
        command=decide,
    )
    return request


def approve_department_request(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    pin: str,
    http_request: Optional[Request] = None,
) -> StockRequest:
    """부서 승인 실행과 완료 알림을 확정하고 검증 실패만 별도 기록한다."""
    request_id = request.request_id
    from app.services import internal_use_approval

    internal_use_batch_id = (
        request.operation_batch_id
        if internal_use_approval.is_internal_use_request(db, request)
        else None
    )

    def decide() -> None:
        previous_status = request.status
        stock_request_svc.approve_request_department(
            db,
            request,
            approver=approver,
            pin=pin,
            http_request=http_request,
        )
        notification_svc.mark_approval_request_notifications_read(
            db,
            request_id=request.request_id,
            target_section="dept-queue",
        )
        if (
            request.status == StockRequestStatusEnum.COMPLETED
            and previous_status != StockRequestStatusEnum.COMPLETED
        ):
            notification_svc.notify_request_decided(
                db,
                request,
                decision="approved",
            )

    _run_decision_with_failure_boundary(
        db,
        request_id=request_id,
        approver=approver,
        internal_use_batch_id=internal_use_batch_id,
        command=decide,
    )
    return request


def approve_as_research_request(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    pin: str,
    http_request: Optional[Request] = None,
) -> StockRequest:
    """AS·연구 승인 실행과 완료 알림을 하나의 트랜잭션으로 확정한다."""
    request_id = request.request_id
    batch_id = request.operation_batch_id

    def decide() -> None:
        previous_status = request.status
        stock_request_svc.approve_request_as_research(
            db,
            request,
            approver=approver,
            pin=pin,
            http_request=http_request,
        )
        notification_svc.mark_approval_request_notifications_read(
            db,
            request_id=request.request_id,
            target_section="as-research-queue",
        )
        if (
            request.status == StockRequestStatusEnum.COMPLETED
            and previous_status != StockRequestStatusEnum.COMPLETED
        ):
            notification_svc.notify_request_decided(db, request, decision="approved")

    _run_decision_with_failure_boundary(
        db,
        request_id=request_id,
        approver=approver,
        internal_use_batch_id=batch_id,
        command=decide,
    )
    return request


def reject_as_research_request(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    pin: str,
    reason: str,
    http_request: Optional[Request] = None,
) -> StockRequest:
    """AS·연구 반려와 batch settle을 하나의 트랜잭션으로 확정한다."""
    request_id = request.request_id
    batch_id = request.operation_batch_id

    def decide() -> None:
        stock_request_svc.reject_request_as_research(
            db,
            request,
            approver=approver,
            pin=pin,
            reason=reason,
            http_request=http_request,
        )
        notification_svc.mark_approval_request_notifications_read(
            db,
            request_id=request.request_id,
            target_section="as-research-queue",
        )
        notification_svc.notify_request_decided(db, request, decision="rejected")

    _run_decision_with_failure_boundary(
        db,
        request_id=request_id,
        approver=approver,
        internal_use_batch_id=batch_id,
        command=decide,
        rejected_request_id=request_id,
        rejected_reason=reason.strip(),
        rejected_target_section="as-research-queue",
    )
    return request


def reject_warehouse_request(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    pin: str,
    reason: str,
    http_request: Optional[Request] = None,
) -> StockRequest:
    return _reject_request(
        db,
        request,
        approver=approver,
        pin=pin,
        reason=reason,
        department=False,
        http_request=http_request,
    )


def reject_department_request(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    pin: str,
    reason: str,
    http_request: Optional[Request] = None,
) -> StockRequest:
    return _reject_request(
        db,
        request,
        approver=approver,
        pin=pin,
        reason=reason,
        department=True,
        http_request=http_request,
    )


def _reject_request(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    pin: str,
    reason: str,
    department: bool,
    http_request: Optional[Request],
) -> StockRequest:
    request_id = request.request_id
    from app.services import internal_use_approval

    batch_id = (
        request.operation_batch_id
        if internal_use_approval.is_internal_use_request(db, request)
        else None
    )

    def decide() -> None:
        reject = (
            stock_request_svc.reject_request_department
            if department
            else stock_request_svc.reject_request
        )
        reject(
            db,
            request,
            approver=approver,
            pin=pin,
            reason=reason,
            http_request=http_request,
        )
        notification_svc.mark_approval_request_notifications_read(
            db,
            request_id=request.request_id,
            target_section="dept-queue" if department else "queue",
        )
        notification_svc.notify_request_decided(db, request, decision="rejected")

    _run_decision_with_failure_boundary(
        db,
        request_id=request_id,
        approver=approver,
        internal_use_batch_id=batch_id,
        command=decide,
        rejected_request_id=request_id,
        rejected_reason=reason.strip(),
        rejected_target_section="dept-queue" if department else "queue",
    )
    return request


def cancel_request(
    db: Session,
    request: StockRequest,
    *,
    requester: Employee,
    pin: str,
    http_request: Optional[Request] = None,
) -> StockRequest:
    """점유 해제·요청 취소·연결 배치 동기화를 한 번에 확정한다."""
    with transactional(db):
        from app.services import internal_use_approval

        if internal_use_approval.is_internal_use_request(db, request):
            batch, requests, request = internal_use_approval.locked_request(db, request)
            if batch.requester_employee_id != requester.employee_id:
                raise PermissionError("본인 작업 묶음만 취소할 수 있습니다.")
            if not verify_pin(requester.pin_hash, pin):
                raise PermissionError("PIN이 일치하지 않습니다.")
            if batch.status in {"completed", "partially_completed", "rejected", "failed"}:
                raise ValueError(f"취소할 수 없는 작업 묶음 상태입니다: {batch.status}")
            internal_use_approval.prelock_reservation_sources(db, requests)
            now = datetime.utcnow()
            for linked in requests:
                if linked.status == StockRequestStatusEnum.COMPLETED:
                    raise ValueError("완료된 연결 요청이 있어 취소할 수 없습니다.")
                stock_request_svc.release_reservation(db, linked)
                linked.status = StockRequestStatusEnum.CANCELLED
                linked.cancelled_at = now
                for line in linked.lines:
                    line.status = StockRequestStatusEnum.CANCELLED
            batch.status = "cancelled"
            batch.completed_at = None
            batch.updated_at = now
            db.flush()
            return request
        stock_request_svc.cancel_request(
            db,
            request,
            requester=requester,
            pin=pin,
            http_request=http_request,
        )
    return request


def revert_to_draft(
    db: Session,
    *,
    request: StockRequest,
    requester: Employee,
    pin: str,
    http_request: Optional[Request] = None,
) -> IoBatch:
    """연결 batch의 미결 요청을 모두 취소하고 하나의 draft로 되돌린다."""
    with transactional(db):
        batch_id = request.operation_batch_id
        if batch_id is None:
            raise ValueError("연결된 입출고 작업 묶음이 없습니다.")

        from app.services import internal_use_approval

        is_internal_use = internal_use_approval.is_internal_use_request(db, request)
        if is_internal_use:
            batch, linked_requests = internal_use_approval.lock_batch_requests(
                db,
                batch_id=batch_id,
            )
        else:
            requests_query = (
                db.query(StockRequest)
                .filter(StockRequest.operation_batch_id == batch_id)
                .order_by(StockRequest.created_at.asc(), StockRequest.request_id.asc())
                .populate_existing()
            )
            batch_query = db.query(IoBatch).filter(IoBatch.batch_id == batch_id)
            if db.bind is not None and db.bind.dialect.name != "sqlite":
                requests_query = requests_query.with_for_update()
            linked_requests = requests_query.all()
            if db.bind is not None and db.bind.dialect.name != "sqlite":
                batch_query = batch_query.with_for_update()
            batch = batch_query.first()
        if batch is None:
            raise ValueError("연결된 입출고 작업 묶음을 찾을 수 없습니다.")
        clicked_request = next(
            (linked for linked in linked_requests if linked.request_id == request.request_id),
            None,
        )
        if clicked_request is None:
            raise ValueError("요청과 입출고 작업 묶음의 연결 정보가 올바르지 않습니다.")
        if clicked_request.requester_employee_id != requester.employee_id:
            raise PermissionError("본인 요청만 수정할 수 있습니다.")
        if batch.requester_employee_id != requester.employee_id:
            raise PermissionError("본인 작업 묶음만 수정할 수 있습니다.")
        if not verify_pin(requester.pin_hash, pin):
            raise PermissionError("PIN이 일치하지 않습니다.")
        ensure_batch_is_mutable(batch)
        if batch.status in {"completed", "partially_completed"}:
            raise ValueError("완료된 작업 묶음은 수정할 수 없습니다.")
        if is_internal_use:
            raise ValueError("사용출고 작업은 수정할 수 없습니다. 전체 취소 후 다시 요청하세요.")

        open_statuses = {
            StockRequestStatusEnum.SUBMITTED,
            StockRequestStatusEnum.RESERVED,
        }
        preserved_statuses = {
            StockRequestStatusEnum.CANCELLED,
            StockRequestStatusEnum.REJECTED,
            StockRequestStatusEnum.FAILED_APPROVAL,
        }
        if clicked_request.status not in open_statuses:
            raise ValueError(f"수정할 수 없는 요청 상태입니다: {clicked_request.status.value}")
        if any(
            linked.requester_employee_id != requester.employee_id
            for linked in linked_requests
        ):
            raise PermissionError("본인 요청만 수정할 수 있습니다.")
        if any(linked.status == StockRequestStatusEnum.COMPLETED for linked in linked_requests):
            raise ValueError("완료된 연결 요청이 있어 작업을 수정할 수 없습니다.")
        if any(linked.status not in open_statuses | preserved_statuses for linked in linked_requests):
            raise ValueError("수정할 수 없는 연결 요청 상태가 있습니다.")

        for linked_request in linked_requests:
            if linked_request.status in open_statuses:
                stock_request_svc.cancel_request(
                    db,
                    linked_request,
                    requester=requester,
                    pin=pin,
                    http_request=http_request,
                )

        for linked_request in linked_requests:
            notification_svc.mark_approval_request_notifications_read(
                db,
                request_id=linked_request.request_id,
            )

        batch.status = "draft"
        batch.completed_at = None
        batch.updated_at = datetime.utcnow()
        db.flush()
    return batch
