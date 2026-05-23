"""require_admin_pin Depends adapter 단위 테스트.

케이스:
1. 헤더(X-Admin-Pin)로 유효 PIN → 200
2. body(pin)로 유효 PIN → 200 (기존 호환)
3. query param(pin)으로 유효 PIN → 200 (deprecated 호환)
4. 잘못된 PIN → 403
5. PIN 누락 → 400
6. 헤더 + body 모두 있을 때 헤더 우선
7. GET endpoint에 적용(body 없음) — 헤더만 수신
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from typing import Annotated
from sqlalchemy.orm import Session

from app.dependencies.admin import require_admin_pin
from app.database import get_db


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

    test_app.dependency_overrides[get_db] = _override_db
    return test_app


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


# ───── 케이스 3: query param으로 유효 PIN (deprecated 호환) ─────────────────


def test_valid_pin_via_query(protected_client):
    """query string pin으로 올바른 PIN 전달 → 200 (deprecated 호환)."""
    resp = protected_client.post("/protected?pin=0000")
    assert resp.status_code == 200, resp.text


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


def test_get_endpoint_query_pin(protected_client):
    """GET 엔드포인트에서 query PIN 인증 → 200."""
    resp = protected_client.get("/protected?pin=0000")
    assert resp.status_code == 200, resp.text


def test_get_endpoint_missing_pin_400(protected_client):
    """GET 엔드포인트에서 PIN 누락 → 400."""
    resp = protected_client.get("/protected")
    assert resp.status_code == 400, resp.text
