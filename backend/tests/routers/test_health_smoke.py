"""System health smoke tests."""

from __future__ import annotations

from decimal import Decimal
import logging
from typing import Any

import pytest

from app.database import get_db
from app.main import app
from app.models import Inventory


class _FailingHealthSession:
    def __init__(self, secret: str = "postgresql://secret-user:secret-pass@db/private") -> None:
        self.secret = secret
        self.calls: list[str] = []

    def execute(self, _statement: Any) -> None:
        self.calls.append("execute")
        raise RuntimeError(self.secret)

    def query(self, *_args: Any, **_kwargs: Any) -> None:
        self.calls.append("query")
        raise AssertionError("DB ping 실패 뒤 후속 query를 실행하면 안 됩니다.")

    def begin_nested(self) -> None:
        self.calls.append("begin_nested")
        raise RuntimeError(self.secret)

    def rollback(self) -> None:
        self.calls.append("rollback")


class _LateFailingHealthSession(_FailingHealthSession):
    def execute(self, _statement: Any) -> None:
        self.calls.append("execute")

    def query(self, *_args: Any, **_kwargs: Any) -> None:
        self.calls.append("query")
        raise RuntimeError(self.secret)


@pytest.fixture()
def health_log_records():
    records: list[logging.LogRecord] = []

    class _CollectingHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record)

    handler = _CollectingHandler()
    logger = logging.getLogger("mes")
    logger.addHandler(handler)
    try:
        yield records
    finally:
        logger.removeHandler(handler)


def _format_log_records(records: list[logging.LogRecord]) -> str:
    """메시지뿐 아니라 exc_info traceback까지 실제 출력 형태로 직렬화한다."""
    formatter = logging.Formatter("%(levelname)s %(name)s %(message)s")
    return "\n".join(formatter.format(record) for record in records)


@pytest.fixture()
def failing_health_db(client):
    session = _FailingHealthSession()

    def _override_get_db():
        yield session

    app.dependency_overrides[get_db] = _override_get_db
    yield client, session


@pytest.fixture()
def late_failing_health_db(client):
    session = _LateFailingHealthSession()

    def _override_get_db():
        yield session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield client, session
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_health_and_detailed_health_are_ok(client, make_item):
    make_item(name="헬스 스모크", warehouse_qty=Decimal("4"))

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    detailed = client.get("/health/detailed")
    assert detailed.status_code == 200, detailed.text
    body = detailed.json()
    assert body["status"] == "ok"
    assert body["db"]["ok"] is True
    assert body["rows"]["items"] == 1
    assert body["rows"]["inventory"] == 1
    assert body["inventory_mismatch_count"] == 0
    assert "last_transaction_at" in body


def test_detailed_health_reports_degraded_on_inventory_mismatch(client, db_session, make_item):
    item = make_item(name="헬스 미스매치", warehouse_qty=Decimal("4"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = Decimal("99")
    db_session.commit()

    detailed = client.get("/health/detailed")
    assert detailed.status_code == 200, detailed.text
    body = detailed.json()
    assert body["status"] == "degraded"
    assert body["inventory_mismatch_count"] == 1


@pytest.mark.parametrize(
    ("path", "method"),
    [
        ("/health/live", "get"),
        ("/api/health/db-info", "get"),
        ("/api/health/write-check", "post"),
    ],
)
def test_health_db_failures_return_503_without_exposing_database_error(
    failing_health_db,
    path,
    method,
    health_log_records,
):
    request_client, session = failing_health_db

    response = getattr(request_client, method)(
        path,
        headers={"X-Request-Id": "health-secret-check"},
    )
    log_output = _format_log_records(health_log_records)

    assert response.status_code == 503
    assert session.secret not in response.text
    assert session.secret not in log_output
    assert "health-secret-check" in log_output


def test_detailed_health_stops_after_failed_ping_and_returns_structured_degraded_503(
    failing_health_db,
    health_log_records,
):
    request_client, session = failing_health_db

    response = request_client.get(
        "/health/detailed",
        headers={"X-Request-Id": "health-detailed-secret-check"},
    )
    log_output = _format_log_records(health_log_records)

    assert response.status_code == 503
    assert response.json() == {
        "status": "degraded",
        "db": {"ok": False},
        "rows": {},
        "inventory_mismatch_count": None,
        "last_transaction_at": None,
    }
    assert "execute" in session.calls
    assert "query" not in session.calls
    assert session.secret not in response.text
    assert session.secret not in log_output
    assert "health-detailed-secret-check" in log_output


def test_detailed_health_sanitizes_late_diagnostic_query_failure(
    health_log_records,
    late_failing_health_db,
):
    request_client, session = late_failing_health_db

    response = request_client.get(
        "/health/detailed",
        headers={"X-Request-Id": "health-late-secret-check"},
    )
    log_output = _format_log_records(health_log_records)
    failure_records = [
        record
        for record in health_log_records
        if "evt=health_detailed_diagnostics_unavailable" in record.getMessage()
    ]

    assert response.status_code == 503
    assert response.json() == {
        "status": "degraded",
        "db": {"ok": False},
        "rows": {},
        "inventory_mismatch_count": None,
        "last_transaction_at": None,
    }
    assert "execute" in session.calls
    assert "query" in session.calls
    assert "rollback" in session.calls
    assert session.secret not in response.text
    assert session.secret not in log_output
    assert failure_records
    assert all(record.exc_info is None for record in failure_records)
    assert "health-late-secret-check" in log_output


def test_db_info_executes_connection_check_and_preserves_response_keys(client, monkeypatch):
    from app import main

    connection_checked = False

    class _ConnectedSession:
        def execute(self, _statement: Any) -> None:
            nonlocal connection_checked
            connection_checked = True

    def _override_get_db():
        yield _ConnectedSession()

    monkeypatch.setattr(main, "_is_sqlite", False)
    app.dependency_overrides[get_db] = _override_get_db

    response = client.get("/api/health/db-info")

    assert response.status_code == 200
    assert connection_checked is True
    body = response.json()
    assert set(body) == {
        "db_engine",
        "is_sqlite",
        "pool_enabled",
        "safe_for_30_users",
        "note",
        "connection_ok",
    }
    assert body["connection_ok"] is True
    assert body["safe_for_30_users"] is None
    assert "30명 동시 운영 가능" not in body["note"]
