"""Menu visibility changes use only the isolated TestClient database."""
from collections.abc import Iterator
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app import models
from app.routers import stocktakes
from app.services import realtime
from tests.routers.test_stocktakes import _token


URL = "/api/stocktakes/menu-visibility"
SETTING_KEY = "stocktake_menu_visible"
DEPARTMENTS = ["창고", "튜브", "고압", "진공", "튜닝", "조립", "출하"]


@pytest.fixture
def actor(db_session: Session) -> models.Employee:
    """Create an ordinary participant so reads never rely on management rights."""
    employee = models.Employee(employee_code="MENU-ACTOR", name="Menu actor", role="staff", department="조립")
    db_session.add(employee)
    db_session.commit()
    return employee


@pytest.fixture
def observed_revision(db_session: Session) -> Iterator[models.DataRevision]:
    """Observe real commit revision changes without enabling live DB listeners."""
    row = models.DataRevision(id=1, revision=0)
    db_session.add(row)
    db_session.commit()
    event.listen(db_session, "before_commit", realtime._advance_revision_before_commit)
    try:
        yield row
    finally:
        event.remove(db_session, "before_commit", realtime._advance_revision_before_commit)


def test_menu_visibility_defaults_off_and_get_does_not_write(
    client: TestClient, db_session: Session, actor: models.Employee, observed_revision: models.DataRevision,
) -> None:
    token = _token(client, actor)
    response = client.get(URL, headers={"X-Operator-Session": token})
    assert response.status_code == 200, response.text
    assert response.json() == {"enabled": False, "employee_visible": True,
                               "participant_departments": DEPARTMENTS, "participant_count": 1}
    assert db_session.get(models.SystemSetting, SETTING_KEY) is None
    assert db_session.query(models.AdminAuditLog).count() == 0
    db_session.refresh(observed_revision)
    assert observed_revision.revision == 0


@pytest.mark.parametrize("method", ["get", "put"])
def test_menu_visibility_requires_operator_session(client: TestClient, method: str) -> None:
    kwargs = {"json": {"enabled": True}} if method == "put" else {}
    response = getattr(client, method)(URL, **kwargs)
    assert response.status_code == 401, response.text


def test_menu_visibility_counts_only_active_participant_departments(
    client: TestClient, db_session: Session, actor: models.Employee,
) -> None:
    for index, department in enumerate(DEPARTMENTS):
        db_session.add(models.Employee(employee_code=f"MENU-{index}", name=f"Participant {index}",
            role="staff", department=department, hidden_sidebar_tabs="stocktake"))
    db_session.add_all([
        models.Employee(employee_code="MENU-INACTIVE", name="Inactive", role="staff", department="창고", is_active=False),
        models.Employee(employee_code="MENU-RESEARCH", name="Research", role="staff", department="연구"),
        models.Employee(employee_code="MENU-SALES", name="Sales", role="staff", department="영업"),
    ])
    db_session.commit()
    response = client.get(URL, headers={"X-Operator-Session": _token(client, actor)})
    assert response.status_code == 200, response.text
    assert response.json()["participant_count"] == len(DEPARTMENTS) + 1


@pytest.mark.parametrize("role", ["primary", "deputy"])
def test_round_managers_can_toggle_menu_and_record_actor(
    client: TestClient, db_session: Session, actor: models.Employee, role: str,
    observed_revision: models.DataRevision,
) -> None:
    actor.department_role = role
    actor.hidden_sidebar_tabs = "stocktake,weekly"
    db_session.flush()
    token = _token(client, actor)
    headers = {"X-Operator-Session": token}
    before_revision = db_session.get(models.DataRevision, 1).revision
    for index, enabled in enumerate([True, False], start=1):
        response = client.put(URL, headers=headers, json={"enabled": enabled})
        assert response.status_code == 200, response.text
        assert response.json() == {"enabled": enabled, "employee_visible": False,
                                   "participant_departments": DEPARTMENTS, "participant_count": 0}
        assert db_session.get(models.SystemSetting, SETTING_KEY).setting_value == str(enabled).lower()
        assert client.get(URL, headers=headers).json()["enabled"] is enabled
        db_session.refresh(observed_revision)
        assert observed_revision.revision == before_revision + index
    audits = db_session.query(models.AdminAuditLog).all()
    assert len(audits) == 2
    assert all(row.action == "stocktake.menu_visibility" and row.target_id == SETTING_KEY
        and row.actor_employee_code == actor.employee_code for row in audits)
    db_session.refresh(actor)
    assert actor.hidden_sidebar_tabs == "stocktake,weekly"
    assert actor.department_role == role


