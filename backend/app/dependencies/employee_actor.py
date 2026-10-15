"""Resolve the existing tab actor header without treating it as signed auth."""

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import Employee
from app.routers._errors import ErrorCode, http_error


def require_current_employee_actor(
    request: Request, db: Session, *, required: bool = True,
) -> Employee | None:
    """Recheck the claimed tab employee; optional callers preserve PIN-only APIs."""
    code = (request.headers.get("X-MES-Employee-Code") or "").strip()
    if not code:
        if required:
            raise http_error(400, ErrorCode.BAD_REQUEST, "작업자 사번이 필요합니다.")
        return None
    employee = db.query(Employee).filter(Employee.employee_code == code).first()
    if employee is None or not (
        employee.is_active is True
        or isinstance(employee.is_active, str) and employee.is_active.lower() == "true"
    ):
        raise http_error(403, ErrorCode.FORBIDDEN, "활성 직원만 사용할 수 있습니다.")
    return employee
