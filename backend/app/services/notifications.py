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
    HandoverDoc,
    HandoverStatusEnum,
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


# 결재 요청 유형 → 한국어 라벨. 프론트 frontend/lib/io/glossary.ts REQUEST_TYPE_LABEL 미러
# (StockRequestTypeEnum 전 멤버). 알림 본문에 원시값(warehouse_to_dept 등)이 노출되지 않게 한다.
_REQUEST_TYPE_LABEL: dict[str, str] = {
    "raw_receive": "원자재 입고",
    "raw_ship": "원자재 출고",
    "warehouse_to_dept": "창고 → 부서",
    "dept_to_warehouse": "부서 → 창고",
    "dept_internal": "부서 내부 이동",
    "mark_defective_wh": "창고 불량 등록",
    "mark_defective_prod": "생산 불량 등록",
    "supplier_return": "원자재 반품",
    "package_out": "출하",
    "manual_adjustment": "수동 조정",
    "internal_use": "AS·연구 사용출고",
    "defect_scrap": "불량 처리",
    "defect_return": "원자재 반품",
    "defect_disassemble": "불량 분해",
    "scrap_normal": "정상 폐기",
    "rework_normal": "정상 재작업",
    "return_normal": "정상 반품",
}


def _summary(request: StockRequest) -> str:
    code = request.request_code or str(request.request_id)[:8]
    rtype = getattr(request.request_type, "value", str(request.request_type))
    label = _REQUEST_TYPE_LABEL.get(rtype, rtype)
    return f"{request.requester_name} · {label} · {code}"


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


def recipients_for_handover(db: Session, to_department: str | None) -> list[Employee]:
    """인수인계 도착 알림 수신자 — 받는 부서(고압/진공) 소속만.

    인수 확인 권한이 받는 부서 소속에 한정되므로, 인수할 수 없는 결재권자에게는
    도착 알림을 보내지 않는다(노이즈 방지).
    """
    target = (to_department or "").strip()
    return [e for e in _active_employees(db) if (e.department or "").strip() == target]


def notify_handover_arrived(db: Session, doc: HandoverDoc) -> None:
    """인수인계 제출 → 받는 부서 인수 담당자에게 알림. 작성자 본인 제외. 세션 add 만."""
    if doc.status != HandoverStatusEnum.SUBMITTED:
        return
    body = f"{doc.from_department}→{doc.to_department} · {doc.title}"
    for emp in recipients_for_handover(db, doc.to_department):
        if emp.employee_id == doc.author_employee_id:
            continue
        db.add(
            Notification(
                recipient_employee_id=emp.employee_id,
                type=NotificationTypeEnum.HANDOVER_ARRIVED.value,
                title="새 인수인계 도착",
                body=body,
                target_tab="warehouse",
                target_section="handover",
                related_request_id=None,
            )
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
