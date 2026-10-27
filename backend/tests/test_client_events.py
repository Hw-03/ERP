import logging
from datetime import datetime, timezone

import pytest


def _attach_mes_caplog(caplog):
    logger = logging.getLogger("mes")
    logger.addHandler(caplog.handler)
    return logger


def test_client_event_logs_employee_code_header(client, caplog):
    logger = _attach_mes_caplog(caplog)
    try:
        resp = client.post(
            "/api/client-events",
            headers={"X-MES-Employee-Code": "E22"},
            json={"event": "ui_nav", "from": "dashboard", "to": "history", "path": "/mes", "source": "desktop"},
        )
    finally:
        logger.removeHandler(caplog.handler)

    assert resp.status_code == 204
    messages = "\n".join(record.getMessage() for record in caplog.records)
    assert "evt=ui_nav" in messages
    assert "emp=E22" in messages
    assert "from=dashboard" in messages
    assert "to=history" in messages
    assert "path=/mes" in messages
    assert "source=desktop" in messages
    assert "evt=req_ok" in messages


def test_client_event_without_employee_code_keeps_unknown_actor(client, caplog):
    logger = _attach_mes_caplog(caplog)
    try:
        resp = client.post(
            "/api/client-events",
            json={"event": "ui_logout", "source": "desktop"},
        )
    finally:
        logger.removeHandler(caplog.handler)

    assert resp.status_code == 204
    messages = "\n".join(record.getMessage() for record in caplog.records)
    assert "evt=ui_logout" in messages
    assert "emp=-" in messages


def test_client_event_rejects_denied_payload_keys(client, caplog):
    logger = _attach_mes_caplog(caplog)
    try:
        resp = client.post(
            "/api/client-events",
            headers={"X-MES-Employee-Code": "E22"},
            json={"event": "ui_nav", "from": "dashboard", "to": "history", "path": "/mes", "pin": "1234"},
        )
    finally:
        logger.removeHandler(caplog.handler)

    assert resp.status_code == 422
    messages = "\n".join(record.getMessage() for record in caplog.records)
    assert "1234" not in messages


def test_ui_error_records_verified_actor_and_both_timestamps(client, db_session, caplog):
    from fastapi import Response
    from app.models import ActivityAuditLog, Employee
    from app.services.audit_actor_session import AUDIT_ACTOR_COOKIE, set_audit_actor_cookie

    employee = Employee(employee_code="E22", name="Verified Employee", role="assembly", department="assembly", is_active=True)
    db_session.add(employee)
    db_session.commit()
    cookie_response = Response()
    set_audit_actor_cookie(cookie_response, "E22")
    client.cookies.set(AUDIT_ACTOR_COOKIE, cookie_response.headers["set-cookie"].split(";", 1)[0].split("=", 1)[1])
    logger = _attach_mes_caplog(caplog)
    before = datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        response = client.post("/api/client-events", headers={"X-MES-Employee-Code": "E22"}, json={
            "event": "ui_error", "source": "desktop", "occurred_at": "2026-10-27T03:04:05.000Z",
            "error_source": "window_error", "error_type": "TypeError", "error_message": "crypto.randomUUID is not a function",
            "error_stack": "TypeError: broken\n at /app.js:1:2", "path": "/mes", "screen_key": "stocktake",
            "ignored_data": "do-not-log",
        })
    finally:
        logger.removeHandler(caplog.handler)
    assert response.status_code == 204
    row = db_session.query(ActivityAuditLog).filter_by(action_key="ui_error").one()
    assert row.actor_employee_code == "E22"
    assert row.actor_employee_name == "Verified Employee"
    assert row.outcome == "failed"
    assert before <= row.occurred_at <= datetime.now(timezone.utc).replace(tzinfo=None)
    message = next(record.getMessage() for record in caplog.records if "evt=ui_error" in record.getMessage())
    assert "emp=E22" in message
    assert "employee_name=" in message and "Verified Employee" in message
    assert "occurred_at=2026-10-27T03:04:05" in message
    assert "received_at=" in message
    assert "do-not-log" not in message
    assert "\n" not in message


def test_ui_error_does_not_authenticate_a_forged_employee_header(client, db_session, caplog):
    from app.models import ActivityAuditLog
    logger = _attach_mes_caplog(caplog)
    try:
        response = client.post("/api/client-events", headers={"X-MES-Employee-Code": "FORGED"}, json={
            "event": "ui_error", "error_type": "Error", "error_message": "failure",
        })
    finally:
        logger.removeHandler(caplog.handler)
    assert response.status_code == 204
    row = db_session.query(ActivityAuditLog).one()
    assert row.actor_employee_code is None
    message = next(record.getMessage() for record in caplog.records if "evt=ui_error" in record.getMessage())
    assert "emp=-" in message
    assert "reported_employee_code=FORGED" in message


@pytest.mark.parametrize("field", ["pin", "nested"])
def test_ui_error_preserves_denied_key_checks(client, field):
    payload = {"event": "ui_error", field: "1234" if field == "pin" else {"token": "secret"}}
    assert client.post("/api/client-events", json=payload).status_code == 422


