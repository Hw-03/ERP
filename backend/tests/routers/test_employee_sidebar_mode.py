"""직원별 데스크톱 사이드바 모드 API 테스트."""

from __future__ import annotations

import uuid

import pytest

from app.models import Employee, EmployeeLevelEnum


def _employee(db_session) -> Employee:
    employee = Employee(
        employee_id=uuid.uuid4(),
        employee_code="SIDEBAR-01",
        name="사이드바 작업자",
        role="조립/사원",
        department="조립",
        level=EmployeeLevelEnum.STAFF,
    )
    db_session.add(employee)
    db_session.commit()
    return employee


@pytest.mark.parametrize("sidebar_mode", ["hover", "collapsed", "expanded"])
def test_update_employee_sidebar_mode_round_trips(db_session, client, sidebar_mode: str):
    employee = _employee(db_session)

    response = client.put(
        f"/api/employees/{employee.employee_id}/sidebar-mode",
        json={"sidebar_mode": sidebar_mode},
    )

    assert response.status_code == 200, response.text
    assert response.json()["sidebar_mode"] == sidebar_mode
    db_session.refresh(employee)
    assert employee.sidebar_mode == sidebar_mode


def test_update_employee_sidebar_mode_rejects_unknown_value(db_session, client):
    employee = _employee(db_session)

    response = client.put(
        f"/api/employees/{employee.employee_id}/sidebar-mode",
        json={"sidebar_mode": "floating"},
    )

    assert response.status_code == 422, response.text


def test_update_employee_sidebar_mode_returns_not_found(client):
    response = client.put(
        f"/api/employees/{uuid.uuid4()}/sidebar-mode",
        json={"sidebar_mode": "collapsed"},
    )

    assert response.status_code == 404, response.text


def test_employee_response_defaults_sidebar_mode_to_hover(db_session, client):
    employee = _employee(db_session)

    response = client.post(
        f"/api/employees/{employee.employee_id}/verify-pin",
        json={"pin": "0000"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["sidebar_mode"] == "hover"
