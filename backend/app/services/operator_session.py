"""DB-backed opaque 작업자 세션의 저장·검증·폐기."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
import hashlib
import secrets
from typing import Iterable
import uuid

from sqlalchemy.orm import Session

from app.models import Employee, OperatorSession


OPERATOR_SESSION_TTL = timedelta(hours=12)
PIN_CHANGE_SESSION_TTL = timedelta(minutes=10)
SESSION_TOKEN_BYTES = 32
OPERATOR_SESSION_COOKIE = "dexcowin_operator_session"
PIN_CHANGE_CHALLENGE_COOKIE = "dexcowin_pin_change_challenge"


class SessionStatus(str, Enum):
    VALID = "valid"
    NOT_FOUND = "not_found"
    WRONG_PURPOSE = "wrong_purpose"
    REVOKED = "revoked"
    CONSUMED = "consumed"
    EXPIRED = "expired"
    BOOT_MISMATCH = "boot_mismatch"


@dataclass(frozen=True)
class IssuedSession:
    token: str
    row: OperatorSession


@dataclass(frozen=True)
class SessionResolution:
    status: SessionStatus
    row: OperatorSession | None = None


def utc_now() -> datetime:
    """SQLAlchemy의 기존 naive UTC 저장 계약에 맞춘 현재 시각."""
    return datetime.utcnow()


def hash_session_token(token: str) -> str:
    """DB·로그에는 원문 대신 고정 길이 digest만 남긴다."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(
    db: Session,
    *,
    employee_id: uuid.UUID,
    purpose: str,
    boot_id: str,
    now: datetime | None = None,
) -> IssuedSession:
    """commit하지 않은 새 세션 행과 브라우저에만 전달할 원문 token을 만든다."""
    if purpose not in {"operator", "pin_change"}:
        raise ValueError(f"unsupported operator session purpose: {purpose}")
    issued_at = now or utc_now()
    ttl = OPERATOR_SESSION_TTL if purpose == "operator" else PIN_CHANGE_SESSION_TTL
    token = secrets.token_urlsafe(SESSION_TOKEN_BYTES)
    row = OperatorSession(
        token_hash=hash_session_token(token),
        employee_id=employee_id,
        purpose=purpose,
        issued_at=issued_at,
        expires_at=issued_at + ttl,
        boot_id=boot_id,
    )
    db.add(row)
    return IssuedSession(token=token, row=row)


def _reissue_pin_change_session(
    row: OperatorSession,
    *,
    employee: Employee,
    boot_id: str,
    now: datetime | None = None,
) -> IssuedSession:
    """유효 challenge 행을 보존한 채 원문 token과 절대 만료만 회전한다."""
    issued_at = now or utc_now()
    if (
        not isinstance(employee, Employee)
        or row.employee_id != employee.employee_id
        or row.purpose != "pin_change"
        or row.revoked_at is not None
        or row.consumed_at is not None
        or row.expires_at <= issued_at
    ):
        raise ValueError("only the employee's active PIN-change challenge can be reissued")
    token = secrets.token_urlsafe(SESSION_TOKEN_BYTES)
    row.token_hash = hash_session_token(token)
    row.issued_at = issued_at
    row.expires_at = issued_at + PIN_CHANGE_SESSION_TTL
    row.boot_id = boot_id
    return IssuedSession(token=token, row=row)


def resolve_session(
    db: Session,
    token: str | None,
    *,
    purpose: str,
    boot_id: str,
    now: datetime | None = None,
    for_update: bool = False,
) -> SessionResolution:
    """세션 상태를 한 번의 DB 조회 뒤 결정하며 만료를 연장하지 않는다."""
    if not token:
        return SessionResolution(SessionStatus.NOT_FOUND)
    query = db.query(OperatorSession).filter(
        OperatorSession.token_hash == hash_session_token(token)
    )
    if for_update:
        query = query.populate_existing().with_for_update()
    row = query.first()
    if row is None:
        return SessionResolution(SessionStatus.NOT_FOUND)
    if row.purpose != purpose:
        return SessionResolution(SessionStatus.WRONG_PURPOSE, row)
    if row.revoked_at is not None:
        return SessionResolution(SessionStatus.REVOKED, row)
    if row.consumed_at is not None:
        return SessionResolution(SessionStatus.CONSUMED, row)
    checked_at = now or utc_now()
    if checked_at >= row.expires_at:
        return SessionResolution(SessionStatus.EXPIRED, row)
    if row.boot_id != boot_id:
        return SessionResolution(SessionStatus.BOOT_MISMATCH, row)
    return SessionResolution(SessionStatus.VALID, row)


