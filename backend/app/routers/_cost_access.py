"""Shared cost write policy for dedicated and legacy item endpoints."""

from fastapi import Request
from sqlalchemy.orm import Session

from app._actor import set_actor
from app.models import Employee
from app.routers._errors import ErrorCode, http_error
from app.services.operator_session import resolve_session


def can_edit_cost(employee: Employee) -> bool:
    """Read server roles rather than trusting role claims from the client."""
    return bool(employee.is_active) and (
        employee.department_role in {"primary", "deputy"}
        or employee.warehouse_role in {"primary", "deputy"}
    )


def require_cost_editor(db: Session, request: Request) -> Employee:
    """Require an active operator before any cost mutation can be staged."""
    resolved = resolve_session(db, request.headers.get("X-Operator-Session"))
    if resolved is None:
        raise http_error(401, "OPERATOR_SESSION_INVALID", "작업자 인증을 다시 진행해 주세요.")
    employee = resolved[0]
    if not can_edit_cost(employee):
        raise http_error(403, ErrorCode.FORBIDDEN, "부서 또는 창고 정·부 담당자만 원가 기준을 수정할 수 있습니다.")
    set_actor(request, employee)
    return employee