@pytest.mark.parametrize("warehouse_role", ["none", "primary", "deputy"])
def test_other_roles_cannot_toggle_menu(
    client: TestClient, db_session: Session, actor: models.Employee, warehouse_role: str,
) -> None:
    actor.warehouse_role = warehouse_role
    db_session.commit()
    response = client.put(URL, headers={"X-Operator-Session": _token(client, actor), "X-Admin-Pin": "0000"}, json={"enabled": True})
    assert response.status_code == 403, response.text
    assert db_session.get(models.SystemSetting, SETTING_KEY) is None
    assert db_session.query(models.AdminAuditLog).count() == 0


def test_role_revocation_blocks_toggle_with_existing_session(
    client: TestClient, db_session: Session, actor: models.Employee,
) -> None:
    actor.department_role = "primary"
    db_session.commit()
    token = _token(client, actor)
    actor.department_role = "none"
    db_session.commit()
    response = client.put(URL, headers={"X-Operator-Session": token}, json={"enabled": True})
    assert response.status_code == 403, response.text


@pytest.mark.parametrize("enabled", [None, "true", 1])
def test_menu_visibility_requires_boolean(
    client: TestClient, db_session: Session, actor: models.Employee, enabled: str | int | None,
) -> None:
    actor.department_role = "primary"
    db_session.commit()
    response = client.put(URL, headers={"X-Operator-Session": _token(client, actor)}, json={"enabled": enabled})
    assert response.status_code == 422, response.text


def test_put_uses_atomic_single_key_upsert_and_preserves_other_settings(
    client: TestClient, db_session: Session, actor: models.Employee, observed_revision: models.DataRevision,
) -> None:
    """Inspect the actual route's write SQL and repeated saves, not a mocked DB result."""
    old_time = datetime(2000, 1, 1)
    actor.department_role = "primary"
    db_session.add_all([
        models.SystemSetting(setting_key=SETTING_KEY, setting_value="false", updated_at=old_time),
        models.SystemSetting(setting_key="unrelated_menu_setting", setting_value="keep", updated_at=old_time),
    ])
    db_session.commit()
    headers = {"X-Operator-Session": _token(client, actor)}
    before_revision = db_session.get(models.DataRevision, 1).revision
    statements: list[str] = []
    connection = db_session.connection()

    def capture_sql(
        connection: Connection, cursor: object, statement: str, parameters: object,
        context: object, executemany: bool,
    ) -> None:
        """Keep only statements that can write the shared setting table."""
        if statement.upper().startswith(("INSERT INTO SYSTEM_SETTINGS", "UPDATE SYSTEM_SETTINGS")):
            statements.append(statement)

    event.listen(connection, "before_cursor_execute", capture_sql)
    try:
        for enabled in [True, True, False, False]:
            response = client.put(URL, headers=headers, json={"enabled": enabled})
            assert response.status_code == 200, response.text
            assert response.json()["enabled"] is enabled
    finally:
        event.remove(connection, "before_cursor_execute", capture_sql)
    assert len(statements) == 4
    assert all("ON CONFLICT (setting_key) DO UPDATE SET" in statement for statement in statements)
    assert db_session.query(models.SystemSetting).filter_by(setting_key=SETTING_KEY).count() == 1
    setting = db_session.get(models.SystemSetting, SETTING_KEY)
    assert setting.setting_value == "false"
    assert setting.updated_at > old_time
    unrelated = db_session.get(models.SystemSetting, "unrelated_menu_setting")
    assert (unrelated.setting_value, unrelated.updated_at) == ("keep", old_time)
    assert db_session.query(models.AdminAuditLog).filter_by(action="stocktake.menu_visibility").count() == 4
    db_session.refresh(observed_revision)
    assert observed_revision.revision == before_revision + 4


@pytest.mark.parametrize("value", ["true", "false"])
def test_postgres_menu_upsert_compiles_atomic_conflict_update(value: str) -> None:
    """Compile the route's PostgreSQL statement without claiming real concurrent execution."""
    build_statement = getattr(stocktakes, "_menu_visibility_upsert", None)
    assert callable(build_statement), "The route needs one dialect-aware atomic upsert statement."
    statement = build_statement("postgresql", value)
    compiled = statement.compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "INSERT INTO system_settings" in sql
    assert "ON CONFLICT (setting_key) DO UPDATE SET" in sql
    assert "setting_value = excluded.setting_value" in sql
    assert "updated_at = now()" in sql
    assert compiled.params["setting_key"] == SETTING_KEY
    assert compiled.params["setting_value"] == value


