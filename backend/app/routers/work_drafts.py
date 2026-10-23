"""Authenticated, read-only saved work shared across employee departments."""
from typing import Literal
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.operator_sessions import require_operator_session
from app.schemas.work_drafts import WorkDraftDetail, WorkDraftList
from app.schemas.work_drafts import WorkDraftCount
from app.schemas.io import IoBatchResponse
from app.services import io_draft
from app.models import Employee, OperatorSession
from app.services import work_drafts


router = APIRouter(dependencies=[Depends(require_operator_session)])


@router.get("/count", response_model=WorkDraftCount)
def count_work_drafts(
    actor: tuple[Employee, OperatorSession] = Depends(require_operator_session),
    db: Session = Depends(get_db),
) -> dict:
    """현재 로그인한 직원의 저장 작업은 상세를 만들지 않고 집계한다."""
    return work_drafts.count_work_drafts(db, actor[0].employee_id)


@router.get("/owned-io/{batch_id}", response_model=IoBatchResponse)
def get_owned_io_draft(
    batch_id: uuid.UUID,
    actor: tuple[Employee, OperatorSession] = Depends(require_operator_session),
    db: Session = Depends(get_db),
) -> dict:
    """복원 직전에 소유자와 작성 상태를 확인하고 현재 재고로 조회한다."""
    draft = io_draft.get_owned_draft(db, batch_id=batch_id, requester_employee_id=actor[0].employee_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="저장한 작업을 찾을 수 없습니다.")
    return draft


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
