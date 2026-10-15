"""Employee appearance pairs are validated and saved atomically."""
from __future__ import annotations

import uuid
import pytest
from app.models import Employee
from sqlalchemy import event


@pytest.fixture
def employee(db_session, client) -> Employee:
    employee = Employee(employee_code="APPEARANCE", name="Worker", role="worker", department="Assembly", theme="light", sidebar_mode="hover")
    db_session.add(employee)
    db_session.commit()
    client.headers["X-MES-Employee-Code"] = employee.employee_code
    return employee


def test_appearance_get_and_pair_save(db_session, client, employee: Employee) -> None:
    endpoint = f"/api/employees/{employee.employee_id}/appearance"
    assert client.get(endpoint).json() == {"employee_id": str(employee.employee_id), "theme": "light", "sidebar_mode": "hover"}
    response = client.put(endpoint, json={"theme": "dark", "sidebar_mode": "expanded"})
    assert response.status_code == 200, response.text
    assert response.json() == {"employee_id": str(employee.employee_id), "theme": "dark", "sidebar_mode": "expanded"}
    db_session.refresh(employee)
    assert (employee.theme, employee.sidebar_mode) == ("dark", "expanded")


@pytest.mark.parametrize("payload", [
    {"theme": "sepia", "sidebar_mode": "expanded"},
    {"theme": "dark", "sidebar_mode": "floating"},
    {"theme": None, "sidebar_mode": "hover"},
    {"theme": "dark"},
])
def test_invalid_appearance_pair_never_changes_either_field(db_session, client, employee: Employee, payload: dict) -> None:
    response = client.put(f"/api/employees/{employee.employee_id}/appearance", json=payload)
    assert response.status_code == 422, response.text
    db_session.refresh(employee)
    assert (employee.theme, employee.sidebar_mode) == ("light", "hover")


def test_appearance_defaults_and_missing_employee(db_session, client, employee: Employee) -> None:
    employee.theme = None
    db_session.commit()
    assert client.get(f"/api/employees/{employee.employee_id}/appearance").json()["theme"] == "light"
    assert client.get(f"/api/employees/{uuid.uuid4()}/appearance").status_code == 404


def test_existing_individual_endpoints_remain_available(client, employee: Employee) -> None:
    assert client.put(f"/api/employees/{employee.employee_id}/theme", json={"theme": "dark"}).status_code == 200
    assert client.put(f"/api/employees/{employee.employee_id}/sidebar-mode", json={"sidebar_mode": "collapsed"}).status_code == 200
    assert client.get(f"/api/employees/{employee.employee_id}/appearance").json() == {"employee_id": str(employee.employee_id), "theme": "dark", "sidebar_mode": "collapsed"}


def test_pair_write_includes_both_fields_even_when_one_matches(db_session, client, employee: Employee) -> None:
    statements: list[str] = []

    def capture(_connection, _cursor, statement, _parameters, _context, _many) -> None:
        if statement.lstrip().upper().startswith("UPDATE EMPLOYEES"):
            statements.append(statement)

    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", capture)
    try:
        response = client.put(f"/api/employees/{employee.employee_id}/appearance", json={"theme": "light", "sidebar_mode": "collapsed"})
    finally:
        event.remove(connection, "before_cursor_execute", capture)
    assert response.status_code == 200, response.text
    assert len(statements) == 1
    assert "theme=" in statements[0]
    assert "sidebar_mode=" in statements[0]
