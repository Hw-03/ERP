"""IC-01 작업자 로그인·최초 PIN 변경 HTTP 계약."""

from __future__ import annotations

import hashlib
import hmac
import logging
import pytest
import time
import uuid
from datetime import timedelta

from fastapi import Request, Response
from fastapi.testclient import TestClient
from sqlalchemy.exc import DataError, IntegrityError, OperationalError

from app.models import (
    ActivityAuditLog,
    AdminAuditLog,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    OperatorSession,
)
from app.routers.operator_sessions import create_operator_session, employee_profile
from app.runtime_identity import current_boot_id
from app.schemas import OperatorSessionLoginRequest
from app.services.operator_session import create_session, hash_session_token, utc_now
from app.services.pin_auth import PinVerificationResult, hash_pin, verify_pin


OPERATOR_COOKIE = "dexcowin_operator_session"
PIN_CHANGE_COOKIE = "dexcowin_pin_change_challenge"
PROXY_SECRET_ENV = "MES_PROXY_SHARED_SECRET"


def _legacy_hash(pin: str) -> str:
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()


def _signed_proxy_headers(client_ip: str, secret: str) -> dict[str, str]:
    timestamp = int(time.time())
    message = f"v1\n{timestamp}\n{client_ip}".encode()
    return {
        "X-MES-Proxy-Client-IP": client_ip,
        "X-MES-Proxy-Client-IP-Timestamp": str(timestamp),
        "X-MES-Proxy-Client-IP-Signature": hmac.new(
            secret.encode(), message, hashlib.sha256
        ).hexdigest(),
    }


def _employee(
    db_session,
    *,
    code: str,
    pin_hash: str | None,
    pin_requires_change: bool,
    is_active: bool = True,
) -> Employee:
    employee = Employee(
        employee_code=code,
        name=f"작업자 {code}",
        role="작업자",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        is_active=is_active,
        pin_hash=pin_hash,
        pin_requires_change=pin_requires_change,
    )
    db_session.add(employee)
    db_session.commit()
    return employee


def test_malformed_pin_state_is_reported_as_change_required(db_session) -> None:
    employee = _employee(
        db_session,
        code="LOGIN-MALFORMED-STATE",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    employee.pin_requires_change = None

    with db_session.no_autoflush:
        profile = employee_profile(db_session, employee)

    assert profile.pin_is_default is True


def test_malformed_pin_state_cannot_create_operator_session() -> None:
    employee = Employee(
        employee_id=uuid.uuid4(),
        employee_code="LOGIN-MALFORMED-SESSION",
        name="malformed state",
        role="작업자",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        pin_hash=hash_pin("2468"),
        pin_requires_change=None,
    )

    class _SingleRowQuery:
        def __init__(self, row: object | None) -> None:
            self._row = row

        def filter(self, *_criteria):
            return self

        def with_for_update(self):
            return self

        def first(self):
            return self._row

    class _FakeDb:
        def __init__(self) -> None:
            self.added: list[object] = []

        def query(self, model):
            return _SingleRowQuery(employee if model is Employee else None)

        def add(self, row: object) -> None:
            self.added.append(row)

        def commit(self) -> None:
            return None

        def rollback(self) -> None:
            return None

    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/operator-session",
            "headers": [],
            "client": ("127.0.0.42", 1234),
        }
    )
    db = _FakeDb()

    result = create_operator_session(
        OperatorSessionLoginRequest(employee_id=employee.employee_id, pin="2468"),
        request,
        Response(),
        db,  # type: ignore[arg-type]
    )

    assert result.status_code == 409
    assert employee.pin_requires_change is True
    assert len(db.added) == 1


def test_custom_legacy_pin_login_upgrades_hash_and_restores_from_cookie(
    db_session,
    client,
) -> None:
    employee = _employee(
        db_session,
        code="LOGIN-01",
        pin_hash=_legacy_hash("2468"),
        pin_requires_change=False,
    )
    client.cookies.set(PIN_CHANGE_COOKIE, "stale-pin-change-cookie")

    response = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
    )

    assert response.status_code == 200, response.text
    assert OPERATOR_COOKIE in response.cookies
    assert client.cookies.get(PIN_CHANGE_COOKIE) == "stale-pin-change-cookie"
    assert all(PIN_CHANGE_COOKIE not in value for value in response.headers.get_list("set-cookie"))
    assert response.json()["employee"]["employee_id"] == str(employee.employee_id)
    assert response.json()["expires_at"]
    assert response.json()["boot_id"]
    assert "token" not in response.text.lower()

    db_session.expire_all()
    stored = db_session.get(Employee, employee.employee_id)
    assert stored is not None
    assert stored.pin_hash.startswith("pbkdf2_sha256$600000$")
    assert verify_pin(stored.pin_hash, "2468") is True
    assert db_session.query(OperatorSession).filter_by(purpose="operator").count() == 1

    restored = client.get("/api/operator-session")
    assert restored.status_code == 200, restored.text
    assert restored.json()["employee"]["employee_code"] == "LOGIN-01"


def test_login_does_not_read_expired_orm_state_after_session_commit(
    db_session,
    client,
    monkeypatch,
) -> None:
    employee = _employee(
        db_session,
        code="LOGIN-COMMIT-BOUNDARY",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    employee_id = employee.employee_id
    real_commit = db_session.commit

    def _commit_and_detach() -> None:
        real_commit()
        db_session.expunge_all()

    monkeypatch.setattr(db_session, "commit", _commit_and_detach)

    response = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee_id), "pin": "2468"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["employee"]["employee_code"] == "LOGIN-COMMIT-BOUNDARY"
    assert OPERATOR_COOKIE in response.cookies


def test_login_employee_lookup_uses_row_lock(
    db_session,
    client,
    monkeypatch,
) -> None:
    employee = _employee(
        db_session,
        code="LOGIN-LOCK",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    real_query = db_session.query
    lock_observed = False

    class _EmployeeQuerySpy:
        def __init__(self):
            self._query = real_query(Employee)

        def filter(self, *criteria):
            self._query = self._query.filter(*criteria)
            return self

        def with_for_update(self):
            nonlocal lock_observed
            lock_observed = True
            self._query = self._query.with_for_update()
            return self

        def first(self):
            return self._query.first()

    def _query(*entities):
        if entities == (Employee,):
            return _EmployeeQuerySpy()
        return real_query(*entities)

    monkeypatch.setattr(db_session, "query", _query)

    response = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
    )

    assert response.status_code == 200, response.text
    assert lock_observed is True


