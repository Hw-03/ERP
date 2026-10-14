"""Explicit per-tab operator authentication without using the legacy audit cookie."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, status
from sqlalchemy.orm import Session

from app._actor import set_actor
from app.database import get_db
from app.models import Employee, OperatorSession
from app.routers._errors import ErrorCode, http_error
from app.schemas.operator_session import (
    OperatorSessionCreate,
    OperatorSessionCurrent,
    OperatorSessionIssued,
)
from app.services import rate_limit
from app.services.operator_session import (
    commit_session_without_realtime,
    issue_session,
    resolve_session,
    revoke_session,
)
from app.services.pin_auth import verify_pin


router = APIRouter()


def require_operator_session(
    db: Session = Depends(get_db),
    token: Annotated[str | None, Header(alias="X-Operator-Session")] = None,
) -> tuple[Employee, OperatorSession]:
    """Authenticate only the explicit bearer used by future stocktake routes."""
    resolved = resolve_session(db, token)
    if resolved is None:
        raise http_error(401, "OPERATOR_SESSION_INVALID", "작업자 인증을 다시 진행해 주세요.")
    return resolved


@router.post("", response_model=OperatorSessionIssued, status_code=status.HTTP_201_CREATED)
def create_operator_session(
    payload: OperatorSessionCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> OperatorSessionIssued:
    """Issue a token after the same employee PIN and rate-limit checks as login."""
    client_ip = getattr(getattr(request, "client", None), "host", None) or "unknown"
    rl_key = f"verify_pin:{payload.employee_id}:{client_ip}"
    if rate_limit.is_blocked(rl_key):
        raise http_error(429, ErrorCode.TOO_MANY_REQUESTS, "PIN 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.")
    employee = db.get(Employee, payload.employee_id)
    if employee is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")
    if not bool(employee.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원입니다.")
    if not verify_pin(employee.pin_hash, payload.pin):
        rate_limit.record_failure(rl_key)
        raise http_error(403, ErrorCode.FORBIDDEN, "PIN이 올바르지 않습니다.")
    rate_limit.record_success(rl_key)
    set_actor(request, employee)
    token, row = issue_session(db, employee=employee, tab_id=payload.tab_id)
    commit_session_without_realtime(db)
    return OperatorSessionIssued(token=token, expires_at=row.expires_at)


@router.get("/current", response_model=OperatorSessionCurrent)
def get_operator_session(
    authenticated: Annotated[tuple[Employee, OperatorSession], Depends(require_operator_session)],
) -> OperatorSessionCurrent:
    """Return the authenticated actor and tab without re-exposing its token."""
    employee, row = authenticated
    return OperatorSessionCurrent(
        employee_id=employee.employee_id,
        employee_code=employee.employee_code,
        employee_name=employee.name,
        tab_id=row.tab_id,
        expires_at=row.expires_at,
    )


@router.delete("/current", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_operator_session(
    authenticated: Annotated[tuple[Employee, OperatorSession], Depends(require_operator_session)],
    db: Session = Depends(get_db),
) -> None:
    """Revoke only the token explicitly supplied for this tab."""
    _employee, row = authenticated
    revoke_session(row)
    commit_session_without_realtime(db)
