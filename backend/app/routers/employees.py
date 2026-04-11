"""
Employees Router — 직원 관리 CRUD
처리자 기록 및 부서별 입출고 추적용
"""

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee
from app.schemas import EmployeeCreate, EmployeeUpdate, EmployeeResponse

router = APIRouter()


@router.get("/", response_model=List[EmployeeResponse])
def list_employees(
    active_only: bool = Query(True, description="재직자만 조회"),
    department: Optional[str] = Query(None, description="부서 필터"),
    db: Session = Depends(get_db),
):
    """직원 목록 조회."""
    query = db.query(Employee)
    if active_only:
        query = query.filter(Employee.is_active == True)
    if department:
        query = query.filter(Employee.department.ilike(f"%{department}%"))
    return query.order_by(Employee.department, Employee.name).all()


@router.post("/", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
def create_employee(payload: EmployeeCreate, db: Session = Depends(get_db)):
    """직원 등록."""
    emp = Employee(
        name=payload.name,
        department=payload.department,
        role=payload.role,
        phone=payload.phone,
        is_active=True,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


@router.get("/{employee_id}", response_model=EmployeeResponse)
def get_employee(employee_id: uuid.UUID, db: Session = Depends(get_db)):
    """직원 단일 조회."""
    emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    return emp


@router.put("/{employee_id}", response_model=EmployeeResponse)
def update_employee(
    employee_id: uuid.UUID,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
):
    """직원 정보 수정 (퇴직 처리 포함)."""
    emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")

    if payload.name is not None:
        emp.name = payload.name
    if payload.department is not None:
        emp.department = payload.department
    if payload.role is not None:
        emp.role = payload.role
    if payload.phone is not None:
        emp.phone = payload.phone
    if payload.is_active is not None:
        emp.is_active = payload.is_active

    db.commit()
    db.refresh(emp)
    return emp


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(employee_id: uuid.UUID, db: Session = Depends(get_db)):
    """직원 삭제."""
    emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    db.delete(emp)
    db.commit()


from pydantic import BaseModel as _BaseModel

class ReorderPayload(_BaseModel):
    ordered_ids: list[str]


@router.post("/reorder", status_code=status.HTTP_200_OK)
def reorder_employees(payload: ReorderPayload, db: Session = Depends(get_db)):
    """직원 표시 순서 업데이트 (레거시 드래그 정렬)."""
    for i, eid in enumerate(payload.ordered_ids):
        emp = db.query(Employee).filter(Employee.employee_id == eid).first()
        if emp:
            emp.display_order = i
    db.commit()
    return {"message": f"{len(payload.ordered_ids)}명 순서 업데이트 완료"}
