"""결재 알림 서비스 — 수신자 계산 + 알림 생성.

- 요청 도착 → 승인 담당자(들) 에게 (요청자 본인 제외)
- 승인 완료 / 반려 → 요청자 에게

세션에 add 만 한다. commit 은 호출 라우터/서비스가 수행하여 요청 상태변경과
같은 트랜잭션으로 묶인다(요청 롤백 시 알림도 롤백).
"""

from __future__ import annotations

from typing import Iterable

from sqlalchemy.orm import Session

from app.models import (
    Employee,
    Notification,
    NotificationTypeEnum,
    StockRequest,
    StockRequestStatusEnum,
)
from app.services.dept_hierarchy import can_approve_department

# 큐에 노출되는(=결재 대기) 상태. warehouse/department-queue 필터와 동일.
_PENDING_STATUSES = (
    StockRequestStatusEnum.SUBMITTED,
    StockRequestStatusEnum.RESERVED,
)


def _active_employees(db: Session) -> list[Employee]:
    return [e for e in db.query(Employee).all() if bool(e.is_active)]


def recipients_for_warehouse_approval(db: Session) -> list[Employee]:
    """창고 결재 대기 요청을 볼 수 있는 직원 — 창고 정/부."""
    return [
        e
        for e in _active_employees(db)
        if (getattr(e, "warehouse_role", None) or "none").lower() in ("primary", "deputy")
    ]


def recipients_for_department_approval(db: Session, target_dept: str | None) -> list[Employee]:
    """부서 결재 대기 요청을 볼 수 있는 직원 — can_approve_department 단일 원천 사용."""
    return [e for e in _active_employees(db) if can_approve_department(e, target_dept)]


def _summary(request: StockRequest) -> str:
    code = request.request_code or str(request.request_id)[:8]
    rtype = getattr(request.request_type, "value", str(request.request_type))
    return f"{request.requester_name} · {rtype} · {code}"


def _add(
    db: Session,
    *,
    recipient_employee_id,
    ntype: NotificationTypeEnum,
    title: str,
    body: str,
    request: StockRequest,
    target_tab: str,
    target_section: str,
) -> None:
    db.add(
        Notification(
            recipient_employee_id=recipient_employee_id,
            type=ntype.value,
            title=title,
            body=body,
            target_tab=target_tab,
            target_section=target_section,
            related_request_id=request.request_id,
        )
    )


def notify_request_arrived(db: Session, request: StockRequest) -> None:
    """결재 요청 도착 → 승인 담당자(들) 에게 알림. 요청자 본인은 제외.

    호출 안전 — 결재 대기 상태가 아니거나(자가승인 즉시완료 등) 이미 승인된
    단계면 아무 것도 하지 않는다. create/submit/io 경로에서 무조건 호출해도 됨.
    """
    if request.status not in _PENDING_STATUSES:
        return

    recipients: Iterable[Employee]
    if request.requires_warehouse_approval and request.approved_by_employee_id is None:
        recipients = recipients_for_warehouse_approval(db)
        target_section = "queue"
    elif (
        request.requires_department_approval
        and not request.requires_warehouse_approval
        and request.department_approved_by_employee_id is None
    ):
        recipients = recipients_for_department_approval(db, request.requester_department)
        target_section = "dept-queue"
    else:
        return

    body = _summary(request)
    for emp in recipients:
        if emp.employee_id == request.requester_employee_id:
            continue
        _add(
            db,
            recipient_employee_id=emp.employee_id,
            ntype=NotificationTypeEnum.APPROVAL_REQUEST,
            title="새 결재 요청",
            body=body,
            request=request,
            target_tab="warehouse",
            target_section=target_section,
        )


def notify_request_decided(db: Session, request: StockRequest, *, decision: str) -> None:
    """승인/반려 결과 → 요청자 에게 알림. decision in ('approved', 'rejected')."""
    if decision == "approved":
        ntype = NotificationTypeEnum.APPROVAL_APPROVED
        title = "결재 승인됨"
    else:
        ntype = NotificationTypeEnum.APPROVAL_REJECTED
        title = "결재 반려됨"
    _add(
        db,
        recipient_employee_id=request.requester_employee_id,
        ntype=ntype,
        title=title,
        body=_summary(request),
        request=request,
        target_tab="warehouse",
        target_section="mine",
    )
