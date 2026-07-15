"""인수인계 작성·draft·제출·삭제 HTTP 명령의 트랜잭션 경계."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models import Employee, HandoverDoc, HandoverStatusEnum
from app.schemas import HandoverCreate, HandoverDraftUpsert
from app.services import handover as handover_svc
from app.services import notifications as notifications_svc
from app.services._tx import transactional


def create_handover(
    db: Session,
    *,
    author: Employee,
    payload: HandoverCreate,
) -> HandoverDoc:
    """문서·라인·도착 알림을 하나의 업무 트랜잭션으로 확정한다."""
    with transactional(db):
        doc = handover_svc.create_handover(db, author=author, payload=payload)
        notifications_svc.notify_handover_arrived(db, doc)
    return doc


def save_handover_draft(
    db: Session,
    *,
    author: Employee,
    payload: HandoverDraftUpsert,
) -> HandoverDoc:
    """draft 문서와 라인 교체를 원자적으로 확정한다."""
    with transactional(db):
        return handover_svc.save_handover_draft(db, author=author, payload=payload)


def submit_handover(
    db: Session,
    doc: HandoverDoc,
    *,
    author: Employee,
) -> HandoverDoc:
    """draft 제출 상태와 도착 알림을 원자적으로 확정한다."""
    with transactional(db):
        result = handover_svc.submit_handover(db, doc, author=author)
        notifications_svc.notify_handover_arrived(db, result)
    return result


def delete_handover_draft(
    db: Session,
    *,
    handover_id: uuid.UUID,
    author_employee_id: uuid.UUID,
) -> bool:
    """본인 draft와 소속 라인을 원자적으로 삭제하며, 부재 시 멱등 성공한다."""
    with transactional(db):
        doc = (
            db.query(HandoverDoc)
            .filter(HandoverDoc.handover_id == handover_id)
            .first()
        )
        if doc is None:
            return False
        if doc.author_employee_id != author_employee_id:
            raise PermissionError("본인 임시저장만 삭제할 수 있습니다.")
        if doc.status != HandoverStatusEnum.DRAFT:
            raise ValueError("임시저장 상태만 삭제할 수 있습니다.")
        db.delete(doc)
        db.flush()
    return True
