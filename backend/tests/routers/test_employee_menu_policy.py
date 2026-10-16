"""Employee creation defaults affect menus only, preserving independent authority."""

import uuid

import pytest

from app.models import Employee
from tests.routers.test_employee_io_enabled import ADMIN_HEADERS, _emp_payload


@pytest.mark.parametrize("menus", [[], ["weekly"], ["admin"]])
def test_create_respects_explicit_menus_without_changing_approval_roles(client, db_session, menus) -> None:
    """Explicit empty and nonempty menus override the default, including the first row."""
    response = client.post("/api/employees", headers=ADMIN_HEADERS, json=_emp_payload(
        hidden_sidebar_tabs=menus, warehouse_role="primary", department_role="deputy", as_research_approver=True,
    ))
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["hidden_sidebar_tabs"] == menus
    assert body["warehouse_role"] == "primary"
    assert body["department_role"] == "deputy"
    assert body["as_research_approver"] is True
    login = client.post(f"/api/employees/{body['employee_id']}/verify-pin", json={"pin": "0000"})
    assert login.status_code == 200, login.text
    assert login.json()["hidden_sidebar_tabs"] == menus


@pytest.mark.parametrize("menus", ["", "admin", "weekly"])
def test_update_omitted_menus_preserves_existing_menu_pin_and_roles(client, db_session, menus) -> None:
    """Editing a name preserves saved access even when the roster has no visible admin."""
    employee = Employee(employee_code="POLICY_EXISTING", name="Existing", department="조립", role="사원",
        hidden_sidebar_tabs=menus, is_active="true", pin_hash="existing-pin-hash",
        warehouse_role="primary", department_role="deputy", as_research_approver=True)
    db_session.add(employee)
    db_session.commit()
    response = client.put(f"/api/employees/{employee.employee_id}", headers=ADMIN_HEADERS, json={"name": "Renamed"})
    assert response.status_code == 200, response.text
    assert response.json()["hidden_sidebar_tabs"] == (menus.split(",") if menus else [])
    db_session.refresh(employee)
    assert employee.pin_hash == "existing-pin-hash"
    assert employee.warehouse_role == "primary"
    assert employee.department_role == "deputy"
    assert employee.as_research_approver is True


def test_default_create_preserves_existing_employee_records_and_admin_access(client, db_session) -> None:
    """Adding a restricted employee never mutates the existing administrator."""
    existing = Employee(employee_code="POLICY_ADMIN", name="Existing admin", department="조립", role="사원",
        hidden_sidebar_tabs="weekly", is_active="true", pin_hash="unchanged-admin-pin",
        warehouse_role="deputy", department_role="primary", as_research_approver=True)
    db_session.add(existing)
    db_session.commit()
    before = {column.name: getattr(existing, column.name) for column in Employee.__table__.columns}
    response = client.post("/api/employees", headers=ADMIN_HEADERS, json=_emp_payload(name="New employee"))
    assert response.status_code == 201, response.text
    assert response.json()["hidden_sidebar_tabs"] == ["admin"]
    db_session.refresh(existing)
    assert {column.name: getattr(existing, column.name) for column in Employee.__table__.columns} == before
    created = db_session.get(Employee, uuid.UUID(response.json()["employee_id"]))
    assert created.warehouse_role == "none"
    assert created.department_role == "none"
    assert created.as_research_approver is False
    login = client.post(f"/api/employees/{created.employee_id}/verify-pin", json={"pin": "0000"})
    assert login.status_code == 200, login.text
    assert login.json()["hidden_sidebar_tabs"] == ["admin"]


def test_update_still_rejects_deactivating_last_visible_admin(client, db_session) -> None:
    """Default-hidden employees do not satisfy the final visible-admin safeguard."""
    admin = Employee(employee_code="LAST_ADMIN", name="Admin", department="조립", role="사원", hidden_sidebar_tabs="", is_active="true")
    hidden = Employee(employee_code="HIDDEN_ADMIN", name="Hidden", department="조립", role="사원", hidden_sidebar_tabs="admin", is_active="true")
    db_session.add_all([admin, hidden])
    db_session.commit()
    response = client.put(f"/api/employees/{admin.employee_id}", headers=ADMIN_HEADERS, json={"is_active": False})
    assert response.status_code == 422, response.text
    db_session.refresh(admin)
    assert admin.is_active is True
