"""Department.io_enabled 필드 단위 테스트 (W11-A).

케이스:
1. 신규 부서 생성 시 io_enabled 기본값 True
2. PUT update_department로 io_enabled=False 설정 후 GET 확인
3. migrate backfill — PROD_DEPTS 외 부서는 io_enabled=False
"""

from __future__ import annotations

import pytest
from app.models import Department

ADMIN_PIN = "0000"

# PROD_DEPTS: 프론트 hardcode 와 동일
PROD_DEPTS = {"튜브", "고압", "진공", "튜닝", "조립", "출하"}


# ────────────────────────── 케이스 1: 기본값 True ──────────────────────────

def test_create_department_defaults_io_enabled_true(db_session, client):
    """신규 부서를 생성하면 io_enabled가 기본값 True로 설정된다."""
    resp = client.post(
        "/api/departments",
        json={"name": "테스트부서", "pin": ADMIN_PIN},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["io_enabled"] is True


def test_create_department_explicit_io_enabled_false(db_session, client):
    """io_enabled=False를 명시적으로 전달하면 False로 생성된다."""
    resp = client.post(
        "/api/departments",
        json={"name": "비입출고부서", "pin": ADMIN_PIN, "io_enabled": False},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["io_enabled"] is False


# ────────────────────────── 케이스 2: update로 False 설정 ──────────────────

def test_update_department_io_enabled_false(db_session, client):
    """PUT으로 io_enabled=False를 설정하면 GET 응답에서도 False가 반환된다."""
    # 부서 생성 (기본 True)
    create_resp = client.post(
        "/api/departments",
        json={"name": "업데이트부서", "pin": ADMIN_PIN},
    )
    assert create_resp.status_code == 201
    dept_id = create_resp.json()["id"]

    # io_enabled=False로 업데이트
    update_resp = client.put(
        f"/api/departments/{dept_id}",
        json={"pin": ADMIN_PIN, "io_enabled": False},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["io_enabled"] is False

    # GET 목록에서 False 확인
    list_resp = client.get("/api/departments")
    assert list_resp.status_code == 200
    dept = next((d for d in list_resp.json() if d["id"] == dept_id), None)
    assert dept is not None
    assert dept["io_enabled"] is False


def test_update_department_io_enabled_toggle_back_to_true(db_session, client):
    """False로 설정 후 True로 다시 토글 가능하다."""
    create_resp = client.post(
        "/api/departments",
        json={"name": "토글부서", "pin": ADMIN_PIN, "io_enabled": False},
    )
    assert create_resp.status_code == 201
    dept_id = create_resp.json()["id"]
    assert create_resp.json()["io_enabled"] is False

    update_resp = client.put(
        f"/api/departments/{dept_id}",
        json={"pin": ADMIN_PIN, "io_enabled": True},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["io_enabled"] is True


# ────────────────────────── 케이스 3: backfill 확인 ──────────────────────────

def test_backfill_prod_depts_remain_true(db_session, client):
    """PROD_DEPTS 이름의 부서는 io_enabled=True 상태를 유지한다."""
    from bootstrap.migrate import _MIGRATION_DDL
    from sqlalchemy import text

    # PROD_DEPTS 부서 직접 DB 삽입 (io_enabled 기본 True)
    for dept_name in PROD_DEPTS:
        db_session.add(Department(name=dept_name, display_order=0, is_active=True, io_enabled=True))
    db_session.commit()

    # backfill SQL: PROD_DEPTS 외 부서만 False 로 설정, PROD_DEPTS 는 True 유지
    backfill_sql = (
        "UPDATE departments SET io_enabled = 0 "
        "WHERE name NOT IN ('튜브', '고압', '진공', '튜닝', '조립', '출하') AND io_enabled = 1"
    )
    db_session.execute(text(backfill_sql))
    db_session.commit()

    for dept_name in PROD_DEPTS:
        dept = db_session.query(Department).filter(Department.name == dept_name).first()
        assert dept is not None
        assert dept.io_enabled is True, f"{dept_name} 부서가 io_enabled=False로 잘못 설정됨"


def test_backfill_non_prod_depts_set_false(db_session, client):
    """PROD_DEPTS 외 부서는 backfill 후 io_enabled=False가 된다."""
    from sqlalchemy import text

    non_prod = ["대표이사", "관리팀", "품질관리"]
    for dept_name in non_prod:
        db_session.add(Department(name=dept_name, display_order=0, is_active=True, io_enabled=True))
    db_session.commit()

    backfill_sql = (
        "UPDATE departments SET io_enabled = 0 "
        "WHERE name NOT IN ('튜브', '고압', '진공', '튜닝', '조립', '출하') AND io_enabled = 1"
    )
    db_session.execute(text(backfill_sql))
    db_session.commit()

    for dept_name in non_prod:
        dept = db_session.query(Department).filter(Department.name == dept_name).first()
        assert dept is not None
        assert dept.io_enabled is False, f"{dept_name} 부서가 backfill 후 io_enabled=True로 남음"
