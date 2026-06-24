"""결재 알림 API — 조회 / 미읽음 수 / 읽음 처리."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Notification
from app.schemas import NotificationListResponse, NotificationMarkReadRequest
from app.services._tx import commit_only

router = APIRouter()

_LIST_LIMIT = 50


def _list_payload(db: Session, recipient_employee_id: uuid.UUID) -> dict:
    rows = (
        db.query(Notification)
        .filter(Notification.recipient_employee_id == recipient_employee_id)
        .order_by(Notification.created_at.desc())
        .limit(_LIST_LIMIT)
        .all()
    )
    unread = (
        db.query(Notification)
        .filter(
            Notification.recipient_employee_id == recipient_employee_id,
            Notification.is_read.is_(False),
        )
        .count()
    )
    return {"items": rows, "unread_count": int(unread)}


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    recipient_employee_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    return _list_payload(db, recipient_employee_id)


@router.get("/unread-count")
def unread_count(
    recipient_employee_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
) -> dict:
    n = (
        db.query(Notification)
        .filter(
            Notification.recipient_employee_id == recipient_employee_id,
            Notification.is_read.is_(False),
        )
        .count()
    )
    return {"count": int(n)}


@router.delete("/read")
def delete_read_notifications(
    recipient_employee_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
) -> Response:
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
    db: Session = Depends(get_db),
) -> Response:
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
def mark_read(payload: NotificationMarkReadRequest, db: Session = Depends(get_db)):
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
    return _list_payload(db, payload.recipient_employee_id)
