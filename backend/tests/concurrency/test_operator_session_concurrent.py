"""IC-01 SQLite 세션 소비·폐기 경합의 선형화 계약."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Lock
import time
from types import SimpleNamespace
import uuid

import pytest
from fastapi import HTTPException, Request, Response

from app.dependencies.verified_actor import resolve_verified_actor
from app.models import AdminAuditLog, DepartmentEnum, Employee, EmployeeLevelEnum
from app.routers import operator_sessions
from app.routers.operator_sessions import complete_pin_change, create_operator_session
from app.runtime_identity import current_boot_id
from app.schemas import OperatorPinChangeCompleteRequest, OperatorSessionLoginRequest
from app.services import rate_limit
from app.services.operator_session import (
    OPERATOR_SESSION_COOKIE,
    PIN_CHANGE_CHALLENGE_COOKIE,
    SessionResolution,
    SessionStatus,
    create_session,
    revoke_session,
)
from app.services.pin_auth import PinVerificationResult, hash_pin, verify_pin


def _request_with_cookie(name: str, token: str, *, method: str = "POST") -> Request:
    cookie = f"{name}={token}".encode("ascii")
    return Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": "/api/operator-session/complete-pin-change",
            "raw_path": b"/api/operator-session/complete-pin-change",
            "query_string": b"",
            "headers": [(b"cookie", cookie)],
            "client": ("testclient", 50000),
            "server": ("testserver", 80),
        }
    )


def _login_request() -> Request:
    return Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/api/operator-session",
            "raw_path": b"/api/operator-session",
            "query_string": b"",
            "headers": [],
            "client": ("same-rate-limit-client", 50000),
            "server": ("testserver", 80),
        }
    )


def _login_request_with_operator_cookie(token: str) -> Request:
    request = _login_request()
    request.scope["headers"] = [
        (b"cookie", f"{OPERATOR_SESSION_COOKIE}={token}".encode("ascii"))
    ]
    return request


def _seed_employee_and_session(make_session, *, purpose: str) -> tuple[str, object]:
    with make_session() as db:
        employee = Employee(
            employee_code=f"RACE-{purpose.upper()}",
            name="Race actor",
            role="worker",
            department=DepartmentEnum.ASSEMBLY,
            level=EmployeeLevelEnum.STAFF,
            is_active=True,
            pin_hash=hash_pin("0000" if purpose == "pin_change" else "2468"),
            pin_requires_change=purpose == "pin_change",
        )
        db.add(employee)
        db.flush()
        issued = create_session(
            db,
            employee_id=employee.employee_id,
            purpose=purpose,
            boot_id=current_boot_id(),
        )
        employee_id = employee.employee_id
        db.commit()
        return issued.token, employee_id


def test_sqlite_concurrent_login_admits_at_most_ten_pin_verifications(
    make_session,
    monkeypatch,
) -> None:
    _token, employee_id = _seed_employee_and_session(make_session, purpose="operator")
    barrier = Barrier(20)
    verify_calls = 0
    verify_lock = Lock()
    statuses: list[int] = []
    statuses_lock = Lock()

    def _reject_pin(_stored_hash: str | None, _input_pin: str) -> PinVerificationResult:
        nonlocal verify_calls
        with verify_lock:
            verify_calls += 1
        return PinVerificationResult(is_valid=False)

    monkeypatch.setattr(operator_sessions, "verify_pin_and_upgrade", _reject_pin)
    rate_limit.reset_all()

    def login() -> None:
        with make_session() as db:
            barrier.wait()
            try:
                create_operator_session(
                    OperatorSessionLoginRequest(employee_id=employee_id, pin="9999"),
                    _login_request(),
                    Response(),
                    db,
                )
            except HTTPException as exc:
                db.rollback()
                status = exc.status_code
            else:  # pragma: no cover - 잘못된 PIN은 성공할 수 없다.
                status = 200
            with statuses_lock:
                statuses.append(status)

    with ThreadPoolExecutor(max_workers=20) as pool:
        futures = [pool.submit(login) for _ in range(20)]
        for future in futures:
            future.result(timeout=15)

    assert statuses.count(401) == 10
    assert statuses.count(429) == 10
    assert verify_calls == 10


def test_login_started_before_logout_revalidates_cookie_after_employee_lock(
    monkeypatch,
) -> None:
    employee = Employee(
        employee_id=uuid.uuid4(),
        employee_code="RACE-LOGIN-LOGOUT",
        name="Race login actor",
        role="worker",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    session_row = SimpleNamespace(employee_id=employee.employee_id)
    session_status = SessionStatus.VALID

    class _EmployeeQuery:
        def filter(self, *_criteria):
            return self

        def with_for_update(self):
            return self

        def first(self):
            nonlocal session_status
            session_status = SessionStatus.REVOKED
            return employee

    class _FakeDb:
        def query(self, model):
            assert model is Employee
            return _EmployeeQuery()

    def _resolve_session(*_args, **_kwargs) -> SessionResolution:
        return SessionResolution(session_status, session_row)

    def _unexpected_session_issue(*_args, **_kwargs):
        raise AssertionError("logout 이전 요청이 새 세션 발급에 도달했습니다")

    monkeypatch.setattr(operator_sessions, "resolve_session", _resolve_session)
    monkeypatch.setattr(operator_sessions, "create_session", _unexpected_session_issue)
    rate_limit.reset_all()

    with pytest.raises(HTTPException) as exc_info:
        create_operator_session(
            OperatorSessionLoginRequest(employee_id=employee.employee_id, pin="2468"),
            _login_request_with_operator_cookie("session-before-logout"),
            Response(),
            _FakeDb(),  # type: ignore[arg-type]
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail["code"] == "SESSION_EXPIRED"


def test_sqlite_pin_change_challenge_has_exactly_one_concurrent_consumer(
    make_session,
) -> None:
    token, employee_id = _seed_employee_and_session(make_session, purpose="pin_change")
    barrier = Barrier(2)
    results: list[tuple[int, str | None]] = []
    results_lock = Lock()

    def consume(new_pin: str) -> None:
        with make_session() as db:
            barrier.wait()
            try:
                response = complete_pin_change(
                    OperatorPinChangeCompleteRequest(
                        employee_id=employee_id,
                        new_pin=new_pin,
                    ),
                    _request_with_cookie(PIN_CHANGE_CHALLENGE_COOKIE, token),
                    Response(),
                    db,
                )
                result = (response.status_code, None)
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, dict) else {}
                result = (exc.status_code, detail.get("code"))
            with results_lock:
                results.append(result)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(consume, pin) for pin in ("1357", "2468")]
        for future in futures:
            future.result(timeout=15)

    assert sorted(status for status, _code in results) == [204, 401]
    assert {code for status, code in results if status == 401} == {"SESSION_EXPIRED"}
    with make_session() as verify_db:
        employee = verify_db.get(Employee, employee_id)
        assert employee is not None
        assert employee.pin_requires_change is False
        assert verify_pin(employee.pin_hash, "1357") or verify_pin(employee.pin_hash, "2468")
        assert verify_db.query(AdminAuditLog).filter_by(
            action="employee.complete_pin_change"
        ).count() == 1


@pytest.mark.parametrize(
    ("mutation_delay", "revoke_delay", "mutation_wins"),
    [(0.0, 0.05, True), (0.05, 0.0, False)],
)
def test_sqlite_mutation_and_revoke_are_linearized(
    make_session,
    mutation_delay: float,
    revoke_delay: float,
    mutation_wins: bool,
) -> None:
    token, employee_id = _seed_employee_and_session(make_session, purpose="operator")
    barrier = Barrier(2)
    outcomes: dict[str, object] = {}
    outcomes_lock = Lock()

    def mutate() -> None:
        with make_session() as db:
            barrier.wait()
            time.sleep(mutation_delay)
            try:
                actor, _row = resolve_verified_actor(
                    db,
                    _request_with_cookie(OPERATOR_SESSION_COOKIE, token, method="PUT"),
                    for_update=True,
                )
                actor.theme = "dark"
                db.commit()
                result: object = ("committed", time.monotonic())
            except HTTPException as exc:
                db.rollback()
                result = ("rejected", exc.status_code)
            with outcomes_lock:
                outcomes["mutation"] = result

    def revoke() -> None:
        with make_session() as db:
            barrier.wait()
            time.sleep(revoke_delay)
            count = revoke_session(db, token)
            db.commit()
            with outcomes_lock:
                outcomes["revoke"] = (count, time.monotonic())

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(mutate), pool.submit(revoke)]
        for future in futures:
            future.result(timeout=15)

    mutation = outcomes["mutation"]
    revoke_result = outcomes["revoke"]
    assert isinstance(mutation, tuple)
    assert isinstance(revoke_result, tuple)
    assert revoke_result[0] == 1
    with make_session() as verify_db:
        employee = verify_db.get(Employee, employee_id)
        assert employee is not None
        if mutation_wins:
            assert mutation[0] == "committed"
            assert mutation[1] <= revoke_result[1]
            assert employee.theme == "dark"
        else:
            assert mutation == ("rejected", 401)
            assert employee.theme is None
