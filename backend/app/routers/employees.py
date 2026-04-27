"""Employee master router."""

from datetime import UTC, datetime
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DepartmentEnum, Employee
from app.routers._errors import ErrorCode, http_error
from app.schemas import EmployeeCreate, EmployeeResponse, EmployeeUpdate
from app.services import audit
from app.services._tx import commit_and_refresh, commit_only

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
def create_employee(payload: EmployeeCreate, request: Request, db: Session = Depends(get_db)):
    existing = db.query(Employee).filter(Employee.employee_code == payload.employee_code).first()
    if existing:
        raise http_error(409, ErrorCode.CONFLICT, "직원 코드가 이미 존재합니다.")

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
    db.flush()

    audit.record(
        db,
        request=request,
        action="employee.create",
        target_type="employee",
        target_id=str(employee.employee_id),
        payload_summary=f"{employee.name} ({employee.employee_code})",
    )

    commit_and_refresh(db, employee)
    return _to_response(employee)


@router.put("/{employee_id}", response_model=EmployeeResponse)
def update_employee(employee_id: uuid.UUID, payload: EmployeeUpdate, request: Request, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")

    changed: list[str] = []
    if payload.name is not None and employee.name != payload.name:
        employee.name = payload.name; changed.append("name")
    if payload.role is not None and employee.role != payload.role:
        employee.role = payload.role; changed.append("role")
    if payload.phone is not None and employee.phone != payload.phone:
        employee.phone = payload.phone; changed.append("phone")
    if payload.department is not None and employee.department != payload.department:
        employee.department = payload.department; changed.append("department")
    if payload.level is not None and employee.level != payload.level:
        employee.level = payload.level; changed.append("level")
    if payload.display_order is not None and employee.display_order != payload.display_order:
        employee.display_order = payload.display_order; changed.append("display_order")
    if payload.is_active is not None:
        new_flag = "true" if payload.is_active else "false"
        if employee.is_active != new_flag:
            employee.is_active = new_flag; changed.append("is_active")

    employee.updated_at = datetime.now(UTC).replace(tzinfo=None)

    if changed:
        audit.record(
            db,
            request=request,
            action="employee.update",
            target_type="employee",
            target_id=str(employee.employee_id),
            payload_summary=f"{employee.name}: {', '.join(changed)}",
        )

    commit_and_refresh(db, employee)
    return _to_response(employee)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(employee_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")

    audit.record(
        db,
        request=request,
        action="employee.delete",
        target_type="employee",
        target_id=str(employee.employee_id),
        payload_summary=f"{employee.name} ({employee.employee_code})",
    )
    db.delete(employee)
    commit_only(db)


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
