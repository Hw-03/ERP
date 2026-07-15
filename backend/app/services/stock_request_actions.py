"""StockRequest HTTP 업무 명령의 트랜잭션 경계."""

from __future__ import annotations

import uuid
from typing import Optional, Sequence

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import (
    Employee,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.services import notifications as notification_svc
from app.services import stock_requests as stock_request_svc
from app.services._tx import transactional
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
    approver_id = approver.employee_id
    try:
        with transactional(db):
            previous_status = request.status
            stock_request_svc.approve_request(
                db,
                request,
                approver=approver,
                pin=pin,
                http_request=http_request,
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
    except stock_request_svc.FailedApprovalError as exc:
        _record_failed_approval(
            db,
            request_id=request_id,
            approver_id=approver_id,
            reason=str(exc),
        )
        raise
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
    approver_id = approver.employee_id
    try:
        with transactional(db):
            previous_status = request.status
            stock_request_svc.approve_request_department(
                db,
                request,
                approver=approver,
                pin=pin,
                http_request=http_request,
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
    except stock_request_svc.FailedApprovalError as exc:
        _record_failed_approval(
            db,
            request_id=request_id,
            approver_id=approver_id,
            reason=str(exc),
        )
        raise
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
        stock_request_svc.cancel_request(
            db,
            request,
            requester=requester,
            pin=pin,
            http_request=http_request,
        )
    return request