def test_login_uses_only_server_resolved_employee_limiter_after_row_lock(
    db_session,
    client,
    monkeypatch,
) -> None:
    from app.routers import operator_sessions

    employee = _employee(
        db_session,
        code="LOGIN-RATE-LOCK",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    events: list[str] = []
    real_query = db_session.query

    class _EmployeeQuerySpy:
        def __init__(self):
            self._query = real_query(Employee)

        def filter(self, *criteria):
            self._query = self._query.filter(*criteria)
            return self

        def with_for_update(self):
            events.append("employee_lock")
            self._query = self._query.with_for_update()
            return self

        def first(self):
            return self._query.first()

    def _query(*entities):
        if entities == (Employee,):
            return _EmployeeQuerySpy()
        return real_query(*entities)

    def _is_blocked(key: str) -> bool:
        events.append(f"blocked:{key.split(':', 1)[0]}")
        return False

    def _admit_attempt(key: str) -> bool:
        namespace = key.split(":", 1)[0]
        events.append(f"admit:{namespace}")
        return False

    monkeypatch.setattr(db_session, "query", _query)
    monkeypatch.setattr(operator_sessions.rate_limit, "is_blocked", _is_blocked)
    monkeypatch.setattr(operator_sessions.rate_limit, "admit_attempt", _admit_attempt)

    response = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
    )

    assert response.status_code == 429, response.text
    assert response.json()["detail"]["code"] == "TOO_MANY_REQUESTS"
    assert events == [
        "employee_lock",
        "blocked:operator_pin",
        "admit:operator_pin",
    ]
    assert db_session.query(OperatorSession).count() == 0


def test_proxy_peer_failures_are_isolated_by_server_resolved_employee(
    db_session,
    client,
) -> None:
    shared_pin_hash = hash_pin("2468")
    employees = [
        _employee(
            db_session,
            code=f"LOGIN-PROXY-{index:02d}",
            pin_hash=shared_pin_hash,
            pin_requires_change=False,
        )
        for index in range(11)
    ]

    for index, employee in enumerate(employees[:10], start=1):
        rejected = client.post(
            "/api/operator-session",
            json={"employee_id": str(employee.employee_id), "pin": "9999"},
            headers={"X-Forwarded-For": f"203.0.113.{index}"},
        )
        assert rejected.status_code == 401, rejected.text

    allowed = client.post(
        "/api/operator-session",
        json={"employee_id": str(employees[10].employee_id), "pin": "2468"},
        headers={"X-Forwarded-For": "203.0.113.111"},
    )

    assert allowed.status_code == 200, allowed.text


def test_same_employee_eleventh_login_attempt_is_rate_limited(db_session, client) -> None:
    from app.services import rate_limit

    employee = _employee(
        db_session,
        code="LOGIN-SAME-CREDENTIAL",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    for index in range(rate_limit.DEFAULT_MAX_FAILURES):
        rejected = client.post(
            "/api/operator-session",
            json={"employee_id": str(employee.employee_id), "pin": "9999"},
            headers={"X-Forwarded-For": f"203.0.113.{index + 1}"},
        )
        assert rejected.status_code == 401, rejected.text

    blocked = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
        headers={"X-Forwarded-For": "203.0.113.111"},
    )

    assert blocked.status_code == 429, blocked.text
    assert blocked.json()["detail"]["code"] == "TOO_MANY_REQUESTS"


def test_attacker_ip_cannot_lock_same_employee_out_for_a_different_client_ip(
    db_session,
    client,
    monkeypatch,
) -> None:
    from app.services import rate_limit

    secret = "s" * 32
    monkeypatch.setenv(PROXY_SECRET_ENV, secret)
    employee = _employee(
        db_session,
        code="LOGIN-CLIENT-IP-ISOLATION",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )

    for _ in range(rate_limit.DEFAULT_MAX_FAILURES):
        rejected = client.post(
            "/api/operator-session",
            json={"employee_id": str(employee.employee_id), "pin": "9999"},
            headers=_signed_proxy_headers("198.51.100.10", secret),
        )
        assert rejected.status_code == 401, rejected.text

    allowed = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
        headers=_signed_proxy_headers("198.51.100.11", secret),
    )
    blocked = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
        headers=_signed_proxy_headers("198.51.100.10", secret),
    )

    assert allowed.status_code == 200, allowed.text
    assert blocked.status_code == 429, blocked.text


def test_random_unknown_employee_ids_have_bounded_dummy_kdf_without_blocking_known(
    db_session,
    client,
    monkeypatch,
) -> None:
    from app.routers import operator_sessions
    from app.services import rate_limit

    secret = "s" * 32
    monkeypatch.setenv(PROXY_SECRET_ENV, secret)
    employee = _employee(
        db_session,
        code="LOGIN-AFTER-UNKNOWN",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    real_verify = operator_sessions.verify_pin_and_upgrade
    kdf_calls = 0

    def _counted_verify(*args, **kwargs):
        nonlocal kdf_calls
        kdf_calls += 1
        return real_verify(*args, **kwargs)

    monkeypatch.setattr(operator_sessions, "verify_pin_and_upgrade", _counted_verify)
    for _ in range(rate_limit.DEFAULT_MAX_FAILURES):
        rejected = client.post(
            "/api/operator-session",
            json={"employee_id": str(uuid.uuid4()), "pin": "9999"},
            headers=_signed_proxy_headers("198.51.100.10", secret),
        )
        assert rejected.status_code == 401, rejected.text

    blocked = client.post(
        "/api/operator-session",
        json={"employee_id": str(uuid.uuid4()), "pin": "9999"},
        headers=_signed_proxy_headers("198.51.100.10", secret),
    )

    assert blocked.status_code == 429, blocked.text
    assert blocked.json()["detail"]["code"] == "TOO_MANY_REQUESTS"
    assert kdf_calls == rate_limit.DEFAULT_MAX_FAILURES
    assert set(rate_limit._failures) == {
        "operator_login_ip:all:198.51.100.10",
        "operator_login_kdf_ip:all:198.51.100.10",
    }

    allowed = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
        headers=_signed_proxy_headers("198.51.100.11", secret),
    )
    assert allowed.status_code == 200, allowed.text


def test_login_kdf_budget_covers_known_unknown_and_successful_attempts(
    db_session,
    client,
    monkeypatch,
) -> None:
    from app.routers import operator_sessions
    from app.services import rate_limit

    secret = "s" * 32
    monkeypatch.setenv(PROXY_SECRET_ENV, secret)
    employee = _employee(
        db_session,
        code="LOGIN-KDF-IP-BUDGET",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    kdf_calls = 0

    def _fast_verify(_stored_hash: str | None, pin: str) -> PinVerificationResult:
        nonlocal kdf_calls
        kdf_calls += 1
        return PinVerificationResult(pin == "2468")

    monkeypatch.setattr(operator_sessions, "verify_pin_and_upgrade", _fast_verify)
    headers = _signed_proxy_headers("198.51.100.40", secret)
    kdf_limit = getattr(rate_limit, "OPERATOR_LOGIN_KDF_MAX_ATTEMPTS", 60)
    known_successes = kdf_limit - rate_limit.DEFAULT_MAX_FAILURES

    for _ in range(known_successes):
        accepted = client.post(
            "/api/operator-session",
            json={"employee_id": str(employee.employee_id), "pin": "2468"},
            headers=headers,
        )
        assert accepted.status_code == 200, accepted.text

    client.cookies.clear()
    for _ in range(rate_limit.DEFAULT_MAX_FAILURES):
        rejected = client.post(
            "/api/operator-session",
            json={"employee_id": str(uuid.uuid4()), "pin": "9999"},
            headers=headers,
        )
        assert rejected.status_code == 401, rejected.text

    session_ids = {
        row.session_id for row in db_session.query(OperatorSession).all()
    }
    blocked = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
        headers=headers,
    )

    assert blocked.status_code == 429, blocked.text
    assert blocked.json()["detail"]["code"] == "TOO_MANY_REQUESTS"
    assert blocked.headers.get_list("set-cookie") == []
    assert kdf_calls == kdf_limit
    assert {
        row.session_id for row in db_session.query(OperatorSession).all()
    } == session_ids
    assert rate_limit.OPERATOR_LOGIN_KDF_MAX_ATTEMPTS == 60
    assert rate_limit.OPERATOR_RESOURCE_WINDOW_SECONDS == 5 * 60


