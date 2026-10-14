"""2-A: isolated operator credentials must not change legacy PIN responses."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models import Employee


def _employee(db_session, *, code: str = "STOCKTAKE-OP") -> Employee:
    employee = Employee(
        employee_code=code,
        name="계수자",
        role="테스트",
        department="조립",
        is_active=True,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def test_legacy_pin_response_stays_unchanged(db_session, client):
    employee = _employee(db_session)
    db_session.commit()

    response = client.post(
        f"/api/employees/{employee.employee_id}/verify-pin", json={"pin": "0000"}
    )

    assert response.status_code == 200
    assert response.json()["employee_id"] == str(employee.employee_id)
    assert "operator_session" not in response.json()


def test_pin_with_tab_issues_separate_operator_session(db_session, client):
    employee = _employee(db_session)
    db_session.commit()

    issued = client.post(
        f"/api/employees/{employee.employee_id}/verify-pin",
        json={"pin": "0000", "tab_id": "count-tab-1"},
    )
    assert issued.status_code == 200, issued.text
    data = issued.json()
    token = data["operator_session"]["token"]
    assert data["employee"]["employee_id"] == str(employee.employee_id)
    from app.models import OperatorSession

    stored = db_session.query(OperatorSession).one()
    assert stored.token_hash != token
    assert len(stored.token_hash) == 64

    current = client.get(
        "/api/operator-sessions/current", headers={"X-Operator-Session": token}
    )
    assert current.status_code == 200, current.text
    assert current.json()["employee_id"] == str(employee.employee_id)
    assert current.json()["tab_id"] == "count-tab-1"
    assert "token" not in current.json()


def test_operator_session_revocation_is_per_token(db_session, client):
    employee = _employee(db_session)
    db_session.commit()
    first = client.post(
        "/api/operator-sessions",
        json={"employee_id": str(employee.employee_id), "pin": "0000", "tab_id": "tab-a"},
    )
    second = client.post(
        "/api/operator-sessions",
        json={"employee_id": str(employee.employee_id), "pin": "0000", "tab_id": "tab-b"},
    )
    assert first.status_code == second.status_code == 201
    first_token = first.json()["token"]
    second_token = second.json()["token"]
    assert first_token != second_token

    revoked = client.delete(
        "/api/operator-sessions/current",
        headers={"X-Operator-Session": first_token},
    )
    assert revoked.status_code == 204
    assert client.get(
        "/api/operator-sessions/current",
        headers={"X-Operator-Session": first_token},
    ).status_code == 401
    assert client.get(
        "/api/operator-sessions/current",
        headers={"X-Operator-Session": second_token},
    ).status_code == 200


def test_pin_change_and_expiry_invalidate_operator_session(db_session, client):
    employee = _employee(db_session)
    db_session.commit()
    issued = client.post(
        "/api/operator-sessions",
        json={"employee_id": str(employee.employee_id), "pin": "0000", "tab_id": "tab-a"},
    )
    assert issued.status_code == 201
    token = issued.json()["token"]

    changed = client.post(
        f"/api/employees/{employee.employee_id}/change-pin",
        json={"current_pin": "0000", "new_pin": "1234"},
    )
    assert changed.status_code == 204
    assert client.get(
        "/api/operator-sessions/current", headers={"X-Operator-Session": token}
    ).status_code == 401

    renewed = client.post(
        "/api/operator-sessions",
        json={"employee_id": str(employee.employee_id), "pin": "1234", "tab_id": "tab-a"},
    )
    assert renewed.status_code == 201
    from app.models import OperatorSession

    row = db_session.query(OperatorSession).order_by(OperatorSession.created_at.desc()).first()
    row.expires_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
    db_session.commit()
    assert client.get(
        "/api/operator-sessions/current",
        headers={"X-Operator-Session": renewed.json()["token"]},
    ).status_code == 401


def test_inactive_employee_session_is_rejected(db_session, client):
    employee = _employee(db_session)
    db_session.commit()
    issued = client.post(
        "/api/operator-sessions",
        json={"employee_id": str(employee.employee_id), "pin": "0000", "tab_id": "tab-a"},
    )
    assert issued.status_code == 201
    employee.is_active = False
    db_session.commit()
    assert client.get(
        "/api/operator-sessions/current",
        headers={"X-Operator-Session": issued.json()["token"]},
    ).status_code == 401


def test_cookie_and_wrong_pin_cannot_serve_as_operator_token(db_session, client):
    employee = _employee(db_session)
    db_session.commit()
    legacy = client.post(
        f"/api/employees/{employee.employee_id}/verify-pin", json={"pin": "0000"}
    )
    assert legacy.status_code == 200
    assert client.get("/api/operator-sessions/current").status_code == 401

    wrong = client.post(
        "/api/operator-sessions",
        json={"employee_id": str(employee.employee_id), "pin": "9999", "tab_id": "tab-a"},
    )
    assert wrong.status_code == 403
