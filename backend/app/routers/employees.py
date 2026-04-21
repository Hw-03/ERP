"""Employee master router."""

from datetime import UTC, datetime
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DepartmentEnum, Employee
from app.schemas import EmployeeCreate, EmployeeResponse, EmployeeUpdate

router = APIRouter()


@router.get("", response_model=List[EmployeeResponse])
def list_employees(
    department: Optional[DepartmentEnum] = Query(None),
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    query = db.query(Employee)
    if department:
        query = query.filter(Employee.department == department)
    if active_only:
        query = query.filter(Employee.is_active == "true")

    employees = query.order_by(Employee.display_order.asc(), Employee.name.asc()).all()
    return [_to_response(employee) for employee in employees]


@router.post("", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
def create_employee(payload: EmployeeCreate, db: Session = Depends(get_db)):
    existing = db.query(Employee).filter(Employee.employee_code == payload.employee_code).first()
    if existing:
        raise HTTPException(status_code=409, detail="직원 코드가 이미 존재합니다.")

    employee = Employee(
        employee_code=payload.employee_code,
        name=payload.name,
        role=payload.role,
        phone=payload.phone,
        department=payload.department,
        level=payload.level,
        display_order=payload.display_order,
        is_active="true" if payload.is_active else "false",
    )
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return _to_response(employee)


@router.put("/{employee_id}", response_model=EmployeeResponse)
def update_employee(employee_id: uuid.UUID, payload: EmployeeUpdate, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")

    if payload.name is not None:
        employee.name = payload.name
    if payload.role is not None:
        employee.role = payload.role
    if payload.phone is not None:
        employee.phone = payload.phone
    if payload.department is not None:
        employee.department = payload.department
    if payload.level is not None:
        employee.level = payload.level
    if payload.display_order is not None:
        employee.display_order = payload.display_order
    if payload.is_active is not None:
        employee.is_active = "true" if payload.is_active else "false"

    employee.updated_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    db.refresh(employee)
    return _to_response(employee)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(employee_id: uuid.UUID, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    db.delete(employee)
    db.commit()


def _to_response(employee: Employee) -> EmployeeResponse:
    return EmployeeResponse(
        employee_id=employee.employee_id,
        employee_code=employee.employee_code,
        name=employee.name,
        role=employee.role,
        phone=employee.phone,
        department=employee.department,
        level=employee.level,
        display_order=int(employee.display_order),
        is_active=employee.is_active == "true",
        created_at=employee.created_at,
        updated_at=employee.updated_at,
    )