def resolve_session_and_lock_employee(
    db: Session,
    token: str | None,
    *,
    purpose: str,
    boot_id: str,
    now: datetime | None = None,
) -> tuple[SessionResolution, Employee | None]:
    """Employee→session 순서로 잠근 뒤 세션 상태를 다시 검증한다.

    직원 상태 변경은 Employee를 먼저 잠근 뒤 그 직원의 세션을 폐기한다. mutation
    인증도 같은 순서를 사용해야 PostgreSQL에서 서로 교착하지 않으며, 잠금 대기
    중 일어난 revoke·expiry·boot 변경은 두 번째 세션 조회에서 fail-closed 된다.
    """
    resolution, employees = resolve_session_and_lock_employees(
        db,
        token,
        purpose=purpose,
        boot_id=boot_id,
        now=now,
    )
    employee = None
    if resolution.row is not None:
        employee = employees.get(resolution.row.employee_id)
    return resolution, employee


def resolve_session_and_lock_employees(
    db: Session,
    token: str | None,
    *,
    purpose: str,
    boot_id: str,
    employee_ids: Iterable[uuid.UUID] = (),
    now: datetime | None = None,
) -> tuple[SessionResolution, dict[uuid.UUID, Employee]]:
    """actor와 추가 직원들을 UUID 순으로 잠근 뒤 session을 재검증한다.

    직원 lifecycle 요청은 actor A와 대상 B를 함께 잠근다. 모든 요청이 같은 정렬
    순서를 사용하므로 A→B와 B→A가 동시에 들어와도 PostgreSQL row-lock 순환이
    생기지 않는다. session은 Employee 잠금 뒤 다시 조회해 revoke 경합도 닫는다.
    """
    preflight = resolve_session(
        db,
        token,
        purpose=purpose,
        boot_id=boot_id,
        now=now,
        for_update=False,
    )
    if preflight.status != SessionStatus.VALID or preflight.row is None:
        return preflight, {}

    lock_ids = set(employee_ids)
    lock_ids.add(preflight.row.employee_id)
    employees = (
        db.query(Employee)
        .filter(Employee.employee_id.in_(lock_ids))
        .order_by(Employee.employee_id.asc())
        .populate_existing()
        .with_for_update()
        .all()
    )
    locked = resolve_session(
        db,
        token,
        purpose=purpose,
        boot_id=boot_id,
        now=now,
        for_update=True,
    )
    if locked.row is not None and locked.row.employee_id != preflight.row.employee_id:
        return SessionResolution(SessionStatus.NOT_FOUND), {}
    return locked, {employee.employee_id: employee for employee in employees}


def revoke_employee_sessions(
    db: Session,
    employee_id: uuid.UUID,
    *,
    now: datetime | None = None,
) -> int:
    """credential·활성 상태 변경 시 목적과 무관하게 미폐기 세션을 모두 닫는다."""
    revoked_at = now or utc_now()
    return int(
        db.query(OperatorSession)
        .filter(
            OperatorSession.employee_id == employee_id,
            OperatorSession.revoked_at.is_(None),
        )
        .update({OperatorSession.revoked_at: revoked_at}, synchronize_session="fetch")
    )


def revoke_session(
    db: Session,
    token: str | None,
    *,
    now: datetime | None = None,
) -> int:
    """원문 token으로 특정 활성 세션만 idempotent하게 폐기한다."""
    if not token:
        return 0
    revoked_at = now or utc_now()
    return int(
        db.query(OperatorSession)
        .filter(
            OperatorSession.token_hash == hash_session_token(token),
            OperatorSession.revoked_at.is_(None),
        )
        .update({OperatorSession.revoked_at: revoked_at}, synchronize_session="fetch")
    )