@pytest.mark.parametrize("enabled", [True, False])
def test_bulk_toggle_changes_every_target_employee_stocktake_bit_only(
    client: TestClient, db_session: Session, actor: models.Employee, enabled: bool,
) -> None:
    """Apply the bit across participant departments while retaining all other preferences."""
    actor.department_role = "primary"
    employees = []
    for index, department in enumerate(DEPARTMENTS):
        hidden = "weekly,stocktake,history" if index % 2 else "weekly,history"
        employee = models.Employee(employee_code=f"BULK-{index}", name=f"Participant {index}",
            role="staff", department=department, hidden_sidebar_tabs=hidden,
            warehouse_role="primary", io_enabled=False, as_research_approver=True)
        employees.append(employee)
    db_session.add_all(employees)
    db_session.commit()
    response = client.put(URL, headers={"X-Operator-Session": _token(client, actor)}, json={"enabled": enabled})
    assert response.status_code == 200, response.text
    assert response.json()["participant_count"] == len(DEPARTMENTS)
    for employee in employees:
        db_session.refresh(employee)
        assert employee.hidden_sidebar_tabs.split(",") == (["weekly", "history"] if enabled else ["weekly", "history", "stocktake"])
        assert (employee.department_role, employee.warehouse_role, employee.io_enabled,
                employee.as_research_approver) == ("none", "primary", False, True)
        personal = client.get("/api/employees")
        assert personal.status_code == 200, personal.text
        saved_employee = next(row for row in personal.json() if row["employee_id"] == str(employee.employee_id))
        assert ("stocktake" not in saved_employee["hidden_sidebar_tabs"]) is enabled


@pytest.mark.parametrize("enabled", [True, False])
def test_bulk_toggle_preserves_approver_inactive_and_other_departments(
    client: TestClient, db_session: Session, actor: models.Employee, enabled: bool,
) -> None:
    """Neither showing nor hiding may overwrite any employee outside the bulk target."""
    actor.department_role = "primary"
    exceptions = []
    variants = [
        {"department_role": "primary"}, {"department_role": "deputy"},
        {"is_active": False}, {"department": "연구"}, {"department": "영업"},
    ]
    for index, variant in enumerate(variants):
        for hidden in ["weekly", "weekly,stocktake"]:
            values = {"department": "조립", **variant}
            employee = models.Employee(employee_code=f"EXCLUDE-{index}-{len(exceptions)}",
                name="Excluded employee", role="staff", hidden_sidebar_tabs=hidden, **values)
            exceptions.append((employee, hidden))
            db_session.add(employee)
    db_session.commit()
    response = client.put(URL, headers={"X-Operator-Session": _token(client, actor)}, json={"enabled": enabled})
    assert response.status_code == 200, response.text
    assert response.json()["participant_count"] == 0
    for employee, hidden in exceptions:
        db_session.refresh(employee)
        assert employee.hidden_sidebar_tabs == hidden


@pytest.mark.parametrize("enabled", [True, False])
def test_personal_employee_edit_overrides_bulk_and_same_bulk_value_reapplies(
    client: TestClient, db_session: Session, actor: models.Employee, enabled: bool,
) -> None:
    """The real employee edit endpoint independently wins until the next bulk save."""
    manager = models.Employee(employee_code="BULK-MANAGER", name="Manager", role="staff",
                              department="조립", department_role="primary")
    actor.hidden_sidebar_tabs = "weekly"
    db_session.add(manager)
    db_session.commit()
    actor_headers = {"X-Operator-Session": _token(client, actor)}
    manager_headers = {"X-Operator-Session": _token(client, manager)}
    response = client.put(URL, headers=manager_headers, json={"enabled": enabled})
    assert response.status_code == 200, response.text
    assert client.get(URL, headers=actor_headers).json()["employee_visible"] is enabled
    personal_tabs = ["weekly", "stocktake"] if enabled else ["weekly"]
    response = client.put(f"/api/employees/{actor.employee_id}", headers={"X-Admin-Pin": "0000"},
                          json={"hidden_sidebar_tabs": personal_tabs})
    assert response.status_code == 200, response.text
    personal = client.get(URL, headers=actor_headers)
    assert personal.status_code == 200, personal.text
    assert personal.json()["enabled"] is enabled
    assert personal.json()["employee_visible"] is not enabled
    response = client.put(URL, headers=manager_headers, json={"enabled": enabled})
    assert response.status_code == 200, response.text
    assert client.get(URL, headers=actor_headers).json()["employee_visible"] is enabled
    db_session.refresh(actor)
    assert actor.hidden_sidebar_tabs == ("weekly" if enabled else "weekly,stocktake")


