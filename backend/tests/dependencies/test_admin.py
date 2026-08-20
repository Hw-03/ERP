"""require_admin_pin Depends adapter 단위 테스트.

케이스:
1. 헤더(X-Admin-Pin)로 유효 PIN → 200
2. body(pin)로 유효 PIN → 200 (기존 호환)
3. query param(pin)은 로그 노출 방지를 위해 거부 → 400
4. 잘못된 PIN → 403
5. PIN 누락 → 400
6. 헤더 + body 모두 있을 때 헤더 우선
7. GET endpoint에 적용(body 없음) — 헤더만 수신
"""

from __future__ import annotations

import hashlib

import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from typing import Annotated
from sqlalchemy.orm import Session

from app.dependencies.admin import require_admin_pin
from app.dependencies.verified_actor import require_current_actor
from app.database import get_db
from app.models import DepartmentEnum, Employee, EmployeeLevelEnum, SystemSetting
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin, verify_pin


# ───── 테스트용 미니 앱 ─────────────────────────────────────────────────────


def _build_app(db_session: Session) -> FastAPI:
    """db_session을 override한 테스트 전용 FastAPI 앱."""
    test_app = FastAPI()

    # GET 엔드포인트 (body 없는 경우 테스트용)
    @test_app.get("/protected")
    def _get_protected(_admin: Annotated[None, Depends(require_admin_pin)]):
        return {"ok": True}

    # POST 엔드포인트 (body 있는 경우 테스트용)
    @test_app.post("/protected")
    def _post_protected(_admin: Annotated[None, Depends(require_admin_pin)]):
        return {"ok": True}

    def _override_db():
        try:
            yield db_session
        finally:
            pass

    actor = _add_operator(db_session, "ADMIN-DEPENDENCY-ACTOR")

    test_app.dependency_overrides[get_db] = _override_db
    test_app.dependency_overrides[require_current_actor] = lambda: actor
    return test_app