def test_cookie_less_session_issuance_budget_is_not_reset_by_success(
    db_session,
    client,
    monkeypatch,
) -> None:
    from app.routers import operator_sessions
    from app.services import rate_limit

    secret = "s" * 32
    monkeypatch.setenv(PROXY_SECRET_ENV, secret)
    employee = _employee(
        db_session,
        code="LOGIN-ISSUANCE-BUDGET",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    clock = [1000.0]
    monkeypatch.setattr(rate_limit, "_now", lambda: clock[0])
    monkeypatch.setattr(
        operator_sessions,
        "verify_pin_and_upgrade",
        lambda _stored_hash, _pin: PinVerificationResult(True),
    )
    headers = _signed_proxy_headers("198.51.100.41", secret)
    issuance_limit = getattr(
        rate_limit,
        "OPERATOR_SESSION_ISSUANCE_MAX_ATTEMPTS",
        10,
    )

    for _ in range(issuance_limit):
        client.cookies.clear()
        accepted = client.post(
            "/api/operator-session",
            json={"employee_id": str(employee.employee_id), "pin": "2468"},
            headers=headers,
        )
        assert accepted.status_code == 200, accepted.text

    client.cookies.clear()
    session_ids = {
        row.session_id for row in db_session.query(OperatorSession).all()
    }
    blocked = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
        headers=headers,
    )

    assert blocked.status_code == 429, blocked.text
    assert blocked.json()["detail"]["code"] == "TOO_MANY_REQUESTS"
    assert blocked.headers.get_list("set-cookie") == []
    assert {
        row.session_id for row in db_session.query(OperatorSession).all()
    } == session_ids
    assert len(session_ids) == issuance_limit

    other_ip = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
        headers=_signed_proxy_headers("198.51.100.42", secret),
    )
    assert other_ip.status_code == 200, other_ip.text
    assert db_session.query(OperatorSession).count() == issuance_limit + 1

    client.cookies.clear()
    clock[0] += 5 * 60 + 1
    after_window = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
        headers=headers,
    )
    assert after_window.status_code == 200, after_window.text
    assert db_session.query(OperatorSession).count() == issuance_limit + 2
    assert rate_limit.OPERATOR_SESSION_ISSUANCE_MAX_ATTEMPTS == 10


def test_active_operator_session_cap_blocks_new_multi_ip_row_but_reuses_cookie(
    db_session,
    client,
    monkeypatch,
) -> None:
    from app.routers import operator_sessions

    secret = "s" * 32
    monkeypatch.setenv(PROXY_SECRET_ENV, secret)
    employee = _employee(
        db_session,
        code="LOGIN-ACTIVE-HARD-CAP",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    now = utc_now()
    active_limit = getattr(
        operator_sessions,
        "MAX_ACTIVE_OPERATOR_SESSIONS_PER_EMPLOYEE",
        32,
    )
    active_sessions = [
        create_session(
            db_session,
            employee_id=employee.employee_id,
            purpose="operator",
            boot_id=current_boot_id(),
            now=now,
        )
        for _ in range(active_limit)
    ]
    expired = create_session(
        db_session,
        employee_id=employee.employee_id,
        purpose="operator",
        boot_id=current_boot_id(),
        now=now - timedelta(hours=13),
    ).row
    revoked = create_session(
        db_session,
        employee_id=employee.employee_id,
        purpose="operator",
        boot_id=current_boot_id(),
        now=now,
    ).row
    revoked.revoked_at = now
    prior_boot = create_session(
        db_session,
        employee_id=employee.employee_id,
        purpose="operator",
        boot_id="prior-boot",
        now=now,
    ).row
    challenge = create_session(
        db_session,
        employee_id=employee.employee_id,
        purpose="pin_change",
        boot_id=current_boot_id(),
        now=now,
    ).row
    db_session.commit()
    historical_ids = {
        expired.session_id,
        revoked.session_id,
        prior_boot.session_id,
        challenge.session_id,
    }
    monkeypatch.setattr(
        operator_sessions,
        "verify_pin_and_upgrade",
        lambda _stored_hash, _pin: PinVerificationResult(True),
    )

    client.cookies.set(OPERATOR_COOKIE, active_sessions[0].token)
    reused = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
        headers=_signed_proxy_headers("198.51.100.42", secret),
    )
    assert reused.status_code == 200, reused.text
    assert reused.headers.get_list("set-cookie") == []

    client.cookies.clear()
    before_ids = {
        row.session_id for row in db_session.query(OperatorSession).all()
    }
    blocked = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
        headers=_signed_proxy_headers("198.51.100.99", secret),
    )

    assert blocked.status_code == 429, blocked.text
    assert blocked.json()["detail"]["code"] == "TOO_MANY_REQUESTS"
    assert blocked.headers.get_list("set-cookie") == []
    assert {
        row.session_id for row in db_session.query(OperatorSession).all()
    } == before_ids
    assert historical_ids.issubset(before_ids)
    assert operator_sessions.MAX_ACTIVE_OPERATOR_SESSIONS_PER_EMPLOYEE == 32


def test_default_pin_issues_only_one_time_change_challenge(db_session, client) -> None:
    employee = _employee(
        db_session,
        code="LOGIN-02",
        pin_hash=_legacy_hash("0000"),
        pin_requires_change=True,
    )
    client.cookies.set(OPERATOR_COOKIE, "stale-operator-cookie")

    response = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "0000"},
    )

    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "PIN_CHANGE_REQUIRED"
    assert PIN_CHANGE_COOKIE in response.cookies
    assert client.cookies.get(OPERATOR_COOKIE) == "stale-operator-cookie"
    assert all(OPERATOR_COOKIE not in value for value in response.headers.get_list("set-cookie"))
    assert db_session.query(OperatorSession).filter_by(purpose="operator").count() == 0
    assert db_session.query(OperatorSession).filter_by(purpose="pin_change").count() == 1
    assert client.get("/api/operator-session").status_code == 401