@pytest.mark.parametrize("hidden", ["", "stocktake,weekly"])
@pytest.mark.parametrize("setting_value", [None, "true", "false"])
def test_get_employee_visible_uses_personal_bit_without_bulk_gate(
    client: TestClient, db_session: Session, actor: models.Employee,
    hidden: str, setting_value: str | None,
) -> None:
    """The last bulk command must not act as a continuing AND/OR visibility gate."""
    actor.hidden_sidebar_tabs = hidden
    if setting_value is not None:
        db_session.add(models.SystemSetting(setting_key=SETTING_KEY, setting_value=setting_value))
    db_session.commit()
    response = client.get(URL, headers={"X-Operator-Session": _token(client, actor)})
    assert response.status_code == 200, response.text
    assert response.json()["employee_visible"] is ("stocktake" not in hidden.split(","))


def test_bulk_toggle_preserves_legacy_effective_io_hidden_tabs(
    client: TestClient, db_session: Session, actor: models.Employee,
) -> None:
    """Adding the stocktake bit cannot disable the legacy hidden IO-tab fallback."""
    manager = models.Employee(employee_code="LEGACY-MANAGER", name="Manager", role="staff", department_role="primary")
    actor.io_enabled = False
    actor.hidden_sidebar_tabs = ""
    db_session.add(manager)
    db_session.commit()
    headers = {"X-Operator-Session": _token(client, manager)}
    for enabled in [False, True]:
        response = client.put(URL, headers=headers, json={"enabled": enabled})
        assert response.status_code == 200, response.text
        personal = client.get("/api/employees")
        assert personal.status_code == 200, personal.text
        saved_employee = next(row for row in personal.json() if row["employee_id"] == str(actor.employee_id))
        assert saved_employee["hidden_sidebar_tabs"] == (["warehouse", "defect"] if enabled else ["warehouse", "defect", "stocktake"])
        db_session.refresh(actor)
        assert actor.io_enabled is False


@pytest.mark.parametrize("failure_stage", ["employee", "audit", "commit"])
@pytest.mark.parametrize("existing_setting", [True, False])
def test_failed_bulk_save_rolls_back_setting_employee_audit_and_revision(
    client: TestClient, db_session: Session, actor: models.Employee,
    observed_revision: models.DataRevision, monkeypatch: pytest.MonkeyPatch,
    failure_stage: str, existing_setting: bool,
) -> None:
    """A failure after SQL writes cannot leave a partially applied bulk operation."""
    manager = models.Employee(employee_code="ROLLBACK-MANAGER", name="Manager", role="staff", department_role="primary")
    actor.hidden_sidebar_tabs = "stocktake,weekly"
    db_session.add(manager)
    if existing_setting:
        db_session.add(models.SystemSetting(setting_key=SETTING_KEY, setting_value="false"))
    db_session.commit()
    headers = {"X-Operator-Session": _token(client, manager)}
    before_revision = db_session.get(models.DataRevision, 1).revision
    original_record = stocktakes.audit.record

    def fail_audit(*args: object, **kwargs: object) -> None:
        """Queue the real audit row before simulating an audit persistence failure."""
        original_record(*args, **kwargs)
        db_session.flush()
        raise RuntimeError("bulk save failed")

    def fail_commit(db: Session) -> None:
        """Fail after the real revision listener has flushed and advanced the revision."""
        assert db.query(models.DataRevision.revision).filter_by(id=1).scalar() == before_revision + 1
        raise RuntimeError("bulk save failed")

    def fail_employee(mapper: object, connection: Connection, employee: models.Employee) -> None:
        """Fail only when a targeted employee update is flushed."""
        if employee.employee_id == actor.employee_id:
            raise RuntimeError("bulk save failed")

    if failure_stage == "audit":
        monkeypatch.setattr(stocktakes.audit, "record", fail_audit)
    elif failure_stage == "commit":
        event.listen(db_session, "before_commit", fail_commit)
    else:
        event.listen(models.Employee, "before_update", fail_employee)
    try:
        with pytest.raises(RuntimeError, match="bulk save failed"):
            client.put(URL, headers=headers, json={"enabled": True})
    finally:
        if failure_stage == "employee":
            event.remove(models.Employee, "before_update", fail_employee)
        elif failure_stage == "commit":
            event.remove(db_session, "before_commit", fail_commit)
    db_session.refresh(actor)
    assert actor.hidden_sidebar_tabs == "stocktake,weekly"
    setting = db_session.get(models.SystemSetting, SETTING_KEY)
    assert (setting.setting_value if setting else None) == ("false" if existing_setting else None)
    assert db_session.query(models.AdminAuditLog).filter_by(action="stocktake.menu_visibility").count() == 0
    db_session.refresh(observed_revision)
    assert observed_revision.revision == before_revision
