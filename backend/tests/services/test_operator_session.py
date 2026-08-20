"""IC-01 DB-backed opaque session service 계약."""

from __future__ import annotations

from datetime import datetime, timedelta
import importlib
from types import SimpleNamespace

from app.models import DepartmentEnum, Employee, EmployeeLevelEnum, OperatorSession
from app.services.pin_auth import hash_pin


try:
    service = importlib.import_module("app.services.operator_session")
except ModuleNotFoundError:
    service = None


def _service():
    assert service is not None
    return service


def _employee(db_session, *, code: str = "SESSION-01") -> Employee:
    employee = Employee(
        employee_code=code,
        name="세션 작업자",
        role="작업자",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def test_operator_session_stores_only_digest_and_expires_after_twelve_hours(
    db_session,
) -> None:
    session_service = _service()
    create_session = getattr(session_service, "create_session", None)
    assert callable(create_session)
    employee = _employee(db_session)
    now = datetime(2026, 8, 19, 6, 0, 0)

    issued = create_session(
        db_session,
        employee_id=employee.employee_id,
        purpose="operator",
        boot_id="boot-a",
        now=now,
    )
    db_session.flush()

    row = db_session.query(OperatorSession).one()
    assert issued.token not in row.token_hash
    assert row.token_hash == session_service.hash_session_token(issued.token)
    assert row.issued_at == now
    assert row.expires_at == now + timedelta(hours=12)
    assert row.boot_id == "boot-a"


def test_resolve_session_rejects_expiry_revoke_consumption_and_boot_change(
    db_session,
) -> None:
    employee = _employee(db_session, code="SESSION-02")
    session_service = _service()
    now = datetime(2026, 8, 19, 7, 0, 0)
    issued = session_service.create_session(
        db_session,
        employee_id=employee.employee_id,
        purpose="operator",
        boot_id="boot-a",
        now=now,
    )
    db_session.flush()

    assert session_service.resolve_session(
        db_session,
        issued.token,
        purpose="operator",
        boot_id="boot-a",
        now=now + timedelta(hours=11, minutes=59),
    ).status == session_service.SessionStatus.VALID
    assert session_service.resolve_session(
        db_session,
        issued.token,
        purpose="operator",
        boot_id="boot-b",
        now=now,
    ).status == session_service.SessionStatus.BOOT_MISMATCH
    assert session_service.resolve_session(
        db_session,
        issued.token,
        purpose="operator",
        boot_id="boot-a",
        now=now + timedelta(hours=12),
    ).status == session_service.SessionStatus.EXPIRED

    issued.row.revoked_at = now + timedelta(minutes=1)
    assert session_service.resolve_session(
        db_session,
        issued.token,
        purpose="operator",
        boot_id="boot-a",
        now=now + timedelta(minutes=2),
    ).status == session_service.SessionStatus.REVOKED
    issued.row.revoked_at = None
    issued.row.consumed_at = now + timedelta(minutes=1)
    assert session_service.resolve_session(
        db_session,
        issued.token,
        purpose="operator",
        boot_id="boot-a",
        now=now + timedelta(minutes=2),
    ).status == session_service.SessionStatus.CONSUMED


def test_employee_session_revocation_covers_operator_and_pin_change(db_session) -> None:
    employee = _employee(db_session, code="SESSION-03")
    session_service = _service()
    now = datetime(2026, 8, 19, 8, 0, 0)
    session_service.create_session(
        db_session,
        employee_id=employee.employee_id,
        purpose="operator",
        boot_id="boot-a",
        now=now,
    )
    session_service.create_session(
        db_session,
        employee_id=employee.employee_id,
        purpose="pin_change",
        boot_id="boot-a",
        now=now,
    )
    db_session.flush()

    revoked = session_service.revoke_employee_sessions(
        db_session,
        employee.employee_id,
        now=now + timedelta(minutes=1),
    )
    rows = db_session.query(OperatorSession).all()

    assert revoked == 2
    assert {row.revoked_at for row in rows} == {now + timedelta(minutes=1)}


def test_pin_change_challenge_has_ten_minute_absolute_expiry(db_session) -> None:
    employee = _employee(db_session, code="SESSION-04")
    session_service = _service()
    now = datetime(2026, 8, 19, 9, 0, 0)

    issued = session_service.create_session(
        db_session,
        employee_id=employee.employee_id,
        purpose="pin_change",
        boot_id="boot-a",
        now=now,
    )

    assert issued.row.expires_at == now + timedelta(minutes=10)


def test_malformed_unicode_cookie_fails_as_unknown_session(db_session) -> None:
    session_service = _service()

    resolved = session_service.resolve_session(
        db_session,
        "잘못된-cookie",
        purpose="operator",
        boot_id="boot-a",
    )

    assert resolved.status == session_service.SessionStatus.NOT_FOUND


def test_mutating_resolution_locks_employee_before_session_recheck(monkeypatch) -> None:
    session_service = _service()
    employee = Employee(
        employee_code="SESSION-LOCK-ORDER",
        name="잠금 순서 작업자",
        role="작업자",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    calls: list[str] = []
    session_row = SimpleNamespace(employee_id=employee.employee_id)

    def _resolve_session(*_args, for_update: bool, **_kwargs):
        calls.append("session_lock" if for_update else "session_preflight")
        status = (
            session_service.SessionStatus.REVOKED
            if for_update
            else session_service.SessionStatus.VALID
        )
        return session_service.SessionResolution(status, session_row)

    class _EmployeeQuery:
        def filter(self, *_criteria):
            return self

        def order_by(self, *_criteria):
            calls.append("employee_order")
            return self

        def populate_existing(self):
            calls.append("employee_refresh")
            return self

        def with_for_update(self):
            calls.append("employee_lock")
            return self

        def all(self):
            return [employee]

    fake_db = SimpleNamespace(query=lambda _model: _EmployeeQuery())
    monkeypatch.setattr(session_service, "resolve_session", _resolve_session)

    resolution, locked_employee = session_service.resolve_session_and_lock_employee(
        fake_db,
        "opaque-token",
        purpose="operator",
        boot_id="boot-a",
    )

    assert calls == [
        "session_preflight",
        "employee_order",
        "employee_refresh",
        "employee_lock",
        "session_lock",
    ]
    assert resolution.status == session_service.SessionStatus.REVOKED
    assert locked_employee is employee
