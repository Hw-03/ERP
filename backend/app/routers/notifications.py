"""결재 알림 API — 조회 / 미읽음 수 / 읽음 처리."""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.verified_actor import (
    CurrentActor,
    VerifiedActor,
    VerifiedActorRouter,
    ensure_actor_employee_id,
)
from app.models import (
    Notification,
    NotificationTypeEnum,
    StockRequest,
    StockRequestStatusEnum,
)
from app.schemas import NotificationListResponse, NotificationMarkReadRequest
from app.services._tx import commit_only
from app.services.dept_hierarchy import can_approve_department

router = VerifiedActorRouter()

_LIST_LIMIT = 50


_PENDING_APPROVAL_STATUSES = {
    StockRequestStatusEnum.SUBMITTED,
    StockRequestStatusEnum.RESERVED,
}


def _visible_rows(db: Session, actor) -> list[Notification]:
    rows = (
        db.query(Notification)
        .filter(Notification.recipient_employee_id == actor.employee_id)
        .order_by(Notification.created_at.desc())
        .all()
    )
    approval_request_ids = {
        row.related_request_id
        for row in rows
        if row.type == NotificationTypeEnum.APPROVAL_REQUEST.value
        and row.related_request_id is not None
    }
    requests = {
        request.request_id: request
        for request in (
            db.query(StockRequest)
            .filter(StockRequest.request_id.in_(approval_request_ids))
            .all()
            if approval_request_ids
            else []
        )
    }
    warehouse_role = (actor.warehouse_role or "none").lower()
    can_approve_warehouse = warehouse_role in ("primary", "deputy")

    visible: list[Notification] = []
    for row in rows:
        if row.type != NotificationTypeEnum.APPROVAL_REQUEST.value:
            visible.append(row)
            continue
        request = requests.get(row.related_request_id)
        if request is None or request.status not in _PENDING_APPROVAL_STATUSES:
            continue
        if row.target_section == "queue":
            allowed = (
                can_approve_warehouse
                and bool(request.requires_warehouse_approval)
                and request.approved_by_employee_id is None
            )
        elif row.target_section == "dept-queue":
            approval_department = (
                request.approval_department or request.requester_department
            )
            allowed = (
                bool(request.requires_department_approval)
                and (
                    not bool(request.requires_warehouse_approval)
                    or request.approved_by_employee_id is not None
                )
                and request.department_approved_by_employee_id is None
                and can_approve_department(actor, approval_department)
            )
        else:
            allowed = False
        if allowed:
            visible.append(row)
    return visible


def _list_payload(db: Session, actor) -> dict:
    rows = _visible_rows(db, actor)
    return {
        "items": rows[:_LIST_LIMIT],
        "unread_count": sum(not bool(row.is_read) for row in rows),
    }


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    recipient_employee_id: uuid.UUID = Query(...),
    actor: CurrentActor = None,
    db: Session = Depends(get_db),
):
    ensure_actor_employee_id(actor, recipient_employee_id)
    return _list_payload(db, actor)


@router.get("/unread-count")
def unread_count(
    recipient_employee_id: uuid.UUID = Query(...),
    actor: CurrentActor = None,
    db: Session = Depends(get_db),
) -> dict:
    ensure_actor_employee_id(actor, recipient_employee_id)
    return {"count": sum(not bool(row.is_read) for row in _visible_rows(db, actor))}


@router.delete("/read")
def delete_read_notifications(
    recipient_employee_id: uuid.UUID = Query(...),
    actor: VerifiedActor = None,
    db: Session = Depends(get_db),
) -> Response:
    ensure_actor_employee_id(actor, recipient_employee_id)
    """읽은 알림 전체 하드 삭제."""
    db.query(Notification).filter(
        Notification.recipient_employee_id == recipient_employee_id,
        Notification.is_read.is_(True),
    ).delete()
    commit_only(db)
    return Response(status_code=204)


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: uuid.UUID,
    recipient_employee_id: uuid.UUID = Query(...),
    actor: VerifiedActor = None,
    db: Session = Depends(get_db),
) -> Response:
    ensure_actor_employee_id(actor, recipient_employee_id)
    """알림 개별 하드 삭제. 본인 소유 확인."""
    row = (
        db.query(Notification)
        .filter(
            Notification.notification_id == notification_id,
            Notification.recipient_employee_id == recipient_employee_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다.")
    db.delete(row)
    commit_only(db)
    return Response(status_code=204)


@router.post("/mark-read", response_model=NotificationListResponse)
def mark_read(
    payload: NotificationMarkReadRequest,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
):
    ensure_actor_employee_id(actor, payload.recipient_employee_id)
    """본인의 안 읽은 알림을 읽음 처리. notification_ids 가 없으면 전체."""
    query = db.query(Notification).filter(
        Notification.recipient_employee_id == payload.recipient_employee_id,
        Notification.is_read.is_(False),
    )
    if payload.notification_ids:
        query = query.filter(Notification.notification_id.in_(payload.notification_ids))
    for row in query.all():
        row.is_read = True
    commit_only(db)
    return _list_payload(db, actor)
