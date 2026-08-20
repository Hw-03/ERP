"""실제 PostgreSQL에서 operator session 폐기와 mutation row lock을 검증한다."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import hashlib
import os
from threading import Barrier, Event, get_ident
import uuid

import pytest
from fastapi import HTTPException, Request, Response
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.models import (
    AdminAuditLog,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    OperatorSession,
    SystemSetting,
)
from app.dependencies.verified_actor import require_verified_actor
from app.routers import employees as employees_router
from app.routers import operator_sessions
from app.routers.settings import (
    _hash_admin_pin,
    _matches_admin_pin,
    ensure_admin_pin,
    require_admin,
)
from app.runtime_identity import current_boot_id
from app.schemas import (
    EmployeePinChangeRequest,
    EmployeeUpdate,
    OperatorPinChangeCompleteRequest,
    OperatorSessionLoginRequest,
)
from app.services import rate_limit
from app.services.operator_session import (
    OPERATOR_SESSION_COOKIE,
    PIN_CHANGE_CHALLENGE_COOKIE,
    SessionStatus,
    create_session,
    resolve_session,
    resolve_session_and_lock_employee,
    resolve_session_and_lock_employees,
    revoke_session,
)
from app.services.pin_auth import hash_pin, verify_pin_and_upgrade


POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
POSTGRES_ACK = os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK", "")


pytestmark = pytest.mark.skipif(
    not POSTGRES_URL or POSTGRES_ACK != "ALLOW_TEST_DB_MUTATION",
    reason="승인된 전용 TEST_POSTGRES_URL에서만 실제 PostgreSQL 경합을 실행",
)


def _employee() -> Employee:
    suffix = uuid.uuid4().hex[:10]
    return Employee(
        employee_id=uuid.uuid4(),
        employee_code=f"PG-SESSION-{suffix}",
        name="PostgreSQL session actor",
        role="작업자",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )


def _request(
    path: str,
    *,
    method: str,
    cookies: dict[str, str],
) -> Request:
    cookie_value = "; ".join(f"{name}={value}" for name, value in cookies.items())
    headers = [(b"cookie", cookie_value.encode("ascii"))] if cookie_value else []
    return Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": path,
            "raw_path": path.encode("ascii"),
            "query_string": b"",
            "headers": headers,
            "client": ("postgres-race", 50000),
            "server": ("testserver", 80),
        }
    )


def test_postgres_foreign_operator_preflight_stays_fail_closed_after_rotation(
    monkeypatch,
) -> None:
    engine = create_engine(POSTGRES_URL, poolclass=NullPool)
    make_session = sessionmaker(bind=engine, expire_on_commit=False)
    employee_a = _employee()
    employee_a.pin_hash = hash_pin("0000")
    employee_a.pin_requires_change = True
    employee_b = _employee()
    employee_a_id = employee_a.employee_id
    employee_b_id = employee_b.employee_id
    boot_id = current_boot_id()

    try:
        with make_session() as db:
            db.add_all((employee_a, employee_b))
            db.flush()
            challenge_a = create_session(
                db,
                employee_id=employee_a_id,
                purpose="pin_change",
                boot_id=boot_id,
            )
            operator_b = create_session(
                db,
                employee_id=employee_b_id,
                purpose="operator",
                boot_id=boot_id,
            )
            db.commit()

        preflight_reached = Event()
        rotation_complete = Event()
        complete_thread_id: list[int] = []
        real_resolve = operator_sessions.resolve_session

        def _pause_after_foreign_preflight(db, token, **kwargs):
            resolution = real_resolve(db, token, **kwargs)
            if (
                complete_thread_id
                and get_ident() == complete_thread_id[0]
                and token == operator_b.token
                and kwargs.get("purpose") == "operator"
                and kwargs.get("for_update") is not True
                and not preflight_reached.is_set()
            ):
                preflight_reached.set()
                assert rotation_complete.wait(10)
            return resolution

        monkeypatch.setattr(
            operator_sessions,
            "resolve_session",
            _pause_after_foreign_preflight,
        )
        rate_limit.reset_all()

        def complete_a() -> tuple[int, str | None]:
            complete_thread_id.append(get_ident())
            with make_session() as db:
                try:
                    operator_sessions.complete_pin_change(
                        OperatorPinChangeCompleteRequest(
                            employee_id=employee_a_id,
                            new_pin="1357",
                        ),
                        _request(
                            "/api/operator-session/complete-pin-change",
                            method="POST",
                            cookies={
                                PIN_CHANGE_CHALLENGE_COOKIE: challenge_a.token,
                                OPERATOR_SESSION_COOKIE: operator_b.token,
                            },
                        ),
                        Response(),
                        db,
                    )
                except HTTPException as exc:
                    detail = exc.detail if isinstance(exc.detail, dict) else {}
                    return exc.status_code, detail.get("code")
                return 204, None

        def rotate_b_after_preflight() -> None:
            assert preflight_reached.wait(10)
            try:
                with make_session() as db:
                    locked_b = db.get(Employee, employee_b_id)
                    assert locked_b is not None
                    result = operator_sessions.delete_operator_session(
                        _request(
                            "/api/operator-session",
                            method="DELETE",
                            cookies={OPERATOR_SESSION_COOKIE: operator_b.token},
                        ),
                        Response(),
                        locked_b,
                        db,
                    )
                    assert result.status_code == 204
                with make_session() as db:
                    result = operator_sessions.create_operator_session(
                        OperatorSessionLoginRequest(
                            employee_id=employee_b_id,
                            pin="2468",
                        ),
                        _request(
                            "/api/operator-session",
                            method="POST",
                            cookies={OPERATOR_SESSION_COOKIE: operator_b.token},
                        ),
                        Response(),
                        db,
                    )
                    assert not isinstance(result, Response)
            finally:
                rotation_complete.set()

        with ThreadPoolExecutor(max_workers=2) as pool:
            complete_future = pool.submit(complete_a)
            rotate_future = pool.submit(rotate_b_after_preflight)
            rotate_future.result(timeout=20)
            assert complete_future.result(timeout=20) == (403, "ACTOR_MISMATCH")

        with make_session() as db:
            stored_a = db.get(Employee, employee_a_id)
            assert stored_a is not None
            assert stored_a.pin_requires_change is True
            assert verify_pin_and_upgrade(stored_a.pin_hash, "0000").is_valid
            challenge_row = db.get(OperatorSession, challenge_a.row.session_id)
            assert challenge_row is not None
            assert challenge_row.revoked_at is None
            assert challenge_row.consumed_at is None
            assert db.query(AdminAuditLog).filter_by(
                action="employee.complete_pin_change",
                target_id=str(employee_a_id),
            ).count() == 0
            assert db.get(OperatorSession, operator_b.row.session_id).revoked_at is not None
            assert db.query(OperatorSession).filter_by(
                employee_id=employee_b_id,
                purpose="operator",
                revoked_at=None,
            ).count() == 1
    finally:
        with make_session() as cleanup:
            cleanup.query(Employee).filter(
                Employee.employee_id.in_((employee_a_id, employee_b_id))
            ).delete(synchronize_session=False)
            cleanup.commit()
        engine.dispose()


def test_postgres_same_cookie_login_then_logout_leaves_no_reissued_session(
    monkeypatch,
) -> None:
    engine = create_engine(POSTGRES_URL, poolclass=NullPool)
    make_session = sessionmaker(bind=engine, expire_on_commit=False)
    employee = _employee()
    employee_id = employee.employee_id
    boot_id = current_boot_id()
    listener_attached = False

    try:
        with make_session() as db:
            db.add(employee)
            db.flush()
            issued = create_session(
                db,
                employee_id=employee_id,
                purpose="operator",
                boot_id=boot_id,
            )
            db.commit()

        login_holds_employee = Event()
        logout_attempted_employee_lock = Event()
        logout_thread_id: list[int] = []
        real_revalidate = operator_sessions._revalidate_login_cookie_guards

        def _pause_login_after_employee_lock(*args, **kwargs):
            login_holds_employee.set()
            assert logout_attempted_employee_lock.wait(10)
            return real_revalidate(*args, **kwargs)

        def _observe_logout_employee_lock(
            _conn,
            _cursor,
            statement,
            _parameters,
            _context,
            _executemany,
        ) -> None:
            if (
                logout_thread_id
                and get_ident() == logout_thread_id[0]
                and "FROM employees" in statement
                and "FOR UPDATE" in statement
            ):
                logout_attempted_employee_lock.set()

        monkeypatch.setattr(
            operator_sessions,
            "_revalidate_login_cookie_guards",
            _pause_login_after_employee_lock,
        )
        event.listen(engine, "before_cursor_execute", _observe_logout_employee_lock)
        listener_attached = True
        rate_limit.reset_all()

        def relogin() -> int:
            with make_session() as db:
                result = operator_sessions.create_operator_session(
                    OperatorSessionLoginRequest(employee_id=employee_id, pin="2468"),
                    _request(
                        "/api/operator-session",
                        method="POST",
                        cookies={OPERATOR_SESSION_COOKIE: issued.token},
                    ),
                    Response(),
                    db,
                )
                return 409 if isinstance(result, Response) else 200

        def logout() -> int:
            assert login_holds_employee.wait(10)
            logout_thread_id.append(get_ident())
            with make_session() as db:
                actor = db.get(Employee, employee_id)
                assert actor is not None
                return operator_sessions.delete_operator_session(
                    _request(
                        "/api/operator-session",
                        method="DELETE",
                        cookies={OPERATOR_SESSION_COOKIE: issued.token},
                    ),
                    Response(),
                    actor,
                    db,
                ).status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            login_future = pool.submit(relogin)
            logout_future = pool.submit(logout)
            assert login_future.result(timeout=20) == 200
            assert logout_future.result(timeout=20) == 204

        with make_session() as db:
            rows = db.query(OperatorSession).filter_by(employee_id=employee_id).all()
            assert len(rows) == 1
            assert rows[0].revoked_at is not None
    finally:
        if listener_attached:
            event.remove(engine, "before_cursor_execute", _observe_logout_employee_lock)
        with make_session() as cleanup:
            cleanup.query(Employee).filter(Employee.employee_id == employee_id).delete()
            cleanup.commit()
        engine.dispose()


def test_postgres_same_cookie_logout_then_login_fails_after_revalidation(
    monkeypatch,
) -> None:
    engine = create_engine(POSTGRES_URL, poolclass=NullPool)
    make_session = sessionmaker(bind=engine, expire_on_commit=False)
    employee = _employee()
    employee_id = employee.employee_id
    boot_id = current_boot_id()
    listener_attached = False

    try:
        with make_session() as db:
            db.add(employee)
            db.flush()
            issued = create_session(
                db,
                employee_id=employee_id,
                purpose="operator",
                boot_id=boot_id,
            )
            db.commit()

        logout_holds_employee = Event()
        login_attempted_employee_lock = Event()
        logout_thread_id: list[int] = []
        login_thread_id: list[int] = []
        real_revoke = operator_sessions.revoke_session

        def _pause_logout_before_revoke(db, token, **kwargs):
            if (
                logout_thread_id
                and get_ident() == logout_thread_id[0]
                and token == issued.token
            ):
                logout_holds_employee.set()
                assert login_attempted_employee_lock.wait(10)
            return real_revoke(db, token, **kwargs)

        def _observe_login_employee_lock(
            _conn,
            _cursor,
            statement,
            _parameters,
            _context,
            _executemany,
        ) -> None:
            if (
                login_thread_id
                and get_ident() == login_thread_id[0]
                and "FROM employees" in statement
                and "FOR UPDATE" in statement
            ):
                login_attempted_employee_lock.set()

        monkeypatch.setattr(operator_sessions, "revoke_session", _pause_logout_before_revoke)
        event.listen(engine, "before_cursor_execute", _observe_login_employee_lock)
        listener_attached = True
        rate_limit.reset_all()

        def logout() -> int:
            logout_thread_id.append(get_ident())
            with make_session() as db:
                actor = db.get(Employee, employee_id)
                assert actor is not None
                return operator_sessions.delete_operator_session(
                    _request(
                        "/api/operator-session",
                        method="DELETE",
                        cookies={OPERATOR_SESSION_COOKIE: issued.token},
                    ),
                    Response(),
                    actor,
                    db,
                ).status_code

        def relogin() -> tuple[int, str | None]:
            assert logout_holds_employee.wait(10)
            login_thread_id.append(get_ident())
            with make_session() as db:
                try:
                    operator_sessions.create_operator_session(
                        OperatorSessionLoginRequest(employee_id=employee_id, pin="2468"),
                        _request(
                            "/api/operator-session",
                            method="POST",
                            cookies={OPERATOR_SESSION_COOKIE: issued.token},
                        ),
                        Response(),
                        db,
                    )
                except HTTPException as exc:
                    detail = exc.detail if isinstance(exc.detail, dict) else {}
                    return exc.status_code, detail.get("code")
                return 200, None

        with ThreadPoolExecutor(max_workers=2) as pool:
            logout_future = pool.submit(logout)
            login_future = pool.submit(relogin)
            assert logout_future.result(timeout=20) == 204
            assert login_future.result(timeout=20) == (401, "SESSION_EXPIRED")

        with make_session() as db:
            rows = db.query(OperatorSession).filter_by(employee_id=employee_id).all()
            assert len(rows) == 1
            assert rows[0].revoked_at is not None
    finally:
        if listener_attached:
            event.remove(engine, "before_cursor_execute", _observe_login_employee_lock)
        with make_session() as cleanup:
            cleanup.query(Employee).filter(Employee.employee_id == employee_id).delete()
            cleanup.commit()
        engine.dispose()


def test_postgres_operator_session_revoke_and_mutation_are_linearized() -> None:
    engine = create_engine(POSTGRES_URL, poolclass=NullPool)
    make_session = sessionmaker(bind=engine, expire_on_commit=False)
    employee = _employee()
    employee_id = employee.employee_id
    boot_id = current_boot_id()

    try:
        with make_session() as db:
            db.add(employee)
            db.flush()
            first = create_session(
                db,
                employee_id=employee_id,
                purpose="operator",
                boot_id=boot_id,
            )
            db.commit()

        mutation_locked = Event()
        revoker_observed_lock = Event()
        mutation_committed = Event()

        def mutation_before_revoke() -> SessionStatus:
            with make_session() as db:
                resolution, actor = resolve_session_and_lock_employee(
                    db,
                    first.token,
                    purpose="operator",
                    boot_id=boot_id,
                )
                assert resolution.status == SessionStatus.VALID
                assert actor is not None
                mutation_locked.set()
                assert revoker_observed_lock.wait(5)
                actor.theme = "dark"
                db.commit()
                mutation_committed.set()
                return resolution.status

        def revoke_after_mutation_lock() -> int:
            assert mutation_locked.wait(5)
            with make_session() as db:
                db.execute(text("SET LOCAL lock_timeout = '250ms'"))
                with pytest.raises(DBAPIError):
                    revoke_session(db, first.token)
                db.rollback()
                revoker_observed_lock.set()
                assert mutation_committed.wait(5)
                revoked = revoke_session(db, first.token)
                db.commit()
                return revoked

        with ThreadPoolExecutor(max_workers=2) as pool:
            mutation_future = pool.submit(mutation_before_revoke)
            revoke_future = pool.submit(revoke_after_mutation_lock)
            assert mutation_future.result(timeout=10) == SessionStatus.VALID
            assert revoke_future.result(timeout=10) == 1

        with make_session() as db:
            assert db.get(Employee, employee_id).theme == "dark"
            assert resolve_session(
                db,
                first.token,
                purpose="operator",
                boot_id=boot_id,
                for_update=True,
            ).status == SessionStatus.REVOKED
            second = create_session(
                db,
                employee_id=employee_id,
                purpose="operator",
                boot_id=boot_id,
            )
            db.commit()

        revoke_locked = Event()
        mutation_started = Event()

        def revoke_before_mutation() -> None:
            with make_session() as db:
                row = (
                    db.query(OperatorSession)
                    .filter(OperatorSession.token_hash == second.row.token_hash)
                    .with_for_update()
                    .one()
                )
                row.revoked_at = datetime.utcnow()
                db.flush()
                revoke_locked.set()
                assert mutation_started.wait(5)
                db.commit()

        def mutation_after_revoke_lock() -> SessionStatus:
            assert revoke_locked.wait(5)
            with make_session() as db:
                mutation_started.set()
                resolution, _actor = resolve_session_and_lock_employee(
                    db,
                    second.token,
                    purpose="operator",
                    boot_id=boot_id,
                )
                return resolution.status

        with ThreadPoolExecutor(max_workers=2) as pool:
            revoke_future = pool.submit(revoke_before_mutation)
            mutation_future = pool.submit(mutation_after_revoke_lock)
            revoke_future.result(timeout=10)
            assert mutation_future.result(timeout=10) == SessionStatus.REVOKED
    finally:
        with make_session() as cleanup:
            cleanup.query(Employee).filter(Employee.employee_id == employee_id).delete()
            cleanup.commit()
        engine.dispose()


def test_postgres_lifecycle_revoke_and_verified_mutation_share_lock_order() -> None:
    engine = create_engine(POSTGRES_URL, poolclass=NullPool)
    make_session = sessionmaker(bind=engine, expire_on_commit=False)
    lifecycle_actor = _employee()
    target = _employee()
    lifecycle_actor_id = lifecycle_actor.employee_id
    target_id = target.employee_id
    boot_id = current_boot_id()

    def lifecycle_request(token: str) -> Request:
        request = _request(
            f"/api/employees/{target_id}",
            method="PUT",
            cookies={OPERATOR_SESSION_COOKIE: token},
        )
        request.scope["endpoint"] = employees_router.update_employee
        request.scope["path_params"] = {"employee_id": str(target_id)}
        return request

    try:
        with make_session() as db:
            db.add_all((lifecycle_actor, target))
            db.flush()
            lifecycle_session = create_session(
                db,
                employee_id=lifecycle_actor_id,
                purpose="operator",
                boot_id=boot_id,
            )
            target_session = create_session(
                db,
                employee_id=target_id,
                purpose="operator",
                boot_id=boot_id,
            )
            db.commit()

        mutation_locked = Event()
        lifecycle_observed_lock = Event()
        mutation_committed = Event()

        def mutation_before_lifecycle() -> SessionStatus:
            with make_session() as db:
                resolution, target_actor = resolve_session_and_lock_employee(
                    db,
                    target_session.token,
                    purpose="operator",
                    boot_id=boot_id,
                )
                assert resolution.status == SessionStatus.VALID
                assert target_actor is not None
                mutation_locked.set()
                assert lifecycle_observed_lock.wait(5)
                target_actor.theme = "dark"
                db.commit()
                mutation_committed.set()
                return resolution.status

        def lifecycle_after_mutation_lock() -> bool:
            assert mutation_locked.wait(5)
            with make_session() as db:
                db.execute(text("SET LOCAL lock_timeout = '250ms'"))
                with pytest.raises(DBAPIError):
                    require_verified_actor(
                        lifecycle_request(lifecycle_session.token),
                        db,
                    )
                db.rollback()
                lifecycle_observed_lock.set()
                assert mutation_committed.wait(5)
                request = lifecycle_request(lifecycle_session.token)
                actor = require_verified_actor(request, db)
                assert actor.employee_id == lifecycle_actor_id
                locked_target = employees_router._locked_lifecycle_target(
                    request,
                    target_id,
                )
                assert locked_target is not None
                assert locked_target.employee_id == target_id
                result = employees_router.update_employee(
                    employee_id=target_id,
                    payload=EmployeeUpdate(is_active=False),
                    request=request,
                    _admin=None,
                    db=db,
                )
                return bool(result.is_active)

        with ThreadPoolExecutor(max_workers=2) as pool:
            mutation_future = pool.submit(mutation_before_lifecycle)
            lifecycle_future = pool.submit(lifecycle_after_mutation_lock)
            assert mutation_future.result(timeout=10) == SessionStatus.VALID
            assert lifecycle_future.result(timeout=10) is False

        with make_session() as db:
            stored = db.get(Employee, target_id)
            assert stored is not None
            assert stored.theme == "dark"
            assert not bool(stored.is_active)
            assert db.get(OperatorSession, target_session.row.session_id).revoked_at is not None
            assert (
                db.get(OperatorSession, lifecycle_session.row.session_id).revoked_at
                is None
            )
            stored.is_active = True
            second_target_session = create_session(
                db,
                employee_id=target_id,
                purpose="operator",
                boot_id=boot_id,
            )
            db.commit()

        lifecycle_locked = Event()
        mutation_started = Event()

        def lifecycle_before_mutation() -> None:
            with make_session() as db:
                request = lifecycle_request(lifecycle_session.token)
                actor = require_verified_actor(request, db)
                assert actor.employee_id == lifecycle_actor_id
                locked_target = employees_router._locked_lifecycle_target(
                    request,
                    target_id,
                )
                assert locked_target is not None
                lifecycle_locked.set()
                assert mutation_started.wait(5)
                result = employees_router.update_employee(
                    employee_id=target_id,
                    payload=EmployeeUpdate(is_active=False),
                    request=request,
                    _admin=None,
                    db=db,
                )
                assert result.is_active is False

        def mutation_after_lifecycle_lock() -> SessionStatus:
            assert lifecycle_locked.wait(5)
            with make_session() as db:
                mutation_started.set()
                resolution, _actor = resolve_session_and_lock_employee(
                    db,
                    second_target_session.token,
                    purpose="operator",
                    boot_id=boot_id,
                )
                return resolution.status

        with ThreadPoolExecutor(max_workers=2) as pool:
            lifecycle_future = pool.submit(lifecycle_before_mutation)
            mutation_future = pool.submit(mutation_after_lifecycle_lock)
            lifecycle_future.result(timeout=10)
            assert mutation_future.result(timeout=10) == SessionStatus.REVOKED
    finally:
        with make_session() as cleanup:
            cleanup.query(Employee).filter(
                Employee.employee_id.in_((lifecycle_actor_id, target_id))
            ).delete(synchronize_session=False)
            cleanup.commit()
        engine.dispose()


def test_postgres_login_and_pin_change_share_the_employee_row_lock() -> None:
    engine = create_engine(POSTGRES_URL, poolclass=NullPool)
    make_session = sessionmaker(bind=engine, expire_on_commit=False)
    employee = _employee()
    employee.pin_hash = hashlib.sha256(b"2468").hexdigest()
    employee_id = employee.employee_id
    boot_id = current_boot_id()

    def pin_change_request(token: str) -> Request:
        request = _request(
            f"/api/employees/{employee_id}/change-pin",
            method="POST",
            cookies={OPERATOR_SESSION_COOKIE: token},
        )
        request.scope["endpoint"] = employees_router.change_employee_pin
        request.scope["path_params"] = {"employee_id": str(employee_id)}
        return request

    rate_limit.reset_all()
    try:
        with make_session() as db:
            db.add(employee)
            db.flush()
            existing = create_session(
                db,
                employee_id=employee_id,
                purpose="operator",
                boot_id=boot_id,
            )
            db.commit()

        login_locked = Event()
        changer_observed_lock = Event()
        login_committed = Event()

        def login_before_change() -> uuid.UUID:
            with make_session() as db:
                locked_employee = (
                    db.query(Employee)
                    .filter(Employee.employee_id == employee_id)
                    .with_for_update()
                    .one()
                )
                verification = verify_pin_and_upgrade(locked_employee.pin_hash, "2468")
                assert verification.is_valid
                login_locked.set()
                assert changer_observed_lock.wait(5)
                locked_employee.pin_hash = verification.upgraded_hash
                issued = create_session(
                    db,
                    employee_id=employee_id,
                    purpose="operator",
                    boot_id=boot_id,
                )
                db.flush()
                session_id = issued.row.session_id
                db.commit()
                login_committed.set()
                return session_id

        def change_after_login_lock() -> None:
            assert login_locked.wait(5)
            with make_session() as db:
                db.execute(text("SET LOCAL lock_timeout = '250ms'"))
                with pytest.raises(DBAPIError):
                    require_verified_actor(pin_change_request(existing.token), db)
                db.rollback()
                changer_observed_lock.set()
                assert login_committed.wait(5)
                request = pin_change_request(existing.token)
                actor = require_verified_actor(request, db)
                employees_router.change_employee_pin(
                    employee_id=employee_id,
                    payload=EmployeePinChangeRequest(
                        current_pin="2468",
                        new_pin="1357",
                    ),
                    request=request,
                    actor=actor,
                    db=db,
                )

        with ThreadPoolExecutor(max_workers=2) as pool:
            login_future = pool.submit(login_before_change)
            change_future = pool.submit(change_after_login_lock)
            issued_session_id = login_future.result(timeout=10)
            change_future.result(timeout=10)

        with make_session() as db:
            assert db.get(OperatorSession, existing.row.session_id).revoked_at is not None
            assert db.get(OperatorSession, issued_session_id).revoked_at is not None
            changed_employee = db.get(Employee, employee_id)
            assert verify_pin_and_upgrade(changed_employee.pin_hash, "1357").is_valid
            assert not verify_pin_and_upgrade(changed_employee.pin_hash, "2468").is_valid
            replacement = create_session(
                db,
                employee_id=employee_id,
                purpose="operator",
                boot_id=boot_id,
            )
            db.commit()

        change_locked = Event()
        old_login_started = Event()

        def change_before_login() -> None:
            with make_session() as db:
                request = pin_change_request(replacement.token)
                actor = require_verified_actor(request, db)
                change_locked.set()
                assert old_login_started.wait(5)
                employees_router.change_employee_pin(
                    employee_id=employee_id,
                    payload=EmployeePinChangeRequest(
                        current_pin="1357",
                        new_pin="8642",
                    ),
                    request=request,
                    actor=actor,
                    db=db,
                )

        def old_login_after_change_lock() -> tuple[int, str | None]:
            assert change_locked.wait(5)
            with make_session() as db:
                old_login_started.set()
                try:
                    operator_sessions.create_operator_session(
                        OperatorSessionLoginRequest(
                            employee_id=employee_id,
                            pin="1357",
                        ),
                        _request(
                            "/api/operator-session",
                            method="POST",
                            cookies={},
                        ),
                        Response(),
                        db,
                    )
                except HTTPException as exc:
                    detail = exc.detail if isinstance(exc.detail, dict) else {}
                    return exc.status_code, detail.get("code")
                return 200, None

        with ThreadPoolExecutor(max_workers=2) as pool:
            change_future = pool.submit(change_before_login)
            old_login_future = pool.submit(old_login_after_change_lock)
            change_future.result(timeout=10)
            assert old_login_future.result(timeout=10) == (
                401,
                "INVALID_CREDENTIALS",
            )
    finally:
        rate_limit.reset_all()
        with make_session() as cleanup:
            cleanup.query(Employee).filter(Employee.employee_id == employee_id).delete()
            cleanup.commit()
        engine.dispose()


def test_postgres_cross_actor_lifecycle_locks_are_deadlock_free() -> None:
    engine = create_engine(POSTGRES_URL, poolclass=NullPool)
    make_session = sessionmaker(bind=engine, expire_on_commit=False)
    first_employee = _employee()
    second_employee = _employee()
    boot_id = current_boot_id()

    try:
        with make_session() as db:
            db.add_all((first_employee, second_employee))
            db.flush()
            first_session = create_session(
                db,
                employee_id=first_employee.employee_id,
                purpose="operator",
                boot_id=boot_id,
            )
            second_session = create_session(
                db,
                employee_id=second_employee.employee_id,
                purpose="operator",
                boot_id=boot_id,
            )
            db.commit()

        start = Barrier(2)

        def update_other_employee(
            token: str,
            actor_id: uuid.UUID,
            target_id: uuid.UUID,
            theme: str,
        ) -> tuple[uuid.UUID, uuid.UUID]:
            with make_session() as db:
                db.execute(text("SET LOCAL lock_timeout = '3s'"))
                start.wait(timeout=5)
                resolution, locked = resolve_session_and_lock_employees(
                    db,
                    token,
                    purpose="operator",
                    boot_id=boot_id,
                    employee_ids=(target_id,),
                )
                assert resolution.status == SessionStatus.VALID
                assert resolution.row is not None
                assert resolution.row.employee_id == actor_id
                assert set(locked) == {actor_id, target_id}
                locked[target_id].theme = theme
                db.commit()
                return actor_id, target_id

        with ThreadPoolExecutor(max_workers=2) as pool:
            first_future = pool.submit(
                update_other_employee,
                first_session.token,
                first_employee.employee_id,
                second_employee.employee_id,
                "dark",
            )
            second_future = pool.submit(
                update_other_employee,
                second_session.token,
                second_employee.employee_id,
                first_employee.employee_id,
                "light",
            )
            assert first_future.result(timeout=10) == (
                first_employee.employee_id,
                second_employee.employee_id,
            )
            assert second_future.result(timeout=10) == (
                second_employee.employee_id,
                first_employee.employee_id,
            )

        with make_session() as db:
            assert db.get(Employee, first_employee.employee_id).theme == "light"
            assert db.get(Employee, second_employee.employee_id).theme == "dark"
    finally:
        with make_session() as cleanup:
            cleanup.query(Employee).filter(
                Employee.employee_id.in_(
                    (first_employee.employee_id, second_employee.employee_id)
                )
            ).delete(synchronize_session=False)
            cleanup.commit()
        engine.dispose()


def test_postgres_admin_audit_accepts_max_length_employee_code() -> None:
    engine = create_engine(POSTGRES_URL, poolclass=NullPool)
    make_session = sessionmaker(bind=engine, expire_on_commit=False)
    audit_id = uuid.uuid4()
    actor_code = "A" * 30

    try:
        with make_session() as db:
            db.add(
                AdminAuditLog(
                    audit_id=audit_id,
                    actor_pin_role="admin",
                    actor_employee_code=actor_code,
                    action="employee.update",
                    target_type="employee",
                )
            )
            db.commit()

        with make_session() as db:
            assert db.get(AdminAuditLog, audit_id).actor_employee_code == actor_code
    finally:
        with make_session() as cleanup:
            cleanup.query(AdminAuditLog).filter(
                AdminAuditLog.audit_id == audit_id
            ).delete(synchronize_session=False)
            cleanup.commit()
        engine.dispose()


def test_postgres_admin_pin_change_serializes_the_global_credential() -> None:
    engine = create_engine(POSTGRES_URL, poolclass=NullPool)
    make_session = sessionmaker(bind=engine, expire_on_commit=False)
    original_value: str | None = None
    original_exists = False

    try:
        with make_session() as db:
            setting = db.get(SystemSetting, "admin_pin")
            original_exists = setting is not None
            original_value = setting.setting_value if setting is not None else None
            if setting is None:
                setting = SystemSetting(
                    setting_key="admin_pin",
                    setting_value=_hash_admin_pin("0000"),
                )
                db.add(setting)
            else:
                setting.setting_value = _hash_admin_pin("0000")
            db.commit()

        first_locked = Event()
        challenger_timed_out = Event()
        first_committed = Event()

        def first_change() -> None:
            with make_session() as db:
                setting = ensure_admin_pin(
                    db,
                    commit_if_created=False,
                    lock_for_update=True,
                )
                assert _matches_admin_pin(
                    db,
                    setting,
                    "0000",
                    migrate_plaintext=False,
                    commit_migration=False,
                )
                first_locked.set()
                assert challenger_timed_out.wait(5)
                setting.setting_value = _hash_admin_pin("1357")
                db.commit()
                first_committed.set()

        def stale_change() -> bool:
            assert first_locked.wait(5)
            with make_session() as db:
                db.execute(text("SET LOCAL lock_timeout = '250ms'"))
                with pytest.raises(DBAPIError):
                    ensure_admin_pin(
                        db,
                        commit_if_created=False,
                        lock_for_update=True,
                    )
                db.rollback()
                challenger_timed_out.set()
                assert first_committed.wait(5)
                setting = ensure_admin_pin(
                    db,
                    commit_if_created=False,
                    lock_for_update=True,
                )
                stale_pin_matches = _matches_admin_pin(
                    db,
                    setting,
                    "0000",
                    migrate_plaintext=False,
                    commit_migration=False,
                )
                db.rollback()
                return stale_pin_matches

        with ThreadPoolExecutor(max_workers=2) as pool:
            first_future = pool.submit(first_change)
            stale_future = pool.submit(stale_change)
            first_future.result(timeout=10)
            assert stale_future.result(timeout=10) is False
    finally:
        with make_session() as cleanup:
            setting = cleanup.get(SystemSetting, "admin_pin")
            if original_exists:
                assert setting is not None
                assert original_value is not None
                setting.setting_value = original_value
            elif setting is not None:
                cleanup.delete(setting)
            cleanup.commit()
        engine.dispose()


def test_postgres_admin_mutation_and_pin_change_share_the_credential_lock() -> None:
    engine = create_engine(POSTGRES_URL, poolclass=NullPool)
    make_session = sessionmaker(bind=engine, expire_on_commit=False)
    marker_key = f"cp3_admin_lock_{uuid.uuid4().hex}"
    original_value: str | None = None
    original_exists = False

    try:
        with make_session() as db:
            setting = db.get(SystemSetting, "admin_pin")
            original_exists = setting is not None
            original_value = setting.setting_value if setting is not None else None
            if setting is None:
                db.add(
                    SystemSetting(
                        setting_key="admin_pin",
                        setting_value=_hash_admin_pin("0000"),
                    )
                )
            else:
                setting.setting_value = _hash_admin_pin("0000")
            db.commit()

        mutation_authenticated = Event()
        pin_change_timed_out = Event()
        mutation_committed = Event()

        def old_pin_mutation() -> None:
            with make_session() as db:
                require_admin(db, "0000", commit_lazy_changes=False)
                mutation_authenticated.set()
                assert pin_change_timed_out.wait(5)
                db.add(SystemSetting(setting_key=marker_key, setting_value="committed"))
                db.commit()
                mutation_committed.set()

        def concurrent_pin_change() -> None:
            assert mutation_authenticated.wait(5)
            with make_session() as db:
                db.execute(text("SET LOCAL lock_timeout = '250ms'"))
                with pytest.raises(DBAPIError):
                    ensure_admin_pin(
                        db,
                        commit_if_created=False,
                        lock_for_update=True,
                    )
                db.rollback()
                pin_change_timed_out.set()
                assert mutation_committed.wait(5)

                setting = ensure_admin_pin(
                    db,
                    commit_if_created=False,
                    lock_for_update=True,
                )
                assert _matches_admin_pin(
                    db,
                    setting,
                    "0000",
                    migrate_plaintext=False,
                    commit_migration=False,
                )
                setting.setting_value = _hash_admin_pin("1357")
                db.commit()

        with ThreadPoolExecutor(max_workers=2) as pool:
            mutation_future = pool.submit(old_pin_mutation)
            change_future = pool.submit(concurrent_pin_change)
            mutation_future.result(timeout=10)
            change_future.result(timeout=10)

        with make_session() as observer:
            setting = observer.get(SystemSetting, "admin_pin")
            assert setting is not None
            assert _matches_admin_pin(
                observer,
                setting,
                "1357",
                migrate_plaintext=False,
                commit_migration=False,
            )
            assert not _matches_admin_pin(
                observer,
                setting,
                "0000",
                migrate_plaintext=False,
                commit_migration=False,
            )
            assert observer.get(SystemSetting, marker_key) is not None
            observer.rollback()
    finally:
        with make_session() as cleanup:
            marker = cleanup.get(SystemSetting, marker_key)
            if marker is not None:
                cleanup.delete(marker)
            setting = cleanup.get(SystemSetting, "admin_pin")
            if original_exists:
                assert setting is not None
                assert original_value is not None
                setting.setting_value = original_value
            elif setting is not None:
                cleanup.delete(setting)
            cleanup.commit()
        engine.dispose()
