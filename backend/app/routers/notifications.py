"""결재 알림 API — 조회 / 미읽음 수 / 읽음 처리."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import (
    IoBatch,
    Notification,
    NotificationTypeEnum,
    RequestBucketEnum,
    StockRequest,
    StockRequestStatusEnum,
)
from app.schemas import NotificationListResponse, NotificationMarkReadRequest
from app.schemas.notification import NotificationDisplaySummary, NotificationResponse
from app.services.notifications import _REQUEST_TYPE_LABEL, _summary
from app.services._tx import commit_only

router = APIRouter()

_LIST_LIMIT = 50


def _require_actor_recipient(actor_employee_id: uuid.UUID | None, recipient_employee_id: uuid.UUID) -> None:
    if actor_employee_id is None:
        raise HTTPException(status_code=400, detail="X-Actor-Employee-Id header is required.")
    if actor_employee_id != recipient_employee_id:
        raise HTTPException(status_code=403, detail="Notification recipient does not match actor.")


_APPROVAL_TYPES = {
    NotificationTypeEnum.APPROVAL_REQUEST.value,
    NotificationTypeEnum.APPROVAL_APPROVED.value,
    NotificationTypeEnum.APPROVAL_REJECTED.value,
}


def _operation_label(request: StockRequest, batch: IoBatch | None) -> str:
    """거래 로그가 아직 없는 결재 요청의 저장된 업무 분류를 표시한다."""
    request_type = getattr(request.request_type, "value", str(request.request_type))
    if request_type == "raw_receive":
        return "원자재 입고"
    if request_type == "raw_ship":
        return "원자재 출고"
    if request_type in {"supplier_return", "defect_return", "return_normal"}:
        return "반품"
    if request_type in {"defect_disassemble", "rework_normal"}:
        return "재작업"
    if request_type == "package_out":
        return "출하"

    if batch is not None:
        if batch.sub_type == "receive_supplier":
            return "원자재 입고"
        if batch.sub_type == "outbound_supplier":
            return "원자재 출고"
        if batch.work_type == "internal_use":
            destination = (batch.to_department or "").strip()
            if destination == "AS":
                return "AS 사용"
            if destination in {"연구", "연구소"}:
                return "연구소 사용"
            return "AS·연구 사용"
        if batch.work_type == "process" and request_type != "manual_adjustment":
            if batch.sub_type == "produce":
                return "생산 입고"
            if batch.sub_type == "disassemble":
                return "분해 출고"
        batch_labels = {
            "warehouse_io": "창고 입출고",
            "warehouse_adjust": "창고 수량 조정",
            "process": "부서 입출고",
            "defect": "불량",
        }
        if batch.work_type in batch_labels:
            return batch_labels[batch.work_type]

    if request_type == "internal_use":
        destination = (
            request.approval_department
            or next((line.to_department for line in request.lines if line.to_department), None)
            or request.requester_department
        )
        if destination == "AS":
            return "AS 사용"
        if destination in {"연구", "연구소"}:
            return "연구소 사용"
        return "AS·연구 사용"
    if request_type in {"warehouse_to_dept", "dept_to_warehouse"}:
        return "창고 입출고"
    if request_type in {"dept_internal", "manual_adjustment"}:
        has_department_line = any(
            line.from_bucket == RequestBucketEnum.PRODUCTION
            or line.to_bucket == RequestBucketEnum.PRODUCTION
            or line.from_department or line.to_department
            for line in request.lines
        )
        if request_type == "manual_adjustment" and not has_department_line and request.requester_department == "창고":
            return "창고 수량 조정"
        return "부서 입출고"
    if request_type.startswith("mark_defective") or request_type in {"defect_scrap", "scrap_normal"}:
        return "불량"
    return _REQUEST_TYPE_LABEL.get(request_type, request_type)


def _display_summary(request: StockRequest, batch: IoBatch | None) -> NotificationDisplaySummary:
    """요청 라인에 실제로 포함된 대표 품목과 추가 고유 품목 수를 제공한다."""
    lines = list(request.lines)
    representative = lines[0]
    if batch is not None:
        by_item_id = {line.item_id: line for line in lines}
        for bundle in batch.bundles:
            if bundle.source_item_id in by_item_id:
                representative = by_item_id[bundle.source_item_id]
                break
    additional_ids = {line.item_id for line in lines if line.item_id != representative.item_id}
    return NotificationDisplaySummary(
        requester_name=request.requester_name,
        operation_label=_operation_label(request, batch),
        item_name=representative.item_name_snapshot,
        additional_item_count=len(additional_ids),
    )


def _list_payload(db: Session, recipient_employee_id: uuid.UUID, *, unread_only: bool = False) -> dict:
    query = db.query(Notification).filter(Notification.recipient_employee_id == recipient_employee_id)
    if unread_only:
        query = query.filter(Notification.is_read.is_(False))
    rows = query.order_by(Notification.created_at.desc()).limit(_LIST_LIMIT).all()
    unread = (
        db.query(Notification)
        .filter(
            Notification.recipient_employee_id == recipient_employee_id,
            Notification.is_read.is_(False),
        )
        .count()
    )
    request_ids = {
        row.related_request_id
        for row in rows
        if row.type in _APPROVAL_TYPES and row.related_request_id is not None and row.body is not None
    }
    requests = {
        request.request_id: request
        for request in (
            db.query(StockRequest)
            .options(selectinload(StockRequest.lines))
            .filter(StockRequest.request_id.in_(request_ids))
            .all()
            if request_ids else []
        )
    }
    batch_ids = {request.operation_batch_id for request in requests.values() if request.operation_batch_id}
    batches = {
        batch.batch_id: batch
        for batch in (
            db.query(IoBatch)
            .options(selectinload(IoBatch.bundles))
            .filter(IoBatch.batch_id.in_(batch_ids))
            .all()
            if batch_ids else []
        )
    }
    items = []
    for row in rows:
        item = NotificationResponse.model_validate(row)
        request = requests.get(row.related_request_id)
        if request is not None and request.status != StockRequestStatusEnum.DRAFT and request.lines:
            request_type = getattr(request.request_type, "value", str(request.request_type))
            request_label = _REQUEST_TYPE_LABEL.get(request_type, request_type)
            identifier = request.request_code or str(request.request_id)[:8]
            legacy_bodies = {
                f"{request.requester_name} · {label} · {identifier}"
                for label in (request_type, request_label)
            }
            current_summary = _summary(request)
            if row.body in legacy_bodies or row.body == current_summary:
                update = {"display_summary": _display_summary(request, batches.get(request.operation_batch_id))}
                if row.body in legacy_bodies:
                    update["display_body"] = current_summary
                item = item.model_copy(update=update)
        items.append(item)
    return {"items": items, "unread_count": int(unread)}


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    recipient_employee_id: uuid.UUID = Query(...),
    unread_only: bool = Query(default=False),
    actor_employee_id: uuid.UUID | None = Header(default=None, alias="X-Actor-Employee-Id"),
    db: Session = Depends(get_db),
):
    _require_actor_recipient(actor_employee_id, recipient_employee_id)
    return _list_payload(db, recipient_employee_id, unread_only=unread_only)


@router.get("/unread-count")
def unread_count(
    recipient_employee_id: uuid.UUID = Query(...),
    actor_employee_id: uuid.UUID | None = Header(default=None, alias="X-Actor-Employee-Id"),
    db: Session = Depends(get_db),
) -> dict:
    _require_actor_recipient(actor_employee_id, recipient_employee_id)
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
    actor_employee_id: uuid.UUID | None = Header(default=None, alias="X-Actor-Employee-Id"),
    db: Session = Depends(get_db),
) -> Response:
    _require_actor_recipient(actor_employee_id, recipient_employee_id)
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
    actor_employee_id: uuid.UUID | None = Header(default=None, alias="X-Actor-Employee-Id"),
    db: Session = Depends(get_db),
) -> Response:
    _require_actor_recipient(actor_employee_id, recipient_employee_id)
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
    actor_employee_id: uuid.UUID | None = Header(default=None, alias="X-Actor-Employee-Id"),
    db: Session = Depends(get_db),
):
    _require_actor_recipient(actor_employee_id, payload.recipient_employee_id)
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
