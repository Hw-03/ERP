"""작업자 로그인, 최초 PIN 설정, 복원, 로그아웃 API."""

from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app._actor import clear_actor, set_actor
from app.database import get_db
from app.dependencies.verified_actor import (
    OptionalCurrentActor,
    ensure_actor_employee_code,
    resolve_verified_actor,
)
from app.models import Employee, EmployeeAssignedModel, OperatorSession
from app.routers._errors import ErrorCode, http_error
from app.runtime_identity import current_boot_id
from app.schemas import (
    EmployeeResponse,
    OperatorPinChangeCompleteRequest,
    OperatorSessionLoginRequest,
    OperatorSessionResponse,
)
from app.services import audit, rate_limit
from app.services.operator_session import (
    IssuedSession,
    OPERATOR_SESSION_COOKIE,
    PIN_CHANGE_CHALLENGE_COOKIE,
    SessionStatus,
    _reissue_pin_change_session,
    create_session,
    resolve_session,
    resolve_session_and_lock_employee,
    resolve_session_and_lock_employees,
    revoke_employee_sessions,
    revoke_session,
    utc_now,
)
from app.services.pin_auth import DEFAULT_PIN, hash_pin, validate_pin, verify_pin_and_upgrade


router = APIRouter()
_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "").strip().lower() in {
    "1",
    "true",
    "yes",
}
_DUMMY_PIN_HASH = hash_pin("9999")
MAX_ACTIVE_OPERATOR_SESSIONS_PER_EMPLOYEE = 32


def _set_cookie(response: Response, *, name: str, token: str, max_age: int) -> None:
    response.set_cookie(
        name,
        token,
        max_age=max_age,
        httponly=True,
        samesite="lax",
        secure=_COOKIE_SECURE,
        path="/",
    )


def set_operator_session_cookie(response: Response, issued: IssuedSession) -> None:
    _set_cookie(
        response,
        name=OPERATOR_SESSION_COOKIE,
        token=issued.token,
        max_age=12 * 60 * 60,
    )


def _set_pin_change_cookie(response: Response, issued: IssuedSession) -> None:
    _set_cookie(
        response,
        name=PIN_CHANGE_CHALLENGE_COOKIE,
        token=issued.token,
        max_age=10 * 60,
    )


def _hidden_tabs(employee: Employee) -> list[str]:
    raw = str(getattr(employee, "hidden_sidebar_tabs", "") or "")
    return [value for value in (part.strip() for part in raw.split(",")) if value]


def employee_profile(db: Session, employee: Employee) -> EmployeeResponse:
    slots = [
        row.slot
        for row in (
            db.query(EmployeeAssignedModel)
            .filter(EmployeeAssignedModel.employee_id == employee.employee_id)
            .order_by(EmployeeAssignedModel.priority, EmployeeAssignedModel.slot)
            .all()
        )
    ]
    return EmployeeResponse(
        employee_id=employee.employee_id,
        employee_code=employee.employee_code,
        name=employee.name,
        role=employee.role,
        phone=employee.phone,
        department=employee.department,
        level=employee.level,
        warehouse_role=employee.warehouse_role or "none",
        department_role=employee.department_role or "none",
        display_order=int(employee.display_order),
        is_active=bool(employee.is_active),
        io_enabled=bool(getattr(employee, "io_enabled", True)),
        created_at=employee.created_at,
        updated_at=employee.updated_at,
        pin_last_changed=employee.pin_last_changed,
        pin_is_default=employee.pin_requires_change is not False,
        theme=employee.theme,
        sidebar_mode=employee.sidebar_mode or "hover",
        assigned_model_slots=slots,
        hidden_sidebar_tabs=_hidden_tabs(employee),
        login_notification_popup_enabled=bool(
            getattr(employee, "login_notification_popup_enabled", True)
        ),
    )


def pin_rate_limit_key(request: Request, employee_id: object) -> str:
    """로그인과 본인 PIN 변경이 공유하는 직원·client-IP 실패 key."""
    return rate_limit.credential_key("operator_pin", employee_id, request)


