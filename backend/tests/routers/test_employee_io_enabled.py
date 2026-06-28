"""Employee.io_enabled 필드 단위 테스트 (W12-#7).

부서 io_enabled 와 AND 결합되는 직원별 입출고 권한 토글.
백엔드는 라운드트립(CRUD)만 책임지고 실제 입출고 화면 차단은 프론트엔드 canEnterIO 가드에서 처리한다.

케이스:
1. 신규 직원 생성 시 io_enabled 기본값 True
2. 생성 시 io_enabled=False 명시 → False 로 저장
3. PUT update_employee 로 io_enabled 토글
4. GET list 응답에 io_enabled 포함
5. 마이그레이션 백필 — 직원.io_enabled 가 부서.io_enabled 로 복사
"""

from __future__ import annotations

from sqlalchemy import text

from app.models import Department, Employee, EmployeeLevelEnum

ADMIN_HEADERS = {"X-Admin-Pin": "0000"}


def _emp_payload(**overrides):
    base = {
        "name": "홍길동",
        "role": "조립/사원",
        "department": "조립",
        "level": "staff",
        "warehouse_role": "none",
        "department_role": "none",
        "display_order": 0,
        "is_active": True,
    }
    base.update(overrides)
    return base


# ────────────────────────── 케이스 1: 기본값 True ──────────────────────────


def test_create_employee_defaults_io_enabled_true(db_session, client):
    """신규 직원 생성 시 io_enabled 가 기본값 True 로 설정된다."""
    resp = client.post("/api/employees", headers=ADMIN_HEADERS, json=_emp_payload(name="기본권한"))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["io_enabled"] is True