def test_ui_error_redacts_values_and_bounds_stack(client, caplog):
    logger = _attach_mes_caplog(caplog)
    try:
        response = client.post("/api/client-events", json={"event": "ui_error", "error_type": "Error",
            "error_message": "https://example.test/a?pin=1234 password=hidden", "path": "/mes?token=secret",
            "error_stack": "Error: token=secret\n at /app.js:1:2\n" + "x" * 5000,
        })
    finally:
        logger.removeHandler(caplog.handler)
    assert response.status_code == 204
    message = next(record.getMessage() for record in caplog.records if "evt=ui_error" in record.getMessage())
    assert "1234" not in message and "hidden" not in message and "secret" not in message
    assert "\n" not in message
    assert len(message) < 5000


def test_ui_error_prefers_verified_tab_actor_over_shared_cookie(client, db_session, caplog):
    from fastapi import Response
    from app.models import ActivityAuditLog, Employee
    from app.services.audit_actor_session import AUDIT_ACTOR_COOKIE, set_audit_actor_cookie
    from app.services.operator_session import issue_session

    actor = Employee(employee_code="E06", name="Tab Employee", role="assembly", department="assembly", is_active=True)
    other = Employee(employee_code="E22", name="Other Tab", role="assembly", department="assembly", is_active=True)
    db_session.add_all([actor, other])
    db_session.flush()
    bearer, _ = issue_session(db_session, employee=actor, tab_id="current-tab")
    db_session.commit()
    cookie_response = Response()
    set_audit_actor_cookie(cookie_response, "E22")
    client.cookies.set(AUDIT_ACTOR_COOKIE, cookie_response.headers["set-cookie"].split(";", 1)[0].split("=", 1)[1])
    logger = _attach_mes_caplog(caplog)
    try:
        response = client.post("/api/client-events", headers={"X-Operator-Session": bearer, "X-MES-Employee-Code": "E06"},
                               json={"event": "ui_error", "error_message": "tab failure"})
    finally:
        logger.removeHandler(caplog.handler)
    assert response.status_code == 204
    row = db_session.query(ActivityAuditLog).one()
    assert row.actor_employee_code == "E06"
    assert row.actor_employee_name == "Tab Employee"
    message = next(record.getMessage() for record in caplog.records if "evt=ui_error" in record.getMessage())
    assert "emp=E06" in message and bearer not in message


@pytest.mark.parametrize("bearer", [None, "expired-or-invalid"])
@pytest.mark.parametrize("reported_code", [None, "E06"])
def test_ui_error_never_uses_other_tabs_cookie_for_unverified_actor(client, db_session, bearer, reported_code):
    from fastapi import Response
    from app.models import ActivityAuditLog, Employee
    from app.services.audit_actor_session import AUDIT_ACTOR_COOKIE, set_audit_actor_cookie

    db_session.add(Employee(employee_code="E22", name="Other Tab", role="assembly", department="assembly", is_active=True))
    db_session.commit()
    cookie_response = Response()
    set_audit_actor_cookie(cookie_response, "E22")
    client.cookies.set(AUDIT_ACTOR_COOKIE, cookie_response.headers["set-cookie"].split(";", 1)[0].split("=", 1)[1])
    headers = {"X-MES-Employee-Code": reported_code} if reported_code else {}
    if bearer is not None:
        headers["X-Operator-Session"] = bearer
    assert client.post("/api/client-events", headers=headers, json={"event": "ui_error"}).status_code == 204
    assert db_session.query(ActivityAuditLog).one().actor_employee_code is None


@pytest.mark.parametrize("key", ["X-Admin-Pin", "X-Operator-Session", "access_token", "refresh_token", "api_key", "X-Auth-Token"])
def test_ui_error_redacts_composite_credentials_without_removing_business_fields(client, caplog, key):
    logger = _attach_mes_caplog(caplog)
    try:
        response = client.post("/api/client-events", json={"event": "ui_error",
            "error_message": f'{key}: "credential value" stocktake_count=4 spinning_count=2 item_key=PF-0026'})
    finally:
        logger.removeHandler(caplog.handler)
    assert response.status_code == 204
    message = next(record.getMessage() for record in caplog.records if "evt=ui_error" in record.getMessage())
    assert "credential value" not in message
    assert "stocktake_count=4 spinning_count=2 item_key=PF-0026" in message


@pytest.mark.parametrize("scheme", ["Bearer", "Basic"])
def test_ui_error_redacts_complete_authorization_value(client, caplog, scheme):
    logger = _attach_mes_caplog(caplog)
    try:
        response = client.post("/api/client-events", json={"event": "ui_error",
            "error_message": f"Authorization: {scheme} auth-credential stocktake_count=4"})
    finally:
        logger.removeHandler(caplog.handler)
    assert response.status_code == 204
    message = next(record.getMessage() for record in caplog.records if "evt=ui_error" in record.getMessage())
    assert "auth-credential" not in message
    assert "stocktake_count=4" in message