def test_discarded_default_pin_challenges_are_rate_limited_and_storage_bounded(
    db_session,
    client,
) -> None:
    employee = _employee(
        db_session,
        code="LOGIN-CHALLENGE-BOUND",
        pin_hash=hash_pin("0000"),
        pin_requires_change=True,
    )
    now = utc_now()
    revoked = create_session(
        db_session,
        employee_id=employee.employee_id,
        purpose="pin_change",
        boot_id=current_boot_id(),
        now=now - timedelta(minutes=30),
    ).row
    revoked.revoked_at = now - timedelta(minutes=20)
    consumed = create_session(
        db_session,
        employee_id=employee.employee_id,
        purpose="pin_change",
        boot_id=current_boot_id(),
        now=now - timedelta(minutes=25),
    ).row
    consumed.consumed_at = now - timedelta(minutes=15)
    expired = create_session(
        db_session,
        employee_id=employee.employee_id,
        purpose="pin_change",
        boot_id=current_boot_id(),
        now=now - timedelta(minutes=20),
    ).row
    expired.expires_at = now - timedelta(minutes=10)
    db_session.commit()
    historical_ids = {revoked.session_id, consumed.session_id, expired.session_id}

    latest_challenge = None
    for _ in range(10):
        client.cookies.clear()
        response = client.post(
            "/api/operator-session",
            json={"employee_id": str(employee.employee_id), "pin": "0000"},
        )
        assert response.status_code == 409, response.text
        assert response.json()["detail"]["code"] == "PIN_CHANGE_REQUIRED"
        latest_challenge = response.cookies.get(PIN_CHANGE_COOKIE)
        assert latest_challenge

    client.cookies.clear()
    blocked = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "0000"},
    )

    assert blocked.status_code == 429, blocked.text
    assert blocked.json()["detail"]["code"] == "TOO_MANY_REQUESTS"
    challenges = (
        db_session.query(OperatorSession)
        .filter_by(employee_id=employee.employee_id, purpose="pin_change")
        .all()
    )
    active = [
        row
        for row in challenges
        if row.revoked_at is None
        and row.consumed_at is None
        and row.expires_at > now
        and row.boot_id == current_boot_id()
    ]
    assert len(active) == 1
    assert historical_ids.issubset({row.session_id for row in challenges})
    assert len(challenges) == 4
    assert db_session.query(ActivityAuditLog).count() == 0

    client.cookies.set(PIN_CHANGE_COOKIE, latest_challenge)
    completed = client.post(
        "/api/operator-session/complete-pin-change",
        json={"employee_id": str(employee.employee_id), "new_pin": "1357"},
    )
    assert completed.status_code == 204, completed.text

    client.cookies.clear()
    relogin = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "1357"},
    )
    assert relogin.status_code == 200, relogin.text


def test_unset_pin_also_requires_change_before_operator_session(db_session, client) -> None:
    employee = _employee(
        db_session,
        code="LOGIN-03",
        pin_hash=None,
        pin_requires_change=True,
    )

    response = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "0000"},
    )

    assert response.status_code == 409
    assert db_session.query(OperatorSession).filter_by(purpose="operator").count() == 0


def test_complete_initial_pin_change_consumes_challenge_and_requires_fresh_login(
    db_session,
    client,
) -> None:
    employee = _employee(
        db_session,
        code="LOGIN-04",
        pin_hash=_legacy_hash("0000"),
        pin_requires_change=True,
    )
    challenged = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "0000"},
    )
    assert challenged.status_code == 409

    changed = client.post(
        "/api/operator-session/complete-pin-change",
        json={"employee_id": str(employee.employee_id), "new_pin": "1357"},
    )

    assert changed.status_code == 204, changed.text
    assert PIN_CHANGE_COOKIE in client.cookies
    assert changed.headers.get_list("set-cookie") == []
    db_session.expire_all()
    stored = db_session.get(Employee, employee.employee_id)
    assert stored is not None
    assert stored.pin_requires_change is False
    assert verify_pin(stored.pin_hash, "1357") is True
    assert all(row.revoked_at is not None for row in db_session.query(OperatorSession))
    bootstrap_audit = (
        db_session.query(AdminAuditLog)
        .filter_by(action="employee.complete_pin_change")
        .one()
    )
    assert bootstrap_audit.actor_employee_code is None
    assert bootstrap_audit.bootstrap_employee_id == employee.employee_id.hex
    assert len(bootstrap_audit.bootstrap_employee_id) == 32
    assert bootstrap_audit.request_id

    assert client.get("/api/operator-session").status_code == 401
    relogin = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "1357"},
    )
    assert relogin.status_code == 200, relogin.text


def test_complete_pin_change_rejects_another_tabs_overwritten_challenge(
    db_session,
    client,
) -> None:
    employee_a = _employee(
        db_session,
        code="LOGIN-CHALLENGE-A",
        pin_hash=hash_pin("0000"),
        pin_requires_change=True,
    )
    employee_b = _employee(
        db_session,
        code="LOGIN-CHALLENGE-B",
        pin_hash=hash_pin("0000"),
        pin_requires_change=True,
    )
    employee_a_id = employee_a.employee_id
    employee_b_id = employee_b.employee_id
    assert client.post(
        "/api/operator-session",
        json={"employee_id": str(employee_a_id), "pin": "0000"},
    ).status_code == 409
    challenge_a = client.cookies.get(PIN_CHANGE_COOKIE)
    tab_b = TestClient(client.app)
    try:
        assert tab_b.post(
            "/api/operator-session",
            json={"employee_id": str(employee_b_id), "pin": "0000"},
        ).status_code == 409
        challenge_b = tab_b.cookies.get(PIN_CHANGE_COOKIE)
    finally:
        tab_b.close()
    assert challenge_a and challenge_b and challenge_a != challenge_b
    client.cookies.clear()
    client.cookies.set(PIN_CHANGE_COOKIE, challenge_b)

    mismatch = client.post(
        "/api/operator-session/complete-pin-change",
        json={"employee_id": str(employee_a_id), "new_pin": "1357"},
    )

    assert mismatch.status_code == 403, mismatch.text
    assert mismatch.json()["detail"]["code"] == "ACTOR_MISMATCH"
    db_session.expire_all()
    stored_a = db_session.get(Employee, employee_a_id)
    stored_b = db_session.get(Employee, employee_b_id)
    assert stored_a is not None and stored_b is not None
    assert stored_a.pin_requires_change is True
    assert stored_b.pin_requires_change is True
    assert verify_pin(stored_a.pin_hash, "0000") is True
    assert verify_pin(stored_b.pin_hash, "0000") is True
    challenge_b_row = (
        db_session.query(OperatorSession)
        .filter_by(employee_id=employee_b_id, purpose="pin_change")
        .one()
    )
    assert challenge_b_row.consumed_at is None
    assert challenge_b_row.revoked_at is None