def _add_operator(db_session: Session, code: str) -> Employee:
    employee = Employee(
        employee_code=code,
        name=code,
        role="작업자",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    db_session.add(employee)
    db_session.commit()
    return employee


@pytest.fixture()
def protected_client(db_session):
    """require_admin_pin Depends가 있는 테스트 엔드포인트용 TestClient."""
    app = _build_app(db_session)
    with TestClient(app) as c:
        yield c


# ───── 케이스 1: 헤더로 유효 PIN ────────────────────────────────────────────


def test_valid_pin_via_header(protected_client):
    """X-Admin-Pin 헤더로 올바른 PIN 전달 → 200."""
    resp = protected_client.post("/protected", headers={"X-Admin-Pin": "0000"})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ok": True}


# ───── 케이스 2: body로 유효 PIN (기존 호환) ────────────────────────────────


def test_valid_pin_via_body(protected_client):
    """body의 pin 필드로 올바른 PIN 전달 → 200 (기존 클라이언트 호환)."""
    resp = protected_client.post("/protected", json={"pin": "0000"})
    assert resp.status_code == 200, resp.text


# ───── 케이스 3: query param PIN 거부 ────────────────────────────────────────


def test_query_pin_is_rejected(protected_client):
    """access log에 남는 query string PIN은 유효해도 거부한다."""
    resp = protected_client.post("/protected?pin=0000")
    assert resp.status_code == 400, resp.text


# ───── 케이스 4: 잘못된 PIN → 403 ───────────────────────────────────────────


def test_wrong_pin_via_header_403(protected_client):
    """틀린 PIN → 403 FORBIDDEN."""
    resp = protected_client.post("/protected", headers={"X-Admin-Pin": "9999"})
    assert resp.status_code == 403, resp.text
    assert resp.json()["detail"]["code"] == "BAD_REQUEST"


def test_wrong_pin_via_body_403(protected_client):
    """body로 틀린 PIN → 403."""
    resp = protected_client.post("/protected", json={"pin": "9999"})
    assert resp.status_code == 403, resp.text


# ───── 케이스 5: PIN 누락 → 400 ─────────────────────────────────────────────


def test_missing_pin_400(protected_client):
    """헤더·body·query 어디에도 PIN 없음 → 400 BAD_REQUEST."""
    resp = protected_client.post("/protected", json={})
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"]["code"] == "BAD_REQUEST"


def test_missing_pin_no_body_400(protected_client):
    """body 자체 없이 전달 → 400."""
    resp = protected_client.post("/protected")
    assert resp.status_code == 400, resp.text


# ───── 케이스 6: 헤더 + body 모두 있을 때 헤더 우선 ─────────────────────────


def test_header_takes_priority_over_body(protected_client):
    """X-Admin-Pin 헤더(올바름)가 body pin(틀림)보다 우선 → 200."""
    resp = protected_client.post(
        "/protected",
        json={"pin": "9999"},  # 틀린 PIN
        headers={"X-Admin-Pin": "0000"},  # 올바른 PIN
    )
    assert resp.status_code == 200, resp.text


def test_header_wrong_body_correct_uses_header(protected_client):
    """헤더가 틀리면 body가 올바르더라도 헤더를 먼저 사용해 실패 → 403."""
    resp = protected_client.post(
        "/protected",
        json={"pin": "0000"},  # 올바른 PIN
        headers={"X-Admin-Pin": "9999"},  # 틀린 PIN
    )
    assert resp.status_code == 403, resp.text


# ───── 케이스 7: GET endpoint (body 없음) — 헤더만 수신 ─────────────────────


def test_get_endpoint_header_pin(protected_client):
    """GET 엔드포인트에서 X-Admin-Pin 헤더로 인증 → 200."""
    resp = protected_client.get("/protected", headers={"X-Admin-Pin": "0000"})
    assert resp.status_code == 200, resp.text


def test_get_endpoint_query_pin_is_rejected(protected_client):
    """GET 엔드포인트도 query PIN을 인증 수단으로 사용하지 않는다."""
    resp = protected_client.get("/protected?pin=0000")
    assert resp.status_code == 400, resp.text


def test_get_endpoint_missing_setting_authenticates_without_creating_pin(
    protected_client,
    db_session,
):
    assert db_session.query(SystemSetting).filter_by(setting_key="admin_pin").count() == 0

    resp = protected_client.get("/protected", headers={"X-Admin-Pin": "0000"})

    assert resp.status_code == 200, resp.text
    assert db_session.query(SystemSetting).filter_by(setting_key="admin_pin").count() == 0
    assert not db_session.new


def test_get_endpoint_legacy_plaintext_pin_authenticates_without_migration(
    protected_client,
    db_session,
):
    setting = SystemSetting(setting_key="admin_pin", setting_value="0000")
    db_session.add(setting)
    db_session.commit()

    resp = protected_client.get("/protected", headers={"X-Admin-Pin": "0000"})

    assert resp.status_code == 200, resp.text
    db_session.refresh(setting)
    assert setting.setting_value == "0000"


@pytest.mark.parametrize("method", ["GET", "POST"])
@pytest.mark.parametrize(
    "stored_kind",
    ["pbkdf2", "legacy_sha256", "malformed_pbkdf2"],
)
def test_admin_pin_rejects_stored_verifier_as_presented_credential(
    protected_client,
    db_session,
    method,
    stored_kind,
):
    if stored_kind == "pbkdf2":
        stored_value = hash_pin("2468")
    elif stored_kind == "legacy_sha256":
        stored_value = DEFAULT_PIN_HASH
    else:
        stored_value = "pbkdf2_sha256$600000$broken"
    setting = SystemSetting(setting_key="admin_pin", setting_value=stored_value)
    db_session.add(setting)
    db_session.commit()

    response = protected_client.request(
        method,
        "/protected",
        headers={"X-Admin-Pin": stored_value},
    )

    assert response.status_code == 403, response.text
    db_session.refresh(setting)
    assert setting.setting_value == stored_value


def test_post_endpoint_keeps_lazy_pin_creation(protected_client, db_session):
    resp = protected_client.post("/protected", headers={"X-Admin-Pin": "0000"})

    assert resp.status_code == 200, resp.text
    setting = next(
        row
        for row in db_session.new
        if isinstance(row, SystemSetting) and row.setting_key == "admin_pin"
    )
    assert setting.setting_value == hashlib.sha256(b"0000").hexdigest()
    assert verify_pin(setting.setting_value, "0000")
    db_session.flush()
    assert (
        db_session.query(SystemSetting).filter_by(setting_key="admin_pin").one()
        is setting
    )


def test_mutating_auth_stages_pbkdf2_admin_pin_recovery_for_the_owner_commit(
    protected_client,
    db_session,
):
    setting = SystemSetting(setting_key="admin_pin", setting_value=hash_pin("2468"))
    db_session.add(setting)
    db_session.commit()

    response = protected_client.post(
        "/protected",
        headers={"X-Admin-Pin": "2468"},
    )

    assert response.status_code == 200, response.text
    assert setting.setting_value == hashlib.sha256(b"2468").hexdigest()
    assert setting in db_session.dirty


def test_mutating_admin_dependency_locks_the_shared_credential(
    protected_client,
    monkeypatch,
):
    from app.routers import settings

    real_ensure_admin_pin = settings.ensure_admin_pin
    lock_requests: list[bool] = []

    def tracked_ensure_admin_pin(
        db,
        *,
        commit_if_created: bool = True,
        lock_for_update: bool = False,
    ):
        lock_requests.append(lock_for_update)
        return real_ensure_admin_pin(
            db,
            commit_if_created=commit_if_created,
            lock_for_update=lock_for_update,
        )

    monkeypatch.setattr(settings, "ensure_admin_pin", tracked_ensure_admin_pin)

    response = protected_client.post(
        "/protected",
        headers={"X-Admin-Pin": "0000"},
    )

    assert response.status_code == 200, response.text
    assert lock_requests == [True]


def test_get_endpoint_missing_pin_400(protected_client):
    """GET 엔드포인트에서 PIN 누락 → 400."""
    resp = protected_client.get("/protected")
    assert resp.status_code == 400, resp.text


def test_admin_pin_failures_share_one_client_ip_key_across_endpoints(protected_client):
    """GET/POST를 번갈아도 10회 실패 경계를 우회할 수 없다."""
    for attempt in range(10):
        if attempt % 2:
            response = protected_client.get(
                "/protected",
                headers={"X-Admin-Pin": "9999"},
            )
        else:
            response = protected_client.post(
                "/protected",
                headers={"X-Admin-Pin": "9999"},
            )
        assert response.status_code == 403, response.text

    blocked = protected_client.get(
        "/protected",
        headers={"X-Admin-Pin": "0000"},
    )
    assert blocked.status_code == 429, blocked.text
    assert blocked.json()["detail"]["code"] == "TOO_MANY_REQUESTS"


def test_admin_pin_success_resets_shared_endpoint_failure_key(protected_client):
    for attempt in range(5):
        method = protected_client.get if attempt % 2 else protected_client.post
        assert method(
            "/protected",
            headers={"X-Admin-Pin": "9999"},
        ).status_code == 403

    assert protected_client.post(
        "/protected",
        headers={"X-Admin-Pin": "0000"},
    ).status_code == 200

    for attempt in range(10):
        method = protected_client.get if attempt % 2 else protected_client.post
        assert method(
            "/protected",
            headers={"X-Admin-Pin": "9999"},
        ).status_code == 403

    assert protected_client.post(
        "/protected",
        headers={"X-Admin-Pin": "0000"},
    ).status_code == 429


def test_anonymous_admin_attempts_neither_read_audit_nor_consume_actor_budget(
    auth_client,
    db_session,
) -> None:
    employee = _add_operator(db_session, "ADMIN-LIMIT-A")

    for _ in range(10):
        response = auth_client.get(
            "/api/admin/audit-logs",
            headers={"X-Admin-Pin": "9999"},
        )
        assert response.status_code == 401, response.text

    assert auth_client.get(
        "/api/admin/audit-logs",
        headers={"X-Admin-Pin": "0000"},
    ).status_code == 401

    login = auth_client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
    )
    assert login.status_code == 200, login.text
    allowed = auth_client.get(
        "/api/admin/audit-logs",
        headers={"X-Admin-Pin": "0000"},
    )
    assert allowed.status_code == 200, allowed.text


