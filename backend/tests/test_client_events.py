import logging


def _attach_mes_caplog(caplog):
    logger = logging.getLogger("mes")
    logger.addHandler(caplog.handler)
    return logger


def _add_operator(db_session):
    from app.models import Employee
    from app.services.pin_auth import hash_pin

    employee = Employee(
        employee_code="CLIENT-EVENT-01",
        name="클라이언트 이벤트 작업자",
        role="조립",
        department="조립",
        is_active=True,
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    db_session.add(employee)
    db_session.commit()
    return employee


def _login(auth_client, employee) -> None:
    response = auth_client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
    )
    assert response.status_code == 200, response.text


def test_client_event_requires_verified_session_without_persistence(
    auth_client,
    db_session,
    caplog,
):
    from app.models import ActivityAuditLog

    logger = _attach_mes_caplog(caplog)
    try:
        response = auth_client.post(
            "/api/client-events",
            headers={"X-MES-Employee-Code": "E22"},
            json={
                "event": "ui_nav",
                "from": "dashboard",
                "to": "history",
                "path": "/mes",
                "source": "desktop",
            },
        )
    finally:
        logger.removeHandler(caplog.handler)

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "AUTH_REQUIRED"
    assert db_session.query(ActivityAuditLog).count() == 0
    messages = "\n".join(record.getMessage() for record in caplog.records)
    assert "evt=ui_nav" not in messages
    assert "emp=E22" not in messages


def test_client_event_persists_verified_session_actor(
    auth_client,
    db_session,
    caplog,
):
    from app.models import ActivityAuditLog

    employee = _add_operator(db_session)
    _login(auth_client, employee)
    logger = _attach_mes_caplog(caplog)
    try:
        response = auth_client.post(
            "/api/client-events",
            json={
                "event": "ui_nav",
                "from": "dashboard",
                "to": "history",
                "path": "/mes",
                "source": "desktop",
            },
        )
    finally:
        logger.removeHandler(caplog.handler)

    assert response.status_code == 204
    row = (
        db_session.query(ActivityAuditLog)
        .filter(ActivityAuditLog.action_key == "ui_nav")
        .one()
    )
    assert row.actor_employee_code == employee.employee_code
    assert row.actor_employee_name == employee.name
    messages = "\n".join(record.getMessage() for record in caplog.records)
    assert "evt=ui_nav" in messages
    assert f"emp={employee.employee_code}" in messages
    assert "from=dashboard" in messages
    assert "to=history" in messages
    assert "path=/mes" in messages
    assert "source=desktop" in messages
    assert "evt=req_ok" in messages


def test_client_event_rejects_denied_payload_keys(
    auth_client,
    db_session,
    caplog,
):
    from app.models import ActivityAuditLog

    employee = _add_operator(db_session)
    _login(auth_client, employee)
    logger = _attach_mes_caplog(caplog)
    try:
        response = auth_client.post(
            "/api/client-events",
            json={
                "event": "ui_nav",
                "from": "dashboard",
                "to": "history",
                "path": "/mes",
                "pin": "1234",
            },
        )
    finally:
        logger.removeHandler(caplog.handler)

    assert response.status_code == 422
    assert (
        db_session.query(ActivityAuditLog)
        .filter(ActivityAuditLog.action_key == "ui_nav")
        .count()
        == 0
    )
    messages = "\n".join(record.getMessage() for record in caplog.records)
    assert "1234" not in messages