def test_complete_pin_change_rejects_a_foreign_valid_operator_cookie(
    db_session,
    client,
) -> None:
    employee_a = _employee(
        db_session,
        code="LOGIN-COMBINED-A",
        pin_hash=hash_pin("0000"),
        pin_requires_change=True,
    )
    employee_b = _employee(
        db_session,
        code="LOGIN-COMBINED-B",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    employee_a_id = employee_a.employee_id
    employee_b_id = employee_b.employee_id
    tab_a = TestClient(client.app)
    tab_b = TestClient(client.app)
    try:
        assert tab_a.post(
            "/api/operator-session",
            json={"employee_id": str(employee_a_id), "pin": "0000"},
        ).status_code == 409
        challenge_a = tab_a.cookies.get(PIN_CHANGE_COOKIE)
        assert tab_b.post(
            "/api/operator-session",
            json={"employee_id": str(employee_b_id), "pin": "2468"},
        ).status_code == 200
        operator_b = tab_b.cookies.get(OPERATOR_COOKIE)
    finally:
        tab_a.close()
        tab_b.close()
    assert challenge_a and operator_b
    client.cookies.clear()
    client.cookies.set(PIN_CHANGE_COOKIE, challenge_a)
    client.cookies.set(OPERATOR_COOKIE, operator_b)
    before_sessions = {
        row.session_id: (row.revoked_at, row.consumed_at)
        for row in db_session.query(OperatorSession).all()
    }
    before_audits = db_session.query(AdminAuditLog).count()

    mismatch = client.post(
        "/api/operator-session/complete-pin-change",
        json={"employee_id": str(employee_a_id), "new_pin": "1357"},
    )

    assert mismatch.status_code == 403, mismatch.text
    assert mismatch.json()["detail"]["code"] == "ACTOR_MISMATCH"
    db_session.expire_all()
    stored_a = db_session.get(Employee, employee_a_id)
    stored_b = db_session.get(Employee, employee_b_id)
    assert stored_a is not None and stored_b is not None
    assert stored_a.pin_requires_change is True
    assert verify_pin(stored_a.pin_hash, "0000") is True
    assert verify_pin(stored_b.pin_hash, "2468") is True
    assert {
        row.session_id: (row.revoked_at, row.consumed_at)
        for row in db_session.query(OperatorSession).all()
    } == before_sessions
    assert db_session.query(AdminAuditLog).count() == before_audits


def test_scoped_challenge_cancel_preserves_a_foreign_operator_session(
    db_session,
    client,
) -> None:
    employee_a = _employee(
        db_session,
        code="CANCEL-SCOPED-A",
        pin_hash=hash_pin("0000"),
        pin_requires_change=True,
    )
    employee_b = _employee(
        db_session,
        code="CANCEL-SCOPED-B",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    tab_a = TestClient(client.app)
    tab_b = TestClient(client.app)
    try:
        assert tab_a.post(
            "/api/operator-session",
            json={"employee_id": str(employee_a.employee_id), "pin": "0000"},
        ).status_code == 409
        challenge_a = tab_a.cookies.get(PIN_CHANGE_COOKIE)
        assert tab_b.post(
            "/api/operator-session",
            json={"employee_id": str(employee_b.employee_id), "pin": "2468"},
        ).status_code == 200
        operator_b = tab_b.cookies.get(OPERATOR_COOKIE)
    finally:
        tab_a.close()
        tab_b.close()
    assert challenge_a and operator_b
    client.cookies.clear()
    client.cookies.set(PIN_CHANGE_COOKIE, challenge_a)
    client.cookies.set(OPERATOR_COOKIE, operator_b)

    cancelled = client.delete(
        f"/api/operator-session?pin_change_employee_id={employee_a.employee_id}"
    )

    assert cancelled.status_code == 204, cancelled.text
    db_session.expire_all()
    challenge_row = db_session.query(OperatorSession).filter_by(
        token_hash=hash_session_token(challenge_a)
    ).one()
    operator_row = db_session.query(OperatorSession).filter_by(
        token_hash=hash_session_token(operator_b)
    ).one()
    assert challenge_row.revoked_at is not None
    assert operator_row.revoked_at is None
    restored_b = client.get("/api/operator-session")
    assert restored_b.status_code == 200, restored_b.text
    assert restored_b.json()["employee"]["employee_id"] == str(employee_b.employee_id)
    cancel_activity = db_session.query(ActivityAuditLog).filter_by(
        action_key="http.delete.operator-session"
    ).all()
    assert cancel_activity == []
    bootstrap_audit = db_session.query(AdminAuditLog).filter_by(
        action="employee.cancel_pin_change_challenge"
    ).one()
    assert bootstrap_audit.actor_employee_code is None
    assert bootstrap_audit.bootstrap_employee_id == employee_a.employee_id.hex


def test_operator_logout_preserves_a_foreign_pin_change_challenge(
    db_session,
    client,
) -> None:
    employee_a = _employee(
        db_session,
        code="LOGOUT-PRESERVE-A",
        pin_hash=hash_pin("0000"),
        pin_requires_change=True,
    )
    employee_b = _employee(
        db_session,
        code="LOGOUT-PRESERVE-B",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    tab_a = TestClient(client.app)
    tab_b = TestClient(client.app)
    try:
        assert tab_a.post(
            "/api/operator-session",
            json={"employee_id": str(employee_a.employee_id), "pin": "0000"},
        ).status_code == 409
        challenge_a = tab_a.cookies.get(PIN_CHANGE_COOKIE)
        assert tab_b.post(
            "/api/operator-session",
            json={"employee_id": str(employee_b.employee_id), "pin": "2468"},
        ).status_code == 200
        operator_b = tab_b.cookies.get(OPERATOR_COOKIE)
    finally:
        tab_a.close()
        tab_b.close()
    assert challenge_a and operator_b
    client.cookies.clear()
    client.cookies.set(PIN_CHANGE_COOKIE, challenge_a)
    client.cookies.set(OPERATOR_COOKIE, operator_b)

    logout = client.delete("/api/operator-session")

    assert logout.status_code == 204, logout.text
    db_session.expire_all()
    challenge_row = db_session.query(OperatorSession).filter_by(
        token_hash=hash_session_token(challenge_a)
    ).one()
    operator_row = db_session.query(OperatorSession).filter_by(
        token_hash=hash_session_token(operator_b)
    ).one()
    assert challenge_row.revoked_at is None
    assert operator_row.revoked_at is not None


@pytest.mark.parametrize("include_foreign_claim", [False, True])
def test_claimed_logout_cannot_revoke_a_foreign_challenge_without_operator(
    db_session,
    client,
    include_foreign_claim: bool,
) -> None:
    employee_a = _employee(
        db_session,
        code="PENDING-CLAIM-A",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    employee_b = _employee(
        db_session,
        code="PENDING-CHALLENGE-B",
        pin_hash=hash_pin("0000"),
        pin_requires_change=True,
    )
    challenged = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee_b.employee_id), "pin": "0000"},
    )
    challenge_b = client.cookies.get(PIN_CHANGE_COOKIE)
    assert challenged.status_code == 409
    assert challenge_b
    before_audits = db_session.query(AdminAuditLog).count()
    before_activity_audits = db_session.query(ActivityAuditLog).count()

    headers = (
        {"X-MES-Employee-Code": employee_a.employee_code}
        if include_foreign_claim
        else {}
    )
    mismatch = client.delete("/api/operator-session", headers=headers)

    assert mismatch.status_code == 403, mismatch.text
    assert mismatch.json()["detail"]["code"] == "ACTOR_MISMATCH"
    db_session.expire_all()
    challenge_row = db_session.query(OperatorSession).filter_by(
        token_hash=hash_session_token(challenge_b)
    ).one()
    assert challenge_row.revoked_at is None
    assert challenge_row.consumed_at is None
    stored_b = db_session.get(Employee, employee_b.employee_id)
    assert stored_b is not None
    assert stored_b.pin_requires_change is True
    assert verify_pin(stored_b.pin_hash, "0000") is True
    assert db_session.query(AdminAuditLog).count() == before_audits
    assert db_session.query(ActivityAuditLog).count() == before_activity_audits


def test_complete_pin_change_keeps_foreign_operator_preflight_fail_closed(
    db_session,
    client,
    monkeypatch,
) -> None:
    from app.routers import operator_sessions
    from app.services.operator_session import SessionResolution, SessionStatus

    employee_a = _employee(
        db_session,
        code="LOGIN-TOCTOU-A",
        pin_hash=hash_pin("0000"),
        pin_requires_change=True,
    )
    employee_b = _employee(
        db_session,
        code="LOGIN-TOCTOU-B",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    employee_a_id = employee_a.employee_id
    tab_a = TestClient(client.app)
    tab_b = TestClient(client.app)
    try:
        assert tab_a.post(
            "/api/operator-session",
            json={"employee_id": str(employee_a_id), "pin": "0000"},
        ).status_code == 409
        challenge_a = tab_a.cookies.get(PIN_CHANGE_COOKIE)
        assert tab_b.post(
            "/api/operator-session",
            json={"employee_id": str(employee_b.employee_id), "pin": "2468"},
        ).status_code == 200
        operator_b = tab_b.cookies.get(OPERATOR_COOKIE)
    finally:
        tab_a.close()
        tab_b.close()
    assert challenge_a and operator_b
    client.cookies.clear()
    client.cookies.set(PIN_CHANGE_COOKIE, challenge_a)
    client.cookies.set(OPERATOR_COOKIE, operator_b)
    real_resolve = operator_sessions.resolve_session

    def _revoke_operator_after_preflight(*args, **kwargs):
        resolution = real_resolve(*args, **kwargs)
        if kwargs.get("purpose") == "operator" and kwargs.get("for_update") is True:
            return SessionResolution(SessionStatus.REVOKED, resolution.row)
        return resolution

    monkeypatch.setattr(operator_sessions, "resolve_session", _revoke_operator_after_preflight)

    mismatch = client.post(
        "/api/operator-session/complete-pin-change",
        json={"employee_id": str(employee_a_id), "new_pin": "1357"},
    )

    assert mismatch.status_code == 403, mismatch.text
    assert mismatch.json()["detail"]["code"] == "ACTOR_MISMATCH"
    db_session.expire_all()
    stored_a = db_session.get(Employee, employee_a_id)
    assert stored_a is not None
    assert stored_a.pin_requires_change is True
    assert verify_pin(stored_a.pin_hash, "0000") is True
    challenge_row = db_session.query(OperatorSession).filter_by(
        token_hash=hash_session_token(challenge_a)
    ).one()
    assert challenge_row.revoked_at is None
    assert challenge_row.consumed_at is None
    assert db_session.query(AdminAuditLog).filter_by(
        action="employee.complete_pin_change"
    ).count() == 0


def test_initial_pin_change_rejects_default_pin_and_challenge_reuse(
    db_session,
    client,
) -> None:
    employee = _employee(
        db_session,
        code="LOGIN-05",
        pin_hash=hash_pin("0000"),
        pin_requires_change=True,
    )
    assert client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "0000"},
    ).status_code == 409

    rejected = client.post(
        "/api/operator-session/complete-pin-change",
        json={"employee_id": str(employee.employee_id), "new_pin": "0000"},
    )
    assert rejected.status_code == 422

    accepted = client.post(
        "/api/operator-session/complete-pin-change",
        json={"employee_id": str(employee.employee_id), "new_pin": "8642"},
    )
    assert accepted.status_code == 204
    reused = client.post(
        "/api/operator-session/complete-pin-change",
        json={"employee_id": str(employee.employee_id), "new_pin": "9753"},
    )
    assert reused.status_code == 401


