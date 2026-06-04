"""인수인계서 API — 작성 / 목록 / 인수 대기함 / 인수 확인 / 단건(인쇄)."""

from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, HandoverDoc, HandoverStatusEnum
from app.routers._errors import ErrorCode, http_error
from app.schemas import HandoverCreate, HandoverReceiveRequest, HandoverResponse
from app.services import handover as handover_svc
from app.services._tx import commit_and_refresh
from app.services.dept_hierarchy import approvable_departments

router = APIRouter()


def _load_actor(db: Session, employee_id: uuid.UUID) -> Employee:
    emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if emp is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")
    if not bool(emp.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원입니다.")
    return emp


def _inbox_query(db: Session, actor: Employee):
    """인수 대기함 쿼리 — submitted + 인수 가능 부서 범위. None=권한 없음."""
    visible = approvable_departments(actor)
    if visible is not None and len(visible) == 0:
        return None
    q = db.query(HandoverDoc).filter(HandoverDoc.status == HandoverStatusEnum.SUBMITTED)
    if visible is not None:
        q = q.filter(HandoverDoc.to_department.in_(list(visible)))
    return q


@router.post("", response_model=HandoverResponse, status_code=status.HTTP_201_CREATED)
def create_handover(payload: HandoverCreate, db: Session = Depends(get_db)):
    author = _load_actor(db, payload.author_employee_id)
    try:
        doc = handover_svc.create_handover(db, author=author, payload=payload)
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    commit_and_refresh(db, doc)
    return doc


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
        db.rollback()
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    commit_and_refresh(db, doc)
    return doc


@router.get("/{handover_id}", response_model=HandoverResponse)
def get_handover(handover_id: uuid.UUID, db: Session = Depends(get_db)):
    doc = db.query(HandoverDoc).filter(HandoverDoc.handover_id == handover_id).first()
    if doc is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "인수인계서를 찾을 수 없습니다.")
    return doc
