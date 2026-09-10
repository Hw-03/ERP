"""모든 업무 mutation이 공유하는 서버 검증 작업자 경계."""

from __future__ import annotations

from typing import Annotated, Any, Callable, Sequence, TypeVar
import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.params import Depends as DependsParam
from sqlalchemy.orm import Session

from app._actor import set_actor
from app.database import get_db
from app.models import Employee, OperatorSession
from app.routers._errors import ErrorCode, http_error
from app.runtime_identity import current_boot_id
from app.services.operator_session import (
    OPERATOR_SESSION_COOKIE,
    SessionStatus,
    resolve_session,
    resolve_session_and_lock_employee,
    resolve_session_and_lock_employees,
)


MUTATION_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
_LIFECYCLE_TARGET_ATTRIBUTE = "__dexcowin_lifecycle_target_employee__"
_Endpoint = TypeVar("_Endpoint", bound=Callable[..., Any])


def lifecycle_target_employee(endpoint: _Endpoint) -> _Endpoint:
    """직원 lifecycle route가 actor와 path target을 함께 잠그도록 표시한다."""
    setattr(endpoint, _LIFECYCLE_TARGET_ATTRIBUTE, True)
    return endpoint


def _session_error(status_value: SessionStatus) -> Exception:
    if status_value == SessionStatus.NOT_FOUND:
        return http_error(401, ErrorCode.AUTH_REQUIRED, "작업자 로그인이 필요합니다.")
    return http_error(401, ErrorCode.SESSION_EXPIRED, "작업자 세션이 만료되었습니다.")


def _reject_forged_actor_headers(request: Request, employee: Employee) -> None:
    claimed_codes = (
        request.headers.get("X-MES-Employee-Code"),
        request.headers.get("X-Employee-Code"),
    )
    if any(value and value.strip() != employee.employee_code for value in claimed_codes):
        raise http_error(403, ErrorCode.ACTOR_MISMATCH, "세션 작업자와 요청 작업자가 다릅니다.")
    claimed_id = request.headers.get("X-Actor-Employee-Id")
    if claimed_id and claimed_id.strip().replace("-", "").lower() != employee.employee_id.hex:
        raise http_error(403, ErrorCode.ACTOR_MISMATCH, "세션 작업자와 요청 작업자가 다릅니다.")


def resolve_verified_actor(
    db: Session,
    request: Request,
    *,
    for_update: bool,
    target_employee_id: uuid.UUID | None = None,
) -> tuple[Employee, OperatorSession]:
    """cookie→session row→활성 직원 순으로 검증하고 같은 actor를 request에 고정한다."""
    token = request.cookies.get(OPERATOR_SESSION_COOKIE)
    employee: Employee | None = None
    if for_update and target_employee_id is not None:
        resolution, locked_employees = resolve_session_and_lock_employees(
            db,
            token,
            purpose="operator",
            boot_id=current_boot_id(),
            employee_ids=(target_employee_id,),
        )
        if resolution.row is not None:
            employee = locked_employees.get(resolution.row.employee_id)
        request.state.verified_lifecycle_target_employee = locked_employees.get(
            target_employee_id
        )
        request.state.verified_lifecycle_target_employee_id = target_employee_id
    elif for_update:
        resolution, employee = resolve_session_and_lock_employee(
            db,
            token,
            purpose="operator",
            boot_id=current_boot_id(),
        )
    else:
        resolution = resolve_session(
            db,
            token,
            purpose="operator",
            boot_id=current_boot_id(),
            for_update=False,
        )
    if resolution.status != SessionStatus.VALID or resolution.row is None:
        raise _session_error(resolution.status)
    if employee is None and not for_update:
        employee = db.get(Employee, resolution.row.employee_id)
    if employee is None or not bool(employee.is_active):
        raise http_error(403, ErrorCode.EMPLOYEE_INACTIVE, "비활성 직원입니다.")
    if employee.pin_requires_change is not False:
        raise http_error(401, ErrorCode.SESSION_EXPIRED, "PIN 변경이 필요합니다.")
    set_actor(request, employee)
    request.state.verified_actor = employee
    _reject_forged_actor_headers(request, employee)
    return employee, resolution.row


