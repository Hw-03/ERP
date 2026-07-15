"""인수인계서 API — 작성 / 목록 / 인수 대기함 / 인수 확인 / 단건(인쇄)."""

from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Query as SAQuery, Session

from app.database import get_db
from app.models import Employee, HandoverDoc, HandoverStatusEnum
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    HandoverCreate,
    HandoverDraftUpsert,
    HandoverReceiveRequest,
    HandoverResponse,
    HandoverSubmitRequest,
)
from app.services import handover as handover_svc
from app.services import handover_actions as handover_actions_svc

router = APIRouter()

# 인수인계를 받는(인수 확인하는) 부서 — 이 부서 소속만 대기함을 보고 인수할 수 있다.
_RECEIVE_DEPTS = ("고압", "진공")


def _load_actor(db: Session, employee_id: uuid.UUID) -> Employee:
    emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if emp is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")
    if not bool(emp.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원입니다.")
    return emp


def _inbox_query(db: Session, actor: Employee) -> Optional[SAQuery]:
    """인수 대기함 쿼리 — submitted + 본인 소속 부서 대상. None=권한 없음.

    받는 부서(고압/진공) 소속만 자기 부서로 온 인수인계를 본다. 인수 확인은 현장
    물리 인수 행위이므로 결재권자라도 받는 부서 소속이 아니면 대기함을 보지 못한다.
    """
    own = (actor.department or "").strip()
    if own not in _RECEIVE_DEPTS:
        return None
    return (
        db.query(HandoverDoc)
        .filter(HandoverDoc.status == HandoverStatusEnum.SUBMITTED)
        .filter(HandoverDoc.to_department == own)
    )


@router.post("", response_model=HandoverResponse, status_code=status.HTTP_201_CREATED)
def create_handover(payload: HandoverCreate, db: Session = Depends(get_db)):
    author = _load_actor(db, payload.author_employee_id)
    try:
        doc = handover_actions_svc.create_handover(db, author=author, payload=payload)
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    return doc


@router.put("/draft", response_model=HandoverResponse)
def save_handover_draft(payload: HandoverDraftUpsert, db: Session = Depends(get_db)):
    """인수인계 임시저장 — handover_id 없으면 신규 draft, 있으면 본인 기존 draft 갱신."""
    author = _load_actor(db, payload.author_employee_id)
    try:
        doc = handover_actions_svc.save_handover_draft(
            db,
            author=author,
            payload=payload,
        )
    except PermissionError as exc:
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    return doc


@router.post("/{handover_id}/submit", response_model=HandoverResponse)
def submit_handover(
    handover_id: uuid.UUID,
    payload: HandoverSubmitRequest,
    db: Session = Depends(get_db),
):
    """임시저장(DRAFT) → 제출(SUBMITTED). 제출 시 받는 부서에 도착 알림."""
    doc = db.query(HandoverDoc).filter(HandoverDoc.handover_id == handover_id).first()
    if doc is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "인수인계서를 찾을 수 없습니다.")
    author = _load_actor(db, payload.author_employee_id)
    try:
        handover_actions_svc.submit_handover(db, doc, author=author)
    except PermissionError as exc:
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    return doc


@router.delete("/draft/{handover_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_handover_draft(
    handover_id: uuid.UUID,
    author_employee_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    """임시저장 폐기 — 본인 DRAFT 만 삭제 가능. 이미 없으면 멱등 통과."""
    try:
        handover_actions_svc.delete_handover_draft(
            db,
            handover_id=handover_id,
            author_employee_id=author_employee_id,
        )
    except PermissionError as exc:
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))


@router.get("", response_model=List[HandoverResponse])
def list_handovers(
    author_employee_id: Optional[uuid.UUID] = Query(None),
    to_department: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
):
    q = db.query(HandoverDoc)
    if author_employee_id is not None:
        q = q.filter(HandoverDoc.author_employee_id == author_employee_id)
    if to_department is not None:
        q = q.filter(HandoverDoc.to_department == to_department)
    return q.order_by(HandoverDoc.created_at.desc()).limit(limit).all()


@router.get("/inbox", response_model=List[HandoverResponse])
def list_inbox(
    actor_employee_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
):
    actor = _load_actor(db, actor_employee_id)
    q = _inbox_query(db, actor)
    if q is None:
        return []
    return q.order_by(HandoverDoc.created_at.desc()).limit(limit).all()


@router.get("/inbox/count")
def inbox_count(
    actor_employee_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
) -> dict:
    actor = _load_actor(db, actor_employee_id)
    q = _inbox_query(db, actor)
    return {"count": int(q.count()) if q is not None else 0}


@router.post("/{handover_id}/receive", response_model=HandoverResponse)
def receive_handover(
    handover_id: uuid.UUID,
    payload: HandoverReceiveRequest,
    db: Session = Depends(get_db),
):
    doc = db.query(HandoverDoc).filter(HandoverDoc.handover_id == handover_id).first()
    if doc is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "인수인계서를 찾을 수 없습니다.")
    actor = _load_actor(db, payload.actor_employee_id)
    try:
        handover_svc.receive_handover(db, doc, actor=actor, pin=payload.pin)
    except PermissionError as exc:
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    return doc


@router.get("/{handover_id}", response_model=HandoverResponse)
def get_handover(handover_id: uuid.UUID, db: Session = Depends(get_db)):
    doc = db.query(HandoverDoc).filter(HandoverDoc.handover_id == handover_id).first()
    if doc is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "인수인계서를 찾을 수 없습니다.")
    return doc