def test_logout_revokes_server_session_without_a_cookie_mutation_response(
    db_session,
    client,
) -> None:
    employee = _employee(
        db_session,
        code="LOGIN-06",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    employee_b = _employee(
        db_session,
        code="LOGIN-06-B",
        pin_hash=hash_pin("1357"),
        pin_requires_change=False,
    )
    assert client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
    ).status_code == 200
    operator_token = client.cookies.get(OPERATOR_COOKIE)

    logout = client.delete("/api/operator-session")

    assert logout.status_code == 204
    assert logout.headers.get_list("set-cookie") == []
    assert client.cookies.get(OPERATOR_COOKIE) == operator_token
    db_session.expire_all()
    assert db_session.query(OperatorSession).one().revoked_at is not None
    assert client.get("/api/operator-session").status_code == 401
    login_b = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee_b.employee_id), "pin": "1357"},
    )
    assert login_b.status_code == 200, login_b.text
    assert client.cookies.get(OPERATOR_COOKIE) != operator_token
    assert client.get("/api/operator-session").json()["employee"]["employee_id"] == str(
        employee_b.employee_id
    )


def test_cancelled_pin_change_challenge_does_not_block_next_actor_or_replay(
    db_session,
    client,
) -> None:
    employee_a = _employee(
        db_session,
        code="CHALLENGE-CANCEL-A",
        pin_hash=hash_pin("0000"),
        pin_requires_change=True,
    )
    employee_b = _employee(
        db_session,
        code="CHALLENGE-CANCEL-B",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    employee_a_id = employee_a.employee_id

    challenged = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee_a_id), "pin": "0000"},
    )
    challenge_token = client.cookies.get(PIN_CHANGE_COOKIE)
    assert challenged.status_code == 409
    assert challenge_token

    cancelled = client.delete(
        f"/api/operator-session?pin_change_employee_id={employee_a_id}"
    )
    assert cancelled.status_code == 204
    assert cancelled.headers.get_list("set-cookie") == []
    assert client.cookies.get(PIN_CHANGE_COOKIE) == challenge_token

    next_login = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee_b.employee_id), "pin": "2468"},
    )
    assert next_login.status_code == 200, next_login.text

    replay = client.post(
        "/api/operator-session/complete-pin-change",
        json={"employee_id": str(employee_a_id), "new_pin": "1357"},
    )
    assert replay.status_code == 401, replay.text
    assert replay.json()["detail"]["code"] == "SESSION_EXPIRED"
    db_session.expire_all()
    stored_a = db_session.get(Employee, employee_a_id)
    assert stored_a is not None
    assert stored_a.pin_requires_change is True
    assert verify_pin(stored_a.pin_hash, "0000") is True
    challenge_row = db_session.query(OperatorSession).filter_by(
        token_hash=hash_session_token(challenge_token)
    ).one()
    assert challenge_row.revoked_at is not None
    assert challenge_row.consumed_at is None
    assert db_session.query(AdminAuditLog).filter_by(
        action="employee.complete_pin_change"
    ).count() == 0


