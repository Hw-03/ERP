"""Employee master router."""

from datetime import UTC, datetime
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, StockRequest
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    EmployeeCreate,
    EmployeePinChangeRequest,
    EmployeePinResetRequest,
    EmployeeResponse,
    EmployeeUpdate,
    PinVerifyRequest,
)
from app.routers.settings import require_admin
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin, verify_pin
from app.services import audit
from app.services._tx import commit_and_refresh, commit_only

router = APIRouter()


@router.get("", response_model=List[EmployeeResponse])
def list_employees(
    department: Optional[str] = Query(None),
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


def _auto_employee_code(db: Session) -> str:
    """기존 E{숫자} 패턴에서 최대값 + 1 자동 부여."""
    import re
    codes = [e.employee_code for e in db.query(Employee.employee_code).all()]
    nums = [int(m.group(1)) for c in codes if c and (m := re.fullmatch(r"E(\d+)", c))]
    return f"E{max(nums, default=0) + 1}"


@router.post("", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
def create_employee(payload: EmployeeCreate, request: Request, db: Session = Depends(get_db)):
    code = payload.employee_code.strip() if payload.employee_code else _auto_employee_code(db)
    existing = db.query(Employee).filter(Employee.employee_code == code).first()
    if existing:
        raise http_error(409, ErrorCode.CONFLICT, "직원 코드가 이미 존재합니다.")

    role_value = (payload.warehouse_role or "none").lower()
    if role_value not in ("none", "primary", "deputy"):
        raise http_error(
            422,
            ErrorCode.UNPROCESSABLE,
            "warehouse_role 은 none/primary/deputy 중 하나여야 합니다.",
        )

    dept_role_value = (payload.department_role or "none").lower()
    if dept_role_value not in ("none", "primary", "deputy"):
        raise http_error(
            422,
            ErrorCode.UNPROCESSABLE,
            "department_role 은 none/primary/deputy 중 하나여야 합니다.",
        )

    employee = Employee(
        employee_code=code,
        name=payload.name,
        role=payload.role,
        phone=payload.phone,
        department=payload.department,
        level=payload.level,
        warehouse_role=role_value,
        department_role=dept_role_value,
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
    if payload.warehouse_role is not None:
        new_role = payload.warehouse_role.lower()
        if new_role not in ("none", "primary", "deputy"):
            raise http_error(
                422,
                ErrorCode.UNPROCESSABLE,
                "warehouse_role 은 none/primary/deputy 중 하나여야 합니다.",
            )
        if (employee.warehouse_role or "none") != new_role:
            employee.warehouse_role = new_role
            changed.append("warehouse_role")
    if payload.department_role is not None:
        new_dept_role = payload.department_role.lower()
        if new_dept_role not in ("none", "primary", "deputy"):
            raise http_error(
                422,
                ErrorCode.UNPROCESSABLE,
                "department_role 은 none/primary/deputy 중 하나여야 합니다.",
            )
        if (employee.department_role or "none") != new_dept_role:
            employee.department_role = new_dept_role
            changed.append("department_role")
    if payload.display_order is not None and employee.display_order != payload.display_order:
        employee.display_order = payload.display_order; changed.append("display_order")
    if payload.is_active is not None:
        if employee.is_active != payload.is_active:
            employee.is_active = payload.is_active; changed.append("is_active")

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


@router.delete("/{employee_id}")
def delete_employee(employee_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")

    has_requests = db.query(StockRequest).filter(
        StockRequest.requester_employee_id == employee_id
    ).first() is not None

    if has_requests:
        employee.is_active = False
        employee.updated_at = datetime.now(UTC).replace(tzinfo=None)
        audit.record(
            db,
            request=request,
            action="employee.deactivate",
            target_type="employee",
            target_id=str(employee.employee_id),
            payload_summary=f"{employee.name} ({employee.employee_code}) — 이력 있어 비활성화",
        )
        commit_only(db)
        return JSONResponse(status_code=200, content={"result": "deactivated"})
    else:
        audit.record(
            db,
            request=request,
            action="employee.delete",
            target_type="employee",
            target_id=str(employee.employee_id),
            payload_summary=f"{employee.name} ({employee.employee_code}) — 영구 삭제",
        )
        db.delete(employee)
        commit_only(db)
        return JSONResponse(status_code=200, content={"result": "deleted"})


@router.post("/{employee_id}/verify-pin", response_model=EmployeeResponse)
def verify_employee_pin(employee_id: uuid.UUID, payload: PinVerifyRequest, db: Session = Depends(get_db)):
    """작업자 식별용 PIN 검증 — 실제 보안 인증이 아님."""
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")
    if not bool(employee.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원입니다.")
    if not verify_pin(employee.pin_hash, payload.pin):
        raise http_error(403, ErrorCode.FORBIDDEN, "PIN이 올바르지 않습니다.")
    return _to_response(employee)


@router.post("/{employee_id}/change-pin", status_code=status.HTTP_204_NO_CONTENT)
def change_employee_pin(
    employee_id: uuid.UUID,
    payload: EmployeePinChangeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """본인 PIN 변경 — 현재 PIN 검증 필요."""
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")
    if not employee.is_active:
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원입니다.")
    if not verify_pin(employee.pin_hash, payload.current_pin):
        raise http_error(403, ErrorCode.FORBIDDEN, "현재 PIN이 올바르지 않습니다.")
    if payload.current_pin == payload.new_pin:
        raise http_error(422, ErrorCode.UNPROCESSABLE, "새 PIN은 현재 PIN과 달라야 합니다.")

    employee.pin_hash = hash_pin(payload.new_pin)
    employee.updated_at = datetime.now(UTC).replace(tzinfo=None)
    employee.pin_last_changed = datetime.now(UTC).replace(tzinfo=None)

    audit.record(
        db,
        request=request,
        action="employee.change_pin",
        target_type="employee",
        target_id=str(employee.employee_id),
        payload_summary=f"{employee.name} PIN 변경",
    )
    commit_only(db)


@router.post("/{employee_id}/reset-pin", status_code=status.HTTP_204_NO_CONTENT)
def reset_employee_pin(
    employee_id: uuid.UUID,
    payload: EmployeePinResetRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """직원 PIN을 기본값(0000)으로 초기화 — 관리자 PIN 검증 필요."""
    require_admin(db, payload.admin_pin)

    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")

    employee.pin_hash = DEFAULT_PIN_HASH
    employee.updated_at = datetime.now(UTC).replace(tzinfo=None)
    employee.pin_last_changed = datetime.now(UTC).replace(tzinfo=None)

    audit.record(
        db,
        request=request,
        action="employee.reset_pin",
        target_type="employee",
        target_id=str(employee.employee_id),
        payload_summary=f"{employee.name} PIN 초기화",
    )
    commit_only(db)


def _to_response(employee: Employee) -> EmployeeResponse:
    pin_hash = getattr(employee, "pin_hash", None)
    pin_is_default = pin_hash is None or pin_hash == DEFAULT_PIN_HASH
    return EmployeeResponse(
        employee_id=employee.employee_id,
        employee_code=employee.employee_code,
        name=employee.name,
        role=employee.role,
        phone=employee.phone,
        department=employee.department,
        level=employee.level,
        warehouse_role=(employee.warehouse_role or "none"),
        department_role=(employee.department_role or "none"),
        display_order=int(employee.display_order),
        is_active=bool(employee.is_active),
        created_at=employee.created_at,
        updated_at=employee.updated_at,
        pin_last_changed=getattr(employee, "pin_last_changed", None),
        pin_is_default=pin_is_default,
    )
