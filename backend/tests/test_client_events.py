import logging


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