def require_verified_actor(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> Employee:
    """mutation transaction 시작 시 session·employee row를 잠그는 FastAPI dependency."""
    target_employee_id: uuid.UUID | None = None
    endpoint = request.scope.get("endpoint")
    if getattr(endpoint, _LIFECYCLE_TARGET_ATTRIBUTE, False):
        raw_target = request.path_params.get("employee_id")
        try:
            target_employee_id = uuid.UUID(str(raw_target))
        except (AttributeError, TypeError, ValueError):
            target_employee_id = None
    employee, _ = resolve_verified_actor(
        db,
        request,
        for_update=True,
        target_employee_id=target_employee_id,
    )
    return employee


VerifiedActor = Annotated[Employee, Depends(require_verified_actor)]


def require_current_actor(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> Employee:
    """조회 경계에서 row lock 없이 동일한 DB session actor를 검증한다."""
    employee, _ = resolve_verified_actor(db, request, for_update=False)
    return employee


CurrentActor = Annotated[Employee, Depends(require_current_actor)]


def optional_current_actor(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> Employee | None:
    """system-exception 요청은 유효한 cookie가 있을 때만 감사 actor를 부착한다."""
    token = request.cookies.get(OPERATOR_SESSION_COOKIE)
    if not token:
        return None
    resolution = resolve_session(
        db,
        token,
        purpose="operator",
        boot_id=current_boot_id(),
        for_update=False,
    )
    if resolution.status != SessionStatus.VALID or resolution.row is None:
        return None
    employee = db.get(Employee, resolution.row.employee_id)
    if (
        employee is None
        or not bool(employee.is_active)
        or employee.pin_requires_change is not False
    ):
        return None
    set_actor(request, employee)
    request.state.verified_actor = employee
    return employee


OptionalCurrentActor = Annotated[Employee | None, Depends(optional_current_actor)]


def ensure_actor_employee_id(actor: Employee, claimed_employee_id: object | None) -> None:
    """클라이언트가 보낸 직원 ID는 검증된 session actor와 같을 때만 허용한다."""
    if claimed_employee_id is None:
        return
    try:
        matches = str(claimed_employee_id).lower() == str(actor.employee_id).lower()
    except (AttributeError, TypeError, ValueError):
        matches = False
    if not matches:
        raise http_error(403, ErrorCode.ACTOR_MISMATCH, "세션 작업자와 요청 작업자가 다릅니다.")


def ensure_actor_employee_code(actor: Employee, claimed_employee_code: str | None) -> None:
    """클라이언트의 직원 코드는 검증용 claim일 뿐 정본 actor로 사용하지 않는다."""
    if claimed_employee_code and claimed_employee_code.strip() != actor.employee_code:
        raise http_error(403, ErrorCode.ACTOR_MISMATCH, "세션 작업자와 요청 작업자가 다릅니다.")


def ensure_actor_employee_name(actor: Employee, claimed_employee_name: str | None) -> None:
    """legacy 표시명 claim이 session actor와 다르면 쓰기 전에 거부한다."""
    if claimed_employee_name and claimed_employee_name.strip() != actor.name:
        raise http_error(403, ErrorCode.ACTOR_MISMATCH, "세션 작업자와 요청 작업자가 다릅니다.")


class VerifiedActorRouter(APIRouter):
    """등록 시점에 모든 HTTP mutation에 공통 actor dependency를 부착한다."""

    def add_api_route(
        self,
        path: str,
        endpoint: Callable[..., Any],
        *,
        methods: set[str] | list[str] | None = None,
        dependencies: Sequence[DependsParam] | None = None,
        **kwargs: Any,
    ) -> None:
        route_dependencies = list(dependencies or ())
        if MUTATION_METHODS.intersection(methods or ()):
            route_dependencies.insert(0, Depends(require_verified_actor))
        super().add_api_route(
            path,
            endpoint,
            methods=methods,
            dependencies=route_dependencies,
            **kwargs,
        )
