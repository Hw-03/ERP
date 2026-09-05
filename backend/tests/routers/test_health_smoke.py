"""System health smoke tests."""

from __future__ import annotations

from decimal import Decimal
import inspect
import logging
from types import SimpleNamespace
from typing import Any
from unittest.mock import ANY

import pytest

from app.database import get_db
from app.main import app
from app.models import Inventory


ALEMBIC_HEAD = "20260831_0033"


class _FailingHealthSession:
    def __init__(self, secret: str = "postgresql://secret-user:secret-pass@db/private") -> None:
        self.secret = secret
        self.calls: list[str] = []

    def execute(self, _statement: Any) -> None:
        self.calls.append("execute")
        raise RuntimeError(self.secret)

    def connection(self) -> Any:
        self.calls.append("connection")
        return self

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


@pytest.fixture(autouse=True)
def _healthy_schema_contract(monkeypatch):
    """HTTP health tests use an explicit head-schema result over metadata fixtures."""
    from app import main

    monkeypatch.setattr(
        main,
        "check_schema",
        lambda *, connection: SimpleNamespace(
            ready=True,
            revision=ALEMBIC_HEAD,
            differences=(),
        ),
        raising=False,
    )


def _format_log_records(records: list[logging.LogRecord]) -> str:
    """메시지뿐 아니라 exc_info traceback까지 실제 출력 형태로 직렬화한다."""
    formatter = logging.Formatter("%(levelname)s %(name)s %(message)s")
    return "\n".join(formatter.format(record) for record in records)


def _healthy_integrity_stub() -> SimpleNamespace:
    return SimpleNamespace(
        contract="inventory-integrity/v1",
        status="pass",
        blocking_count=0,
        warning_count=0,
        checks=[
            SimpleNamespace(
                check_id="INVENTORY_TOTAL_MISMATCH",
                severity="blocking",
                count=0,
                samples=[],
            ),
        ],
    )


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

    live = client.get("/health/live")
    assert live.status_code == 200
    assert live.json() == {
        "contract": "health-liveness/v1",
        "status": "live",
    }

    ready = client.get("/health/ready")
    assert ready.status_code == 200, ready.text
    readiness = ready.json()
    assert set(readiness) == {
        "contract",
        "status",
        "checks",
        "alembic_revision",
        "inventory_integrity",
    }
    assert readiness["contract"] == "health-readiness/v1"
    assert readiness["status"] == "ready"
    assert readiness["alembic_revision"] == ALEMBIC_HEAD
    assert [check["check_id"] for check in readiness["checks"]] == [
        "DATABASE_CONNECTION",
        "ALEMBIC_HEAD",
        "INVENTORY_INTEGRITY_DEPENDENCY",
        "INVENTORY_INTEGRITY_BLOCKING",
    ]
    assert all(set(check) == {"check_id", "status", "count"} for check in readiness["checks"])
    assert all(check["status"] == "pass" for check in readiness["checks"])
    assert readiness["inventory_integrity"]["status"] == "pass"
    assert all(
        set(check) == {"check_id", "severity", "count"}
        for check in readiness["inventory_integrity"]["checks"]
    )

    detailed = client.get("/health/detailed")
    assert detailed.status_code == 200, detailed.text
    body = detailed.json()
    assert body["contract"] == "health-detailed/v1"
    assert body["status"] == "ok"
    assert body["db"]["ok"] is True
    assert body["rows"]["items"] == 1
    assert body["rows"]["inventory"] == 1
    assert body["inventory_mismatch_count"] == 0
    assert body["readiness"] == readiness
    assert all(check["samples"] == [] for check in body["inventory_integrity"]["checks"])
    assert "last_transaction_at" in body


