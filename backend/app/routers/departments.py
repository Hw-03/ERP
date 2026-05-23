"""Department master router."""

from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Department
from app.routers._errors import ErrorCode, http_error
from app.routers.settings import require_admin
from app.services.reorder import reorder_by_display_order
from app.schemas import (
    DepartmentCreate,
    DepartmentDeleteRequest,
    DepartmentReorderPayload,
    DepartmentResponse,
    DepartmentUpdate,
)

router = APIRouter()


@router.get("", response_model=List[DepartmentResponse])
def list_departments(
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Department)
    if is_active is not None:
        query = query.filter(Department.is_active == is_active)
    return query.order_by(Department.display_order.asc(), Department.name.asc()).all()


@router.post("", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
def create_department(
    payload: DepartmentCreate,
    db: Session = Depends(get_db),
):
    require_admin(db, payload.pin)
    if db.query(Department).filter(Department.name == payload.name).first():
        raise HTTPException(status_code=409, detail="이미 존재하는 부서명입니다.")
    dept = Department(name=payload.name, display_order=payload.display_order, is_active=True, color_hex=payload.color_hex)
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


@router.patch("/reorder")
def reorder_departments(payload: DepartmentReorderPayload, db: Session = Depends(get_db)):
    require_admin(db, payload.pin)
    reorder_by_display_order(
        db, Department, "id",
        [(item.id, item.display_order) for item in payload.items],
    )
    db.commit()
    return {"ok": True}


@router.put("/{dept_id}", response_model=DepartmentResponse)
def update_department(
    dept_id: int,
    payload: DepartmentUpdate,
    db: Session = Depends(get_db),
):
    require_admin(db, payload.pin)
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="부서를 찾을 수 없습니다.")
    if payload.name is not None:
        if db.query(Department).filter(Department.name == payload.name, Department.id != dept_id).first():
            raise HTTPException(status_code=409, detail="이미 존재하는 부서명입니다.")
        dept.name = payload.name
    if payload.display_order is not None:
        dept.display_order = payload.display_order
    if payload.is_active is not None:
        dept.is_active = payload.is_active
    if payload.color_hex is not None:
        dept.color_hex = payload.color_hex
    db.commit()
    db.refresh(dept)
    return dept


@router.delete("/{dept_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(
    dept_id: int,
    pin: Optional[str] = Query(None, description="관리자 PIN (deprecated — body 사용 권장)"),
    body: Optional[DepartmentDeleteRequest] = Body(None),
    db: Session = Depends(get_db),
):
    """관리자 PIN 으로 부서 삭제.

    PIN 은 request body(`{"pin": "..."}`) 로 전달하면 access log 에 남지 않는다.
    하위호환을 위해 body 가 없으면 query string `pin` 으로 폴백한다.
    """
    effective_pin = (body.pin if body and body.pin else None) or pin
    if not effective_pin:
        raise http_error(400, ErrorCode.BAD_REQUEST, "관리자 PIN 이 필요합니다.")
    require_admin(db, effective_pin)
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="부서를 찾을 수 없습니다.")
    db.delete(dept)
    db.commit()