def test_logout_locks_employee_and_revokes_only_presented_actor_session(
    db_session,
    client,
    monkeypatch,
) -> None:
    from app.routers import operator_sessions

    employee = _employee(
        db_session,
        code="LOGOUT-ALL",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    other_browser = TestClient(client.app)
    try:
        assert client.post(
            "/api/operator-session",
            json={"employee_id": str(employee.employee_id), "pin": "2468"},
        ).status_code == 200
        presented_token = client.cookies.get(OPERATOR_COOKIE)
        assert client.post(
            "/api/operator-session",
            json={"employee_id": str(employee.employee_id), "pin": "2468"},
        ).status_code == 200
        assert client.cookies.get(OPERATOR_COOKIE) == presented_token
        assert db_session.query(OperatorSession).count() == 1
        assert other_browser.post(
            "/api/operator-session",
            json={"employee_id": str(employee.employee_id), "pin": "2468"},
        ).status_code == 200
        other_token = other_browser.cookies.get(OPERATOR_COOKIE)
    finally:
        other_browser.close()
    assert presented_token and other_token and presented_token != other_token
    assert db_session.query(OperatorSession).count() == 2
    events: list[str] = []
    real_query = db_session.query
    real_revoke = operator_sessions.revoke_session

    class _EmployeeQuerySpy:
        def __init__(self) -> None:
            self._query = real_query(Employee)

        def filter(self, *criteria):
            self._query = self._query.filter(*criteria)
            return self

        def order_by(self, *criteria):
            self._query = self._query.order_by(*criteria)
            return self

        def populate_existing(self):
            self._query = self._query.populate_existing()
            return self

        def with_for_update(self):
            events.append("employee_lock")
            self._query = self._query.with_for_update()
            return self

        def all(self):
            return self._query.all()

    def _query(*entities):
        if entities == (Employee,):
            return _EmployeeQuerySpy()
        return real_query(*entities)

    def _revoke_presented(*args, **kwargs):
        events.append("revoke_presented")
        return real_revoke(*args, **kwargs)

    monkeypatch.setattr(db_session, "query", _query)
    monkeypatch.setattr(operator_sessions, "revoke_session", _revoke_presented)

    logout = client.delete("/api/operator-session")

    assert logout.status_code == 204, logout.text
    assert events == ["employee_lock", "revoke_presented"]
    db_session.expire_all()
    presented_row = real_query(OperatorSession).filter_by(
        token_hash=hash_session_token(presented_token)
    ).one()
    other_row = real_query(OperatorSession).filter_by(
        token_hash=hash_session_token(other_token)
    ).one()
    assert presented_row.revoked_at is not None
    assert other_row.revoked_at is None


@pytest.mark.parametrize(
    ("target_pin", "target_requires_change"),
    [("1357", False), ("0000", True)],
)
def test_login_or_challenge_rejects_replacing_a_different_valid_cookie_actor(
    db_session,
    client,
    target_pin: str,
    target_requires_change: bool,
) -> None:
    employee_a = _employee(
        db_session,
        code="LOGIN-SWITCH-A",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    employee_b = _employee(
        db_session,
        code="LOGIN-SWITCH-B",
        pin_hash=hash_pin(target_pin),
        pin_requires_change=target_requires_change,
    )
    assert client.post(
        "/api/operator-session",
        json={"employee_id": str(employee_a.employee_id), "pin": "2468"},
    ).status_code == 200

    switched = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee_b.employee_id), "pin": target_pin},
    )

    assert switched.status_code == 403, switched.text
    assert switched.json()["detail"]["code"] == "ACTOR_MISMATCH"
    assert (
        db_session.query(OperatorSession)
        .filter(OperatorSession.employee_id == employee_b.employee_id)
        .count()
        == 0
    )
    restored = client.get("/api/operator-session")
    assert restored.status_code == 200, restored.text
    assert restored.json()["employee"]["employee_id"] == str(employee_a.employee_id)


def test_logout_rejects_another_tabs_new_operator_cookie(db_session, client) -> None:
    employee_a = _employee(
        db_session,
        code="LOGOUT-TAB-A",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    employee_b = _employee(
        db_session,
        code="LOGOUT-TAB-B",
        pin_hash=hash_pin("1357"),
        pin_requires_change=False,
    )
    assert client.post(
        "/api/operator-session",
        json={"employee_id": str(employee_a.employee_id), "pin": "2468"},
    ).status_code == 200
    tab_b = TestClient(client.app)
    try:
        assert tab_b.post(
            "/api/operator-session",
            json={"employee_id": str(employee_b.employee_id), "pin": "1357"},
        ).status_code == 200
        tab_b_token = tab_b.cookies.get(OPERATOR_COOKIE)
    finally:
        tab_b.close()
    assert tab_b_token
    client.cookies.clear()
    client.cookies.set(OPERATOR_COOKIE, tab_b_token)

    logout = client.delete(
        "/api/operator-session",
        headers={"X-MES-Employee-Code": employee_a.employee_code},
    )

    assert logout.status_code == 403, logout.text
    assert logout.json()["detail"]["code"] == "ACTOR_MISMATCH"
    db_session.expire_all()
    session_b = (
        db_session.query(OperatorSession)
        .filter(OperatorSession.employee_id == employee_b.employee_id)
        .one()
    )
    assert session_b.revoked_at is None
    restored = client.get("/api/operator-session")
    assert restored.status_code == 200, restored.text
    assert restored.json()["employee"]["employee_id"] == str(employee_b.employee_id)


def test_logout_revokes_pin_change_challenge_and_replay_fails(db_session, client) -> None:
    employee = _employee(
        db_session,
        code="LOGIN-CHALLENGE-LOGOUT",
        pin_hash=hash_pin("0000"),
        pin_requires_change=True,
    )
    challenged = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "0000"},
    )
    assert challenged.status_code == 409, challenged.text
    challenge_token = client.cookies.get(PIN_CHANGE_COOKIE)
    assert challenge_token

    logout = client.delete(
        "/api/operator-session",
        headers={"X-MES-Employee-Code": employee.employee_code},
    )

    assert logout.status_code == 204, logout.text
    assert logout.headers.get_list("set-cookie") == []
    assert client.cookies.get(PIN_CHANGE_COOKIE) == challenge_token
    db_session.expire_all()
    challenge_row = db_session.query(OperatorSession).filter_by(purpose="pin_change").one()
    assert challenge_row.revoked_at is not None
    client.cookies.set(PIN_CHANGE_COOKIE, challenge_token)
    replay = client.post(
        "/api/operator-session/complete-pin-change",
        json={"employee_id": str(employee.employee_id), "new_pin": "1357"},
    )
    assert replay.status_code == 401, replay.text
    db_session.refresh(employee)
    assert employee.pin_requires_change is True
    assert verify_pin(employee.pin_hash, "0000") is True


