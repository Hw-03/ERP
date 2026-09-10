"""VerifiedActor가 복원한 사번을 요청 감사 context에 연결한다."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from fastapi import Request
    from app.models import Employee


_UNKNOWN = "-"


def set_actor(request: "Optional[Request]", employee: "Employee") -> None:
    """서버가 검증한 직원 사번만 request state에 기록한다."""
    if request is None:
        return
    code = getattr(employee, "employee_code", None)
    if not code:
        return
    request.state.actor_emp = str(code)


def clear_actor(request: "Optional[Request]") -> None:
    """bootstrap capability 요청에서 unrelated operator 귀속을 제거한다."""
    if request is None:
        return
    request.state.actor_emp = None
    request.state.verified_actor = None


def get_actor_emp(request: "Optional[Request]") -> str:
    """액세스 로그·감사용 사번을 반환하고 미검증 요청은 '-'로 남긴다."""
    if request is None:
        return _UNKNOWN
    state_emp = getattr(request.state, "actor_emp", None)
    if state_emp:
        return str(state_emp)
    return _UNKNOWN
