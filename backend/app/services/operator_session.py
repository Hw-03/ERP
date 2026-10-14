"""Issue and validate per-tab operator credentials for future stocktake APIs."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import Employee, OperatorSession


SESSION_TTL = timedelta(hours=12)


def utc_now_naive() -> datetime:
    """Match the existing UTC-naive timestamps used by the backend models."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def issue_session(db: Session, *, employee: Employee, tab_id: str) -> tuple[str, OperatorSession]:
    """Persist only a hash; return the high-entropy bearer token once."""
    token = secrets.token_urlsafe(32)
    now = utc_now_naive()
    row = OperatorSession(
        token_hash=hashlib.sha256(token.encode("ascii")).hexdigest(),
        employee_id=employee.employee_id,
        tab_id=tab_id,
        pin_version=employee.pin_version,
        created_at=now,
        expires_at=now + SESSION_TTL,
    )
    db.add(row)
    db.flush()
    return token, row


def resolve_session(db: Session, token: str | None) -> tuple[Employee, OperatorSession] | None:
    """Reject revoked, expired, inactive, or PIN-obsolete credentials."""
    if not token:
        return None
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    row = db.query(OperatorSession).filter(OperatorSession.token_hash == digest).first()
    if row is None or row.revoked_at is not None or row.expires_at <= utc_now_naive():
        return None
    employee = db.get(Employee, row.employee_id)
    if employee is None or not bool(employee.is_active) or row.pin_version != employee.pin_version:
        return None
    return employee, row


def revoke_session(row: OperatorSession) -> None:
    """Revoke exactly this token, leaving other tabs independently usable."""
    row.revoked_at = utc_now_naive()


def commit_session_without_realtime(db: Session) -> None:
    """Persist authentication state without announcing a stock/business revision."""
    from app.services.realtime import suppress_realtime_revision

    with suppress_realtime_revision(db):
        db.commit()
