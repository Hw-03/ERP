"""활성 직원이 관리하는 불량 사유 마스터 API."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, DefectReasonCategory
from app.models.defect_reason_category import normalize_defect_reason_name
from app.routers._errors import ErrorCode, http_error
from app.schemas.reason_categories import ReasonCategoryCreate, ReasonCategoryUpdate, ReasonCategoryResponse
from app.services import audit

router = APIRouter()


def _active_employee(db: Session, employee_id: uuid.UUID) -> Employee:
    """사유 관리에 필요한 활성 직원 신원을 확인한다."""
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "요청자(직원)를 찾을 수 없습니다.")
    if not bool(employee.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "활성 직원만 사유를 관리할 수 있습니다.")
    return employee


@router.get("", response_model=list[ReasonCategoryResponse])
def list_reason_categories(requester_employee_id: uuid.UUID = Query(...), include_inactive: bool = Query(False), db: Session = Depends(get_db)) -> list[DefectReasonCategory]:
    """관리 화면은 숨긴 사유까지 조회하며 일반 선택 목록은 활성 사유만 반환한다."""
    _active_employee(db, requester_employee_id)
    query = db.query(DefectReasonCategory)
    if not include_inactive:
        query = query.filter(DefectReasonCategory.is_active.is_(True))
    return query.order_by(DefectReasonCategory.is_other.asc(), DefectReasonCategory.name.asc(), DefectReasonCategory.category_id.asc()).all()


@router.post("", response_model=ReasonCategoryResponse, status_code=status.HTTP_201_CREATED)
def create_reason_category(payload: ReasonCategoryCreate, request: Request, db: Session = Depends(get_db)) -> DefectReasonCategory:
    """중복 방지와 관리 감사 기록을 같은 트랜잭션에 저장한다."""
    actor = _active_employee(db, payload.requester_employee_id)
    normalized = normalize_defect_reason_name(payload.name)
    if db.query(DefectReasonCategory).filter_by(normalized_name=normalized).first():
        raise http_error(409, ErrorCode.CONFLICT, "같은 이름의 사유가 이미 존재합니다.")
    category = DefectReasonCategory(name=payload.name, normalized_name=normalized, is_active=True, is_other=False)
    db.add(category)
    try:
        db.flush()
        audit.record(db, request=request, action="defect_reason.create", target_type="defect_reason", target_id=str(category.category_id), payload_summary=category.name, actor_employee_code=actor.employee_code)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise http_error(409, ErrorCode.CONFLICT, "같은 이름의 사유가 이미 존재합니다.")
    db.refresh(category)
    return category


@router.patch("/{category_id}", response_model=ReasonCategoryResponse)
def update_reason_category(category_id: uuid.UUID, payload: ReasonCategoryUpdate, request: Request, db: Session = Depends(get_db)) -> DefectReasonCategory:
    """기타 예약 항목을 보호하고 이름·숨김·복원만 변경한다."""
    actor = _active_employee(db, payload.requester_employee_id)
    category = db.get(DefectReasonCategory, category_id)
    if category is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "사유를 찾을 수 없습니다.")
    if category.is_other and ((payload.name is not None and payload.name != category.name) or payload.is_active is False):
        raise http_error(400, ErrorCode.BAD_REQUEST, "기타 사유는 이름을 변경하거나 숨길 수 없습니다.")
    changes = []
    if payload.name is not None and payload.name != category.name:
        normalized = normalize_defect_reason_name(payload.name)
        if db.query(DefectReasonCategory).filter(DefectReasonCategory.normalized_name == normalized, DefectReasonCategory.category_id != category_id).first():
            raise http_error(409, ErrorCode.CONFLICT, "같은 이름의 사유가 이미 존재합니다.")
        category.name, category.normalized_name = payload.name, normalized
        changes.append("name")
    if payload.is_active is not None and bool(category.is_active) != payload.is_active:
        category.is_active = payload.is_active
        changes.append("reactivate" if payload.is_active else "hide")
    if changes:
        try:
            audit.record(db, request=request, action="defect_reason.update", target_type="defect_reason", target_id=str(category_id), payload_summary=f"{category.name}: {', '.join(changes)}", actor_employee_code=actor.employee_code)
            db.commit()
        except IntegrityError:
            db.rollback()
            raise http_error(409, ErrorCode.CONFLICT, "같은 이름의 사유가 이미 존재합니다.")
        db.refresh(category)
    return category