def test_admin_pin_failure_budget_is_isolated_by_verified_actor(
    auth_client,
    db_session,
) -> None:
    employee_a = _add_operator(db_session, "ADMIN-LIMIT-B1")
    employee_b = _add_operator(db_session, "ADMIN-LIMIT-B2")

    assert auth_client.post(
        "/api/operator-session",
        json={"employee_id": str(employee_a.employee_id), "pin": "2468"},
    ).status_code == 200
    cookie_a = auth_client.cookies.get("dexcowin_operator_session")
    assert cookie_a
    auth_client.cookies.clear()
    assert auth_client.post(
        "/api/operator-session",
        json={"employee_id": str(employee_b.employee_id), "pin": "2468"},
    ).status_code == 200
    cookie_b = auth_client.cookies.get("dexcowin_operator_session")
    assert cookie_b

    auth_client.cookies.clear()
    auth_client.cookies.set("dexcowin_operator_session", cookie_a)
    for _ in range(10):
        rejected = auth_client.get(
            "/api/admin/audit-logs",
            headers={"X-Admin-Pin": "9999"},
        )
        assert rejected.status_code == 403, rejected.text
    assert auth_client.get(
        "/api/admin/audit-logs",
        headers={"X-Admin-Pin": "0000"},
    ).status_code == 429

    auth_client.cookies.clear()
    auth_client.cookies.set("dexcowin_operator_session", cookie_b)
    allowed = auth_client.get(
        "/api/admin/audit-logs",
        headers={"X-Admin-Pin": "0000"},
    )
    assert allowed.status_code == 200, allowed.text