def test_detailed_health_reports_degraded_on_inventory_mismatch(client, db_session, make_item):
    item = make_item(name="헬스 미스매치", warehouse_qty=Decimal("4"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = Decimal("99")
    db_session.commit()

    ready = client.get("/health/ready")
    assert ready.status_code == 503, ready.text
    assert ready.json()["status"] == "not_ready"
    blocking = next(
        check
        for check in ready.json()["checks"]
        if check["check_id"] == "INVENTORY_INTEGRITY_BLOCKING"
    )
    assert blocking == {
        "check_id": "INVENTORY_INTEGRITY_BLOCKING",
        "status": "fail",
        "count": 1,
    }

    detailed = client.get("/health/detailed")
    assert detailed.status_code == 200, detailed.text
    body = detailed.json()
    assert body["status"] == "degraded"
    assert body["inventory_mismatch_count"] == 1
    assert body["readiness"]["status"] == "not_ready"
    assert body["inventory_integrity"]["blocking_count"] == 1


def test_live_has_no_database_dependency_and_stays_live_when_database_is_down(
    failing_health_db,
):
    request_client, session = failing_health_db
    route = next(route for route in app.routes if getattr(route, "path", None) == "/health/live")

    response = request_client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {
        "contract": "health-liveness/v1",
        "status": "live",
    }
    assert inspect.iscoroutinefunction(route.endpoint)
    assert route.dependant.dependencies == []
    assert session.calls == []


@pytest.mark.parametrize(
    ("path", "method"),
    [
        ("/health/ready", "get"),
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


def test_ready_rejects_wrong_schema_without_running_inventory_dependency(
    client,
    monkeypatch,
):
    from app import main

    monkeypatch.setattr(
        main,
        "check_schema",
        lambda *, connection: SimpleNamespace(
            ready=False,
            revision="20260831_0032",
            differences=("revision mismatch",),
        ),
    )
    monkeypatch.setattr(
        main.inventory_integrity_svc,
        "diagnose_inventory_integrity",
        lambda _db: pytest.fail("wrong schema must stop before integrity diagnostics"),
    )

    response = client.get("/health/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["alembic_revision"] == "20260831_0032"
    assert [check["status"] for check in body["checks"]] == [
        "pass",
        "fail",
        "not_checked",
        "not_checked",
    ]


def test_warning_only_integrity_is_ready_and_detailed_samples_are_sanitized(
    client,
    monkeypatch,
):
    secret = "sensitive-item-and-operation-id"
    integrity = SimpleNamespace(
        contract="inventory-integrity/v1",
        status="warning",
        blocking_count=0,
        warning_count=1,
        checks=[
            SimpleNamespace(
                check_id="INVENTORY_TOTAL_MISMATCH",
                severity="blocking",
                count=0,
                samples=[],
            ),
            SimpleNamespace(
                check_id="OPERATION_V1_EFFECT_MISSING",
                severity="warning",
                count=1,
                samples=[{"item_id": secret}],
            ),
        ],
    )
    monkeypatch.setattr(
        "app.main.inventory_integrity_svc.diagnose_inventory_integrity",
        lambda _db: integrity,
    )

    ready = client.get("/health/ready")
    detailed = client.get("/health/detailed")

    assert ready.status_code == 200
    assert ready.json()["status"] == "ready"
    assert ready.json()["inventory_integrity"]["status"] == "warning"
    assert detailed.status_code == 200
    assert detailed.json()["status"] == "ok"
    assert secret not in detailed.text
    assert all(
        check["samples"] == []
        for check in detailed.json()["inventory_integrity"]["checks"]
    )


def test_ready_dependency_failure_is_sanitized_and_returns_503(
    client,
    monkeypatch,
    health_log_records,
):
    secret = "postgresql://secret-user:secret-pass@db/private"

    def _fail_dependency(_db):
        raise RuntimeError(secret)

    monkeypatch.setattr(
        "app.main.inventory_integrity_svc.diagnose_inventory_integrity",
        _fail_dependency,
    )

    response = client.get(
        "/health/ready",
        headers={"X-Request-Id": "health-dependency-secret-check"},
    )
    log_output = _format_log_records(health_log_records)

    assert response.status_code == 503
    assert [check["status"] for check in response.json()["checks"]] == [
        "pass",
        "pass",
        "fail",
        "not_checked",
    ]
    assert secret not in response.text
    assert secret not in log_output
    assert "health-dependency-secret-check" in log_output


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
        "contract": "health-detailed/v1",
        "status": "degraded",
        "db": {"ok": False},
        "rows": {},
        "inventory_mismatch_count": None,
        "inventory_integrity": None,
        "last_transaction_at": None,
        "readiness": {
            "contract": "health-readiness/v1",
            "status": "not_ready",
            "checks": [
                {"check_id": "DATABASE_CONNECTION", "status": "fail", "count": None},
                {"check_id": "ALEMBIC_HEAD", "status": "not_checked", "count": None},
                {
                    "check_id": "INVENTORY_INTEGRITY_DEPENDENCY",
                    "status": "not_checked",
                    "count": None,
                },
                {
                    "check_id": "INVENTORY_INTEGRITY_BLOCKING",
                    "status": "not_checked",
                    "count": None,
                },
            ],
            "alembic_revision": None,
            "inventory_integrity": None,
        },
    }
    assert "execute" in session.calls
    assert "query" not in session.calls
    assert session.secret not in response.text
    assert session.secret not in log_output
    assert "health-detailed-secret-check" in log_output


def test_detailed_health_sanitizes_late_diagnostic_query_failure(
    health_log_records,
    late_failing_health_db,
    monkeypatch,
):
    request_client, session = late_failing_health_db
    monkeypatch.setattr(
        "app.main.inventory_integrity_svc.diagnose_inventory_integrity",
        lambda _db: _healthy_integrity_stub(),
    )

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
        "contract": "health-detailed/v1",
        "status": "degraded",
        "db": {"ok": False},
        "rows": {},
        "inventory_mismatch_count": None,
        "inventory_integrity": None,
        "last_transaction_at": None,
        "readiness": {
            "contract": "health-readiness/v1",
            "status": "ready",
            "checks": [
                {"check_id": "DATABASE_CONNECTION", "status": "pass", "count": None},
                {"check_id": "ALEMBIC_HEAD", "status": "pass", "count": None},
                {
                    "check_id": "INVENTORY_INTEGRITY_DEPENDENCY",
                    "status": "pass",
                    "count": None,
                },
                {
                    "check_id": "INVENTORY_INTEGRITY_BLOCKING",
                    "status": "pass",
                    "count": 0,
                },
            ],
            "alembic_revision": ALEMBIC_HEAD,
            "inventory_integrity": ANY,
        },
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


def test_health_openapi_documents_versioned_success_and_503_contracts(client):
    schema = client.get("/openapi.json").json()

    assert set(schema["paths"]["/health/live"]["get"]["responses"]) == {"200"}
    assert set(schema["paths"]["/health/ready"]["get"]["responses"]) == {"200", "503"}
    assert set(schema["paths"]["/health/detailed"]["get"]["responses"]) == {"200", "503"}
    assert schema["paths"]["/health/live"]["get"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"] == {"$ref": "#/components/schemas/HealthLiveResponse"}
    assert schema["paths"]["/health/ready"]["get"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"] == {"$ref": "#/components/schemas/HealthReadinessResponse"}
    assert schema["paths"]["/health/detailed"]["get"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"] == {"$ref": "#/components/schemas/HealthDetailedResponse"}