def test_legacy_verify_pin_alias_uses_same_db_session_contract(db_session, client) -> None:
    employee = _employee(
        db_session,
        code="LOGIN-07",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )

    response = client.post(
        f"/api/employees/{employee.employee_id}/verify-pin",
        json={"pin": "2468"},
    )

    assert response.status_code == 200, response.text
    assert OPERATOR_COOKIE in response.cookies
    assert db_session.query(OperatorSession).filter_by(purpose="operator").count() == 1


def test_login_commit_failure_rolls_back_hash_and_never_issues_cookie(
    db_session,
    client,
    monkeypatch,
) -> None:
    legacy_hash = _legacy_hash("2468")
    employee = _employee(
        db_session,
        code="LOGIN-08",
        pin_hash=legacy_hash,
        pin_requires_change=False,
    )

    def _fail_commit() -> None:
        raise RuntimeError("commit failed")

    monkeypatch.setattr(db_session, "commit", _fail_commit)
    with pytest.raises(RuntimeError, match="commit failed"):
        client.post(
            "/api/operator-session",
            json={"employee_id": str(employee.employee_id), "pin": "2468"},
        )

    assert OPERATOR_COOKIE not in client.cookies
    db_session.expire_all()
    stored = db_session.get(Employee, employee.employee_id)
    assert stored is not None
    assert stored.pin_hash == legacy_hash
    assert db_session.query(OperatorSession).count() == 0


@pytest.mark.parametrize(
    ("failure_type", "expected_status", "expected_code", "safe_code"),
    [
        (IntegrityError, 409, "DB_INTEGRITY", "gkpj"),
        (OperationalError, 503, "DB_UNAVAILABLE", "e3q8"),
        (DataError, 500, "INTERNAL", "9h9h"),
    ],
)
def test_operator_session_insert_failure_logs_only_safe_db_metadata(
    db_session,
    client,
    monkeypatch,
    caplog,
    failure_type,
    expected_status: int,
    expected_code: str,
    safe_code: str,
) -> None:
    employee = _employee(
        db_session,
        code=f"LOGIN-DB-{safe_code}",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    markers = {
        "PIN-SECRET-MARKER",
        "TOKEN-SECRET-MARKER",
        "DIGEST-SECRET-MARKER",
        "SESSION-UUID-SECRET-MARKER",
        "ORIG-SECRET-MARKER",
    }
    failure = failure_type(
        "INSERT INTO operator_sessions VALUES "
        "('SESSION-UUID-SECRET-MARKER', 'DIGEST-SECRET-MARKER') "
        "/* TOKEN-SECRET-MARKER */",
        {
            "pin": "PIN-SECRET-MARKER",
            "token_hash": "DIGEST-SECRET-MARKER",
        },
        RuntimeError("ORIG-SECRET-MARKER"),
    )
    original_rollback = db_session.rollback
    rollback_calls = 0

    def _fail_commit() -> None:
        raise failure

    def _track_rollback() -> None:
        nonlocal rollback_calls
        rollback_calls += 1
        original_rollback()

    monkeypatch.setattr(db_session, "commit", _fail_commit)
    monkeypatch.setattr(db_session, "rollback", _track_rollback)
    logger = logging.getLogger("mes")
    caplog.set_level(logging.DEBUG, logger="mes")
    logger.addHandler(caplog.handler)
    boundary_client = (
        TestClient(client.app, raise_server_exceptions=False)
        if failure_type is DataError
        else client
    )
    try:
        response = boundary_client.post(
            "/api/operator-session",
            json={"employee_id": str(employee.employee_id), "pin": "2468"},
        )
    finally:
        logger.removeHandler(caplog.handler)
        if boundary_client is not client:
            boundary_client.close()

    assert response.status_code == expected_status, response.text
    assert response.json()["detail"]["code"] == expected_code
    assert rollback_calls == 1
    assert OPERATOR_COOKIE not in response.cookies
    assert OPERATOR_COOKIE not in boundary_client.cookies
    assert db_session.query(OperatorSession).count() == 0
    assert all(marker not in caplog.text for marker in markers)
    assert f"err_type={failure_type.__name__}" in caplog.text
    assert f"sa_code={safe_code}" in caplog.text


def test_logout_commit_failure_does_not_mutate_browser_cookie(
    db_session,
    client,
    monkeypatch,
) -> None:
    employee = _employee(
        db_session,
        code="LOGIN-09",
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    assert client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
    ).status_code == 200
    operator_token = client.cookies.get(OPERATOR_COOKIE)

    def _fail_commit() -> None:
        raise RuntimeError("commit failed")

    monkeypatch.setattr(db_session, "commit", _fail_commit)
    response = client.delete("/api/operator-session")

    assert response.status_code == 503, response.text
    assert response.json()["detail"]["code"] == "DB_UNAVAILABLE"
    assert response.headers.get_list("set-cookie") == []
    assert client.cookies.get(OPERATOR_COOKIE) == operator_token
    db_session.expire_all()
    assert db_session.query(OperatorSession).one().revoked_at is None


@pytest.mark.parametrize("failure", ["audit", "commit"])
def test_initial_pin_change_failure_rolls_back_employee_challenge_and_cookie(
    db_session,
    client,
    monkeypatch,
    failure: str,
) -> None:
    from app.routers import operator_sessions

    employee = _employee(
        db_session,
        code=f"LOGIN-ROLLBACK-{failure}",
        pin_hash=hash_pin("0000"),
        pin_requires_change=True,
    )
    challenged = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "0000"},
    )
    assert challenged.status_code == 409
    assert PIN_CHANGE_COOKIE in client.cookies

    if failure == "audit":
        monkeypatch.setattr(
            operator_sessions.audit,
            "record",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("audit failed")),
        )
    else:
        monkeypatch.setattr(
            db_session,
            "commit",
            lambda: (_ for _ in ()).throw(RuntimeError("commit failed")),
        )

    with pytest.raises(RuntimeError, match=f"{failure} failed"):
        client.post(
            "/api/operator-session/complete-pin-change",
            json={"employee_id": str(employee.employee_id), "new_pin": "1357"},
        )

    assert PIN_CHANGE_COOKIE in client.cookies
    db_session.expire_all()
    stored = db_session.get(Employee, employee.employee_id)
    challenge = db_session.query(OperatorSession).filter_by(purpose="pin_change").one()
    assert stored is not None
    assert stored.pin_requires_change is True
    assert verify_pin(stored.pin_hash, "0000") is True
    assert challenge.consumed_at is None
    assert challenge.revoked_at is None
