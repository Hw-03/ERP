"""Close commit budgets and uncertain outcomes have distinct retry contracts."""
import re
from types import SimpleNamespace
from unittest.mock import MagicMock
import uuid

import pytest
from sqlalchemy.exc import OperationalError
from starlette.requests import Request

from app import database
from app.services import stocktake, stocktake_closing, stocktake_deadline, stocktake_guard
from app.services.inventory_conflicts import InventoryConflict


def test_postgresql_commit_refreshes_timeout_to_remaining_cumulative_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    """The last SQL's timeout must not grant COMMIT a fresh, longer budget."""
    callbacks = {}

    def listen(_target: object, name: str):
        def register(callback):
            callbacks[name] = callback
            return callback
        return register

    monkeypatch.setattr(stocktake_deadline.event, "listens_for", listen)
    clock = [100.0]
    monkeypatch.setattr(stocktake_deadline, "time", SimpleNamespace(monotonic=lambda: clock[0]))
    engine = SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))
    stocktake_deadline.install(engine)
    statements = []
    cursor = MagicMock()
    cursor.execute.side_effect = lambda statement, *args, **kwargs: statements.append(statement)
    raw = MagicMock()
    raw.cursor.return_value = cursor
    raw.cursor.return_value.__enter__.return_value = cursor
    connection = SimpleNamespace(
        info={stocktake_deadline.KEY: {"enabled": True, "deadline": 102.0}},
        dialect=engine.dialect,
        exec_driver_sql=cursor.execute,
        connection=SimpleNamespace(driver_connection=raw, cursor=raw.cursor),
    )
    callbacks["before_cursor_execute"](connection, cursor, "SELECT 1", (), None, False)
    before_commit_statements = len(statements)
    clock[0] = 101.8
    callbacks["commit"](connection)
    remaining_settings = [int(match.group(1)) for statement in statements[before_commit_statements:]
                          if (match := re.search(r"statement_timeout\s*=\s*'?(\d+)ms", statement))]
    assert remaining_settings, "COMMIT must receive the remaining transaction budget"
    assert 1 <= remaining_settings[-1] <= 200


class PostgresFailure(Exception):
    """A DBAPI error with the server code, independent of an installed PG driver."""

    def __init__(self, sqlstate: str) -> None:
        super().__init__("simulated database outcome")
        self.sqlstate = sqlstate


def _close_boundary(monkeypatch: pytest.MonkeyPatch) -> tuple[object, MagicMock, object, dict]:
    """Use the real command and dependency error boundaries with mocked DB I/O only."""
    db = MagicMock()
    db.info = {}
    db.connection.return_value = SimpleNamespace(info={})
    actor = SimpleNamespace(is_active=True, employee_id=uuid.uuid4(), department_role="primary")
    receipt = SimpleNamespace(receipt_id=uuid.uuid4(), response=None)
    monkeypatch.setattr(database, "CloseSessionLocal", lambda: db)
    monkeypatch.setattr(database, "_requires_weekly_snapshot_guard", lambda _request: False)
    monkeypatch.setattr(stocktake_guard, "lock_control", lambda *args, **kwargs: None)
    monkeypatch.setattr(stocktake, "claim_receipt", lambda *args, **kwargs: receipt)
    monkeypatch.setattr(stocktake_closing, "close", lambda *args, **kwargs: {"status": "CLOSED_FULL"})
    request = Request({"type": "http", "method": "POST",
                       "path": f"/api/stocktakes/rounds/{uuid.uuid4()}/close", "headers": []})
    dependency = database.get_db(request)
    assert next(dependency) is db
    payload = {"round_id": str(uuid.uuid4()), "preview_id": str(uuid.uuid4()), "preview_hash": "f" * 64}
    return dependency, db, actor, payload


def _run_failed_close(dependency: object, db: MagicMock, actor: object, payload: dict) -> Exception:
    """Simulate FastAPI propagating the command failure into its dependency."""
    try:
        stocktake.execute(db, actor, "round_close", "same-close-key", payload)
    except Exception as command_error:
        try:
            dependency.throw(command_error)
        except Exception as response_error:
            return response_error
    finally:
        dependency.close()
    pytest.fail("Expected close failure")


@pytest.mark.parametrize("sqlstate", ["57014", "08006"])
def test_unknown_commit_result_is_not_advertised_as_confirmed_rollback_retry(
    monkeypatch: pytest.MonkeyPatch, sqlstate: str,
) -> None:
    """COMMIT timeout/disconnect needs receipt resolution, not a claim of rollback."""
    dependency, db, actor, payload = _close_boundary(monkeypatch)
    commit_error = OperationalError(None, None, PostgresFailure(sqlstate))
    db.commit.side_effect = commit_error
    result = _run_failed_close(dependency, db, actor, payload)
    db.commit.assert_called_once()
    assert db.rollback.called
    assert not (isinstance(result, InventoryConflict) and result.extra.get("retryable") is True), (
        "A successful rollback() call after a COMMIT error does not establish that COMMIT failed; "
        "keep the outcome uncertain and resolve the original receipt key first"
    )


def test_precommit_query_timeout_is_retryable_after_rollback(monkeypatch: pytest.MonkeyPatch) -> None:
    dependency, db, actor, payload = _close_boundary(monkeypatch)
    query_error = OperationalError("SELECT selected_cells", None, PostgresFailure("57014"))
    monkeypatch.setattr(stocktake_closing, "close", MagicMock(side_effect=query_error))
    result = _run_failed_close(dependency, db, actor, payload)
    assert not db.commit.called
    assert db.rollback.called
    assert isinstance(result, InventoryConflict)
    assert result.code == "STOCKTAKE_BUSY" and result.extra["retryable"] is True


def test_rollback_failure_never_advertises_safe_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    dependency, db, actor, payload = _close_boundary(monkeypatch)
    query_error = OperationalError("SELECT selected_cells", None, PostgresFailure("57014"))
    monkeypatch.setattr(stocktake_closing, "close", MagicMock(side_effect=query_error))
    db.rollback.side_effect = RuntimeError("rollback outcome could not be established")
    result = _run_failed_close(dependency, db, actor, payload)
    assert not (isinstance(result, InventoryConflict) and result.extra.get("retryable") is True)
    assert db.close.called
