"""Authenticated, read-only saved work shared across employee departments."""
from typing import Literal
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.operator_sessions import require_operator_session
from app.schemas.work_drafts import WorkDraftDetail, WorkDraftList
from app.services import work_drafts


router = APIRouter(dependencies=[Depends(require_operator_session)])


@router.get("", response_model=WorkDraftList)
def list_work_drafts(
    search: str | None = None,
    requester_department: str | None = None,
    requester_employee_id: uuid.UUID | None = None,
    sort: Literal["updated_desc", "updated_asc", "department"] = "updated_desc",
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict:
    """전체 직원의 저장 작업을 선택한 시간순 또는 부서순으로 함께 조회한다."""
    return work_drafts.list_work_drafts(db, search=search, requester_department=requester_department,
        requester_employee_id=requester_employee_id, skip=skip, limit=limit, sort=sort)


@router.get("/{kind}/{id}", response_model=WorkDraftDetail)
def get_work_draft(kind: Literal["io", "stock_request", "shipping"], id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    """저장 상태 작업의 대상 품목과 공개 예약 정보만 조회한다."""
    detail = work_drafts.get_work_draft(db, kind, id)
    if detail is None:
        raise HTTPException(status_code=404, detail="저장 작업을 찾을 수 없습니다.")
    return detail