def test_create_employee_explicit_io_enabled_false(db_session, client):
    """io_enabled=False 를 명시적으로 전달하면 False 로 생성된다."""
    resp = client.post(
        "/api/employees",
        headers=ADMIN_HEADERS,
        json=_emp_payload(name="차단직원", io_enabled=False),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["io_enabled"] is False


# ────────────────────────── 케이스 2: update 토글 ──────────────────────────


def test_update_employee_io_enabled_false(db_session, client):
    """PUT 으로 io_enabled=False 설정 시 응답·재조회 모두 False."""
    create_resp = client.post("/api/employees", headers=ADMIN_HEADERS, json=_emp_payload(name="업데이트직원"))
    assert create_resp.status_code == 201
    emp_id = create_resp.json()["employee_id"]
    assert create_resp.json()["io_enabled"] is True

    update_resp = client.put(
        f"/api/employees/{emp_id}",
        headers=ADMIN_HEADERS,
        json={"io_enabled": False},
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["io_enabled"] is False

    # 목록에서도 False
    list_resp = client.get("/api/employees")
    assert list_resp.status_code == 200
    emp = next((e for e in list_resp.json() if e["employee_id"] == emp_id), None)
    assert emp is not None
    assert emp["io_enabled"] is False


def test_update_employee_io_enabled_toggle_back_to_true(db_session, client):
    """False 로 생성 → True 로 토글."""
    create_resp = client.post(
        "/api/employees",
        headers=ADMIN_HEADERS,
        json=_emp_payload(name="토글직원", io_enabled=False),
    )
    assert create_resp.status_code == 201
    emp_id = create_resp.json()["employee_id"]
    assert create_resp.json()["io_enabled"] is False

    update_resp = client.put(
        f"/api/employees/{emp_id}",
        headers=ADMIN_HEADERS,
        json={"io_enabled": True},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["io_enabled"] is True


# ────────────────────────── 케이스 3: GET 목록 ──────────────────────────


def test_list_employees_returns_io_enabled(db_session, client):
    """GET /api/employees 응답에 io_enabled 필드가 포함된다."""
    client.post("/api/employees", headers=ADMIN_HEADERS, json=_emp_payload(name="목록직원1"))
    client.post(
        "/api/employees",
        headers=ADMIN_HEADERS,
        json=_emp_payload(name="목록직원2", io_enabled=False),
    )

    resp = client.get("/api/employees")
    assert resp.status_code == 200
    for emp in resp.json():
        assert "io_enabled" in emp
        assert isinstance(emp["io_enabled"], bool)


# ────────────────────────── 케이스 4: 마이그레이션 백필 ──────────────────────────


def test_backfill_employee_io_enabled_copies_department(db_session, client):
    """백필 SQL — employees.io_enabled 가 본인 부서의 io_enabled 값으로 복사된다."""
    # 부서 2개 (io_enabled True / False)
    dept_open = Department(name="개방부서", display_order=0, is_active=True, io_enabled=True)
    dept_closed = Department(name="폐쇄부서", display_order=1, is_active=True, io_enabled=False)
    db_session.add_all([dept_open, dept_closed])
    db_session.flush()

    # 직원 2명 — 일단 둘 다 io_enabled=True 로 시작 (ALTER ... DEFAULT 1 단계 직후 상태 모사)
    emp_open = Employee(
        employee_code="ETBF1",
        name="개방직원",
        role="r",
        department="개방부서",
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active="true",
        io_enabled=True,
    )
    emp_closed = Employee(
        employee_code="ETBF2",
        name="폐쇄직원",
        role="r",
        department="폐쇄부서",
        level=EmployeeLevelEnum.STAFF,
        display_order=1,
        is_active="true",
        io_enabled=True,
    )
    db_session.add_all([emp_open, emp_closed])
    db_session.commit()

    # bootstrap/migrate.py 의 백필 SQL 과 동일
    backfill_sql = (
        "UPDATE employees SET io_enabled = ("
        "SELECT departments.io_enabled FROM departments WHERE departments.name = employees.department"
        ") WHERE EXISTS ("
        "SELECT 1 FROM departments WHERE departments.name = employees.department"
        ")"
    )
    db_session.execute(text(backfill_sql))
    db_session.commit()

    db_session.refresh(emp_open)
    db_session.refresh(emp_closed)
    assert bool(emp_open.io_enabled) is True, "개방부서 직원은 io_enabled True 유지"
    assert bool(emp_closed.io_enabled) is False, "폐쇄부서 직원은 io_enabled False 로 복사"


def test_repeated_migration_does_not_overwrite_saved_employee_io_enabled(db_session, monkeypatch):
    """Existing employees.io_enabled values must survive repeated migrations."""
    from bootstrap import migrate

    dept = Department(name="NO_IO_DEPT", display_order=10, is_active=True, io_enabled=False)
    emp = Employee(
        employee_code="KEEP_IO",
        name="keep io",
        role="r",
        department="NO_IO_DEPT",
        level=EmployeeLevelEnum.STAFF,
        display_order=10,
        is_active="true",
        io_enabled=True,
    )
    db_session.add_all([dept, emp])
    db_session.commit()

    monkeypatch.setattr(migrate, "engine", db_session.bind)
    result = migrate.run_migrations()
    assert result["errors"] == []

    db_session.expire_all()
    saved = db_session.query(Employee).filter(Employee.employee_code == "KEEP_IO").one()
    assert bool(saved.io_enabled) is True


def test_create_employee_defaults_hidden_sidebar_tabs_empty(db_session, client):
    """New employees can see every sidebar tab unless explicitly restricted."""
    resp = client.post(
        "/api/employees",
        headers=ADMIN_HEADERS,
        json=_emp_payload(name="Default tabs"),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["hidden_sidebar_tabs"] == []


def test_update_employee_hidden_sidebar_tabs_round_trips(db_session, client):
    """Employee sidebar tab restrictions are saved and returned as tab id arrays."""
    create_resp = client.post(
        "/api/employees",
        headers=ADMIN_HEADERS,
        json=_emp_payload(name="Restricted tabs"),
    )
    assert create_resp.status_code == 201, create_resp.text
    emp_id = create_resp.json()["employee_id"]

    update_resp = client.put(
        f"/api/employees/{emp_id}",
        headers=ADMIN_HEADERS,
        json={"hidden_sidebar_tabs": ["weekly", "history"]},
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["hidden_sidebar_tabs"] == ["weekly", "history"]

    list_resp = client.get("/api/employees")
    assert list_resp.status_code == 200, list_resp.text
    emp = next(e for e in list_resp.json() if e["employee_id"] == emp_id)
    assert emp["hidden_sidebar_tabs"] == ["weekly", "history"]


def test_employee_hidden_sidebar_tabs_reject_unknown_tab(db_session, client):
    """Unknown sidebar tab ids are rejected instead of being silently stored."""
    resp = client.post(
        "/api/employees",
        headers=ADMIN_HEADERS,
        json=_emp_payload(name="Bad tabs", hidden_sidebar_tabs=["dashboard", "unknown"]),
    )
    assert resp.status_code == 422, resp.text


def test_employee_hidden_sidebar_tabs_reject_hiding_every_tab(db_session, client):
    """At least one desktop sidebar tab must remain visible for each employee."""
    all_tabs = [
        "dashboard",
        "warehouse",
        "shipping",
        "warehouseMap",
        "defect",
        "history",
        "weekly",
        "admin",
    ]
    resp = client.post(
        "/api/employees",
        headers=ADMIN_HEADERS,
        json=_emp_payload(name="No tabs", hidden_sidebar_tabs=all_tabs),
    )
    assert resp.status_code == 422, resp.text


def test_update_employee_rejects_hiding_last_admin_tab_access(db_session, client):
    """The last active employee with an admin tab visible cannot be locked out."""
    create_resp = client.post(
        "/api/employees",
        headers=ADMIN_HEADERS,
        json=_emp_payload(name="Only admin tab access"),
    )
    assert create_resp.status_code == 201, create_resp.text
    emp_id = create_resp.json()["employee_id"]

    resp = client.put(
        f"/api/employees/{emp_id}",
        headers=ADMIN_HEADERS,
        json={"hidden_sidebar_tabs": ["admin"]},
    )
    assert resp.status_code == 422, resp.text