def _login_error() -> Exception:
    return http_error(
        401,
        ErrorCode.INVALID_CREDENTIALS,
        "직원 또는 PIN 정보가 올바르지 않습니다.",
    )


def _raise_pin_rate_limited() -> None:
    raise http_error(
        429,
        ErrorCode.TOO_MANY_REQUESTS,
        "PIN 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    )


def _raise_if_pin_rate_limited(rate_key: str) -> None:
    """직원 행 잠금 대기 전에 이미 닫힌 키를 빠르게 거부한다."""
    if rate_limit.is_blocked(rate_key):
        _raise_pin_rate_limited()


def _ensure_login_target_matches_valid_cookies(
    db: Session,
    request: Request,
    employee_id: uuid.UUID,
) -> dict[str, str]:
    """유효한 origin cookie를 검증하고 재검증할 token을 반환한다."""
    boot_id = current_boot_id()
    guards: dict[str, str] = {}
    for cookie_name, purpose in (
        (OPERATOR_SESSION_COOKIE, "operator"),
        (PIN_CHANGE_CHALLENGE_COOKIE, "pin_change"),
    ):
        token = request.cookies.get(cookie_name)
        resolution = resolve_session(
            db,
            token,
            purpose=purpose,
            boot_id=boot_id,
        )
        if resolution.status != SessionStatus.VALID or resolution.row is None:
            continue
        if resolution.row.employee_id != employee_id:
            raise http_error(
                403,
                ErrorCode.ACTOR_MISMATCH,
                "현재 브라우저 세션과 로그인 대상 작업자가 다릅니다.",
            )
        if token is not None:
            guards[purpose] = token
    return guards


def _revalidate_login_cookie_guards(
    db: Session,
    guards: dict[str, str],
    *,
    employee_id: uuid.UUID,
) -> dict[str, OperatorSession]:
    """Employee 잠금 뒤 기존 capability가 여전히 유효한지 확인한다."""
    locked: dict[str, OperatorSession] = {}
    for purpose, token in guards.items():
        resolution = resolve_session(
            db,
            token,
            purpose=purpose,
            boot_id=current_boot_id(),
            for_update=True,
        )
        if (
            resolution.status != SessionStatus.VALID
            or resolution.row is None
            or resolution.row.employee_id != employee_id
        ):
            raise _session_error(resolution.status)
        locked[purpose] = resolution.row
    return locked


@router.post("", response_model=OperatorSessionResponse)
def create_operator_session(
    payload: OperatorSessionLoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> OperatorSessionResponse | JSONResponse:
    cookie_guards = _ensure_login_target_matches_valid_cookies(
        db,
        request,
        payload.employee_id,
    )
    employee = (
        db.query(Employee)
        .filter(Employee.employee_id == payload.employee_id)
        .with_for_update()
        .first()
    )
    rate_key = (
        pin_rate_limit_key(request, employee.employee_id)
        if employee is not None
        else rate_limit.operator_login_ip_key(request)
    )
    _raise_if_pin_rate_limited(rate_key)
    if not rate_limit.admit_attempt(rate_key):
        _raise_pin_rate_limited()
    try:
        guarded_sessions = _revalidate_login_cookie_guards(
            db,
            cookie_guards,
            employee_id=payload.employee_id,
        )
    except Exception:
        rate_limit.release_attempt(rate_key)
        raise
    kdf_budget_key = rate_limit.operator_login_kdf_ip_key(request)
    if not rate_limit.admit_attempt(
        kdf_budget_key,
        max_failures=rate_limit.OPERATOR_LOGIN_KDF_MAX_ATTEMPTS,
        window_seconds=rate_limit.OPERATOR_RESOURCE_WINDOW_SECONDS,
    ):
        rate_limit.release_attempt(rate_key)
        _raise_pin_rate_limited()
    verification = verify_pin_and_upgrade(
        employee.pin_hash if employee is not None else _DUMMY_PIN_HASH,
        payload.pin,
    )
    if employee is None or not verification.is_valid:
        raise _login_error()
    if not bool(employee.is_active):
        raise http_error(403, ErrorCode.EMPLOYEE_INACTIVE, "비활성 직원입니다.")

    now = utc_now()
    if employee.pin_requires_change is not False or payload.pin == DEFAULT_PIN:
        employee.pin_requires_change = True
        existing_challenge = guarded_sessions.get("pin_change")
        issued = None
        if existing_challenge is None:
            active_challenge = (
                db.query(OperatorSession)
                .filter(
                    OperatorSession.employee_id == employee.employee_id,
                    OperatorSession.purpose == "pin_change",
                    OperatorSession.boot_id == current_boot_id(),
                    OperatorSession.expires_at > now,
                    OperatorSession.revoked_at.is_(None),
                    OperatorSession.consumed_at.is_(None),
                )
                .with_for_update()
                .first()
            )
            if active_challenge is None:
                issued = create_session(
                    db,
                    employee_id=employee.employee_id,
                    purpose="pin_change",
                    boot_id=current_boot_id(),
                    now=now,
                )
            else:
                issued = _reissue_pin_change_session(
                    active_challenge,
                    employee=employee,
                    boot_id=current_boot_id(),
                    now=now,
                )
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        challenge_response = JSONResponse(
            status_code=409,
            content={
                "detail": {
                    "code": ErrorCode.PIN_CHANGE_REQUIRED,
                    "message": "새 PIN을 먼저 설정해야 합니다.",
                }
            },
        )
        if issued is not None:
            _set_pin_change_cookie(challenge_response, issued)
        return challenge_response

    rate_limit.record_success(rate_key)
    existing_operator = guarded_sessions.get("operator")
    issued = None
    issuance_budget_key = None
    issuance_budget_reserved = False
    try:
        if existing_operator is None:
            issuance_budget_key = rate_limit.operator_session_issuance_key(
                request,
                employee.employee_id,
            )
            if not rate_limit.admit_attempt(
                issuance_budget_key,
                max_failures=rate_limit.OPERATOR_SESSION_ISSUANCE_MAX_ATTEMPTS,
                window_seconds=rate_limit.OPERATOR_RESOURCE_WINDOW_SECONDS,
            ):
                _raise_pin_rate_limited()
            issuance_budget_reserved = True
            active_operator_sessions = (
                db.query(OperatorSession)
                .filter(
                    OperatorSession.employee_id == employee.employee_id,
                    OperatorSession.purpose == "operator",
                    OperatorSession.boot_id == current_boot_id(),
                    OperatorSession.expires_at > now,
                    OperatorSession.revoked_at.is_(None),
                    OperatorSession.consumed_at.is_(None),
                )
                .count()
            )
            if active_operator_sessions >= MAX_ACTIVE_OPERATOR_SESSIONS_PER_EMPLOYEE:
                _raise_pin_rate_limited()
        if verification.upgraded_hash is not None:
            employee.pin_hash = verification.upgraded_hash
        if existing_operator is None:
            issued = create_session(
                db,
                employee_id=employee.employee_id,
                purpose="operator",
                boot_id=current_boot_id(),
                now=now,
            )
        if issued is not None:
            expires_at = issued.row.expires_at
        else:
            assert existing_operator is not None
            expires_at = existing_operator.expires_at
        session_response = OperatorSessionResponse(
            employee=employee_profile(db, employee),
            expires_at=expires_at,
            boot_id=current_boot_id(),
        )
        set_actor(request, employee)
        db.commit()
    except Exception:
        clear_actor(request)
        db.rollback()
        if issuance_budget_reserved:
            assert issuance_budget_key is not None
            rate_limit.release_attempt(
                issuance_budget_key,
                window_seconds=rate_limit.OPERATOR_RESOURCE_WINDOW_SECONDS,
            )
        raise
    if issued is not None:
        set_operator_session_cookie(response, issued)
    return session_response


def _session_error(status_value: SessionStatus) -> Exception:
    if status_value == SessionStatus.NOT_FOUND:
        return http_error(401, ErrorCode.AUTH_REQUIRED, "작업자 로그인이 필요합니다.")
    return http_error(401, ErrorCode.SESSION_EXPIRED, "작업자 세션이 만료되었습니다.")


@router.get("", response_model=OperatorSessionResponse)
def get_operator_session(
    request: Request,
    db: Session = Depends(get_db),
) -> OperatorSessionResponse:
    employee, session_row = resolve_verified_actor(db, request, for_update=False)
    return OperatorSessionResponse(
        employee=employee_profile(db, employee),
        expires_at=session_row.expires_at,
        boot_id=current_boot_id(),
    )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_operator_session(
    request: Request,
    response: Response,
    _actor: OptionalCurrentActor,
    db: Session = Depends(get_db),
    pin_change_employee_id: uuid.UUID | None = None,
) -> Response:
    operator_token = request.cookies.get(OPERATOR_SESSION_COOKIE)
    challenge_token = request.cookies.get(PIN_CHANGE_CHALLENGE_COOKIE)
    if pin_change_employee_id is not None:
        clear_actor(request)
        request.state.activity_audit_related_id = str(pin_change_employee_id)
        request.state.activity_audit_target_summary = "PIN 변경 challenge 취소"
        challenge, _employee = resolve_session_and_lock_employee(
            db,
            challenge_token,
            purpose="pin_change",
            boot_id=current_boot_id(),
        )
        if (
            challenge.row is not None
            and challenge.row.employee_id != pin_change_employee_id
        ):
            raise http_error(
                403,
                ErrorCode.ACTOR_MISMATCH,
                "PIN 변경 취소 대상과 challenge 작업자가 다릅니다.",
            )
        if challenge.status == SessionStatus.VALID:
            revoke_session(db, challenge_token)
            audit.record(
                db,
                request=request,
                action="employee.cancel_pin_change_challenge",
                target_type="employee",
                target_id=str(pin_change_employee_id),
                payload_summary="최초 PIN 설정 challenge 취소",
                actor_pin_role="bootstrap",
                actor_employee_code=None,
                bootstrap_employee_id=pin_change_employee_id.hex,
            )
    else:
        if _actor is not None:
            ensure_actor_employee_code(
                _actor,
                request.headers.get("X-MES-Employee-Code"),
            )
        boot_id = current_boot_id()
        operator = resolve_session(
            db,
            operator_token,
            purpose="operator",
            boot_id=boot_id,
        )
        challenge = resolve_session(
            db,
            challenge_token,
            purpose="pin_change",
            boot_id=boot_id,
        )
        operator_employee_id = (
            operator.row.employee_id
            if operator.status == SessionStatus.VALID and operator.row is not None
            else None
        )
        challenge_without_operator = (
            operator_employee_id is None
            and challenge.status == SessionStatus.VALID
            and challenge.row is not None
        )
        if challenge_without_operator:
            challenge, challenge_employee = resolve_session_and_lock_employee(
                db,
                challenge_token,
                purpose="pin_change",
                boot_id=boot_id,
            )
            if challenge.status == SessionStatus.VALID:
                claimed_employee_code = request.headers.get("X-MES-Employee-Code")
                if (
                    challenge_employee is None
                    or not claimed_employee_code
                    or claimed_employee_code.strip()
                    != challenge_employee.employee_code
                ):
                    raise http_error(
                        403,
                        ErrorCode.ACTOR_MISMATCH,
                        "PIN 변경 challenge 작업자와 요청 작업자가 다릅니다.",
                    )
            revoke_session(db, operator_token)
            if challenge.status == SessionStatus.VALID:
                revoke_session(db, challenge_token)
        else:
            revoke_challenge = (
                challenge.status == SessionStatus.VALID
                and challenge.row is not None
                and (
                    operator_employee_id is None
                    or challenge.row.employee_id == operator_employee_id
                )
            )
            lock_ids: set[uuid.UUID] = set()
            if operator_employee_id is not None:
                lock_ids.add(operator_employee_id)
            if revoke_challenge and challenge.row is not None:
                lock_ids.add(challenge.row.employee_id)
            if lock_ids:
                (
                    db.query(Employee)
                    .filter(Employee.employee_id.in_(lock_ids))
                    .order_by(Employee.employee_id.asc())
                    .populate_existing()
                    .with_for_update()
                    .all()
                )
            revoke_session(db, operator_token)
            if revoke_challenge:
                revoke_session(db, challenge_token)
    try:
        db.commit()
    except Exception:
        db.rollback()
        return JSONResponse(
            status_code=503,
            content={
                "detail": {
                    "code": ErrorCode.DB_UNAVAILABLE,
                    "message": "로그아웃을 서버에 반영하지 못했습니다.",
                }
            },
        )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/complete-pin-change", status_code=status.HTTP_204_NO_CONTENT)
def complete_pin_change(
    payload: OperatorPinChangeCompleteRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> Response:
    boot_id = current_boot_id()
    operator_token = request.cookies.get(OPERATOR_SESSION_COOKIE)
    operator_preflight = resolve_session(
        db,
        operator_token,
        purpose="operator",
        boot_id=boot_id,
    )
    additional_employee_ids: tuple[uuid.UUID, ...] = ()
    if (
        operator_preflight.status == SessionStatus.VALID
        and operator_preflight.row is not None
    ):
        additional_employee_ids = (operator_preflight.row.employee_id,)
    resolution, employees = resolve_session_and_lock_employees(
        db,
        request.cookies.get(PIN_CHANGE_CHALLENGE_COOKIE),
        purpose="pin_change",
        boot_id=boot_id,
        employee_ids=additional_employee_ids,
    )
    if resolution.status != SessionStatus.VALID or resolution.row is None:
        raise _session_error(resolution.status)
    if additional_employee_ids:
        resolve_session(
            db,
            operator_token,
            purpose="operator",
            boot_id=boot_id,
            for_update=True,
        )
        if (
            operator_preflight.row is not None
            and operator_preflight.row.employee_id != resolution.row.employee_id
        ):
            raise http_error(
                403,
                ErrorCode.ACTOR_MISMATCH,
                "현재 작업자 세션과 PIN 변경 challenge 작업자가 다릅니다.",
            )
    if resolution.row.employee_id != payload.employee_id:
        raise http_error(
            403,
            ErrorCode.ACTOR_MISMATCH,
            "PIN 변경 대상과 challenge 작업자가 다릅니다.",
        )
    employee = employees.get(resolution.row.employee_id)
    if employee is None or not bool(employee.is_active):
        raise http_error(403, ErrorCode.EMPLOYEE_INACTIVE, "비활성 직원입니다.")
    validate_pin(payload.new_pin)
    if payload.new_pin == DEFAULT_PIN:
        raise http_error(422, ErrorCode.UNPROCESSABLE, "새 PIN은 기본 PIN과 달라야 합니다.")
    now = utc_now()
    try:
        employee.pin_hash = hash_pin(payload.new_pin)
        employee.pin_requires_change = False
        employee.pin_last_changed = now
        employee.updated_at = now
        resolution.row.consumed_at = now
        revoke_employee_sessions(db, employee.employee_id, now=now)
        audit.record(
            db,
            request=request,
            action="employee.complete_pin_change",
            target_type="employee",
            target_id=str(employee.employee_id),
            payload_summary="최초 PIN 설정",
            actor_pin_role="bootstrap",
            actor_employee_code=None,
            bootstrap_employee_id=employee.employee_id.hex,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    rate_limit.record_success(pin_rate_limit_key(request, employee.employee_id))
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
