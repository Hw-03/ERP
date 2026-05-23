"""Department master router."""

from typing import Annotated, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin import require_admin_pin
from app.models import Department
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
    _admin: Annotated[None, Depends(require_admin_pin)],
    db: Session = Depends(get_db),
):
    if db.query(Department).filter(Department.name == payload.name).first():
        raise HTTPException(status_code=409, detail="이미 존재하는 부서명입니다.")
    dept = Department(
        name=payload.name,
        display_order=payload.display_order,
        is_active=True,
        color_hex=payload.color_hex,
        io_enabled=payload.io_enabled if payload.io_enabled is not None else True,
    )
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


@router.patch("/reorder")
def reorder_departments(
    payload: DepartmentReorderPayload,
    _admin: Annotated[None, Depends(require_admin_pin)],
    db: Session = Depends(get_db),
):
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
    _admin: Annotated[None, Depends(require_admin_pin)],
    db: Session = Depends(get_db),
):
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
    if payload.io_enabled is not None:
        dept.io_enabled = payload.io_enabled
    db.commit()
    db.refresh(dept)
    return dept


@router.delete("/{dept_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(
    dept_id: int,
    _admin: Annotated[None, Depends(require_admin_pin)],
    pin: Optional[str] = Query(None, description="관리자 PIN (deprecated — body 사용 권장)"),
    body: Optional[DepartmentDeleteRequest] = Body(None),
    db: Session = Depends(get_db),
):
    """관리자 PIN 으로 부서 삭제.

    PIN 은 request body(`{"pin": "..."}`) 로 전달하면 access log 에 남지 않는다.
    하위호환을 위해 body 가 없으면 query string `pin` 으로 폴백한다.
    """
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="부서를 찾을 수 없습니다.")
    db.delete(dept)
    db.commit()
