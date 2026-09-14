"""요청 액터(사번) 부착·조회 헬퍼.

PR-A 에서 정의만, PR-B 에서 PIN 검증 지점들이 set_actor 호출.
get_actor_emp 는 액세스 로그·에러 핸들러·audit.record 가 항상 안전하게 사용.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from fastapi import Request
    from app.models import Employee


_UNKNOWN = "-"
_LOG_EMPLOYEE_HEADER = "X-MES-Employee-Code"
_SAFE_EMPLOYEE_CODE_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")


def _clean_log_employee_code(value: str | None) -> str | None:
    if not value:
        return None
    code = value.strip()
    if not _SAFE_EMPLOYEE_CODE_RE.fullmatch(code):
        return None
    return code


def set_actor(request: "Optional[Request]", employee: "Employee") -> None:
    """PIN 검증 성공 직후 호출. request.state.actor_emp 에 사번 박는다.

    request 가 None (테스트/서비스 직접 호출 등) 이면 no-op.
    """
    if request is None:
        return
    code = getattr(employee, "employee_code", None)
    if not code:
        return
    request.state.actor_emp = str(code)


def get_actor_emp(request: "Optional[Request]") -> str:
    """액세스 로그·에러 핸들러용. 부착 안 됐으면 '-' 반환 (운영 분석 시 rid 로 추적)."""
    if request is None:
        return _UNKNOWN
    state_emp = getattr(request.state, "actor_emp", None)
    if state_emp:
        return str(state_emp)
    return _clean_log_employee_code(request.headers.get(_LOG_EMPLOYEE_HEADER)) or _UNKNOWN
