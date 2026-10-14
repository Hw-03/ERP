"""Close deadlines apply before the first SQLite write lock or authentication SQL."""
import sqlite3
import time

import pytest
from sqlalchemy.exc import OperationalError

from app.database import _create_database_engine


def test_close_connection_wait_is_bounded_before_begin(tmp_path):
    path = tmp_path / "close.db"
    with sqlite3.connect(path) as setup:
        setup.execute("PRAGMA journal_mode=WAL")
        setup.execute("CREATE TABLE sample (id INTEGER)")
    owner = sqlite3.connect(path)
    owner.execute("BEGIN IMMEDIATE")
    engine = _create_database_engine(f"sqlite:///{path.as_posix()}", stocktake_close=True)
    start = time.monotonic()
    try:
        with pytest.raises(OperationalError, match="locked"):
            with engine.begin() as connection:
                connection.exec_driver_sql("SELECT 1")
        assert time.monotonic() - start < 1.6
    finally:
        owner.rollback()
        owner.close()
        engine.dispose()


def test_close_deadline_interrupts_long_sql_and_allows_rollback(tmp_path):
    from app.services.stocktake_deadline import clear
    path = tmp_path / "deadline.db"
    engine = _create_database_engine(f"sqlite:///{path.as_posix()}", stocktake_close=True)
    with engine.connect() as connection:
        connection.exec_driver_sql("CREATE TABLE sample (id INTEGER)")
        connection.info["stocktake_deadline"]["deadline"] = time.monotonic() - 1
        with pytest.raises(Exception, match="STOCKTAKE|종료"):
            connection.exec_driver_sql("INSERT INTO sample VALUES (1)")
        clear(connection)
        connection.rollback()
    engine.dispose()


@pytest.mark.parametrize("suffix,factory_name", [("close-previews", "ClosePreviewSessionLocal"), ("close", "CloseSessionLocal")])
def test_close_http_uses_shared_dependency_with_role_specific_factory(monkeypatch, suffix, factory_name):
    from unittest.mock import MagicMock
    from starlette.requests import Request
    from app import database
    from app.services import weekly_inventory_snapshot
    factory, wrong_factory = MagicMock(), MagicMock()
    monkeypatch.setattr(database, factory_name, factory)
    monkeypatch.setattr(database, "SessionLocal", wrong_factory)
    weekly = MagicMock()
    monkeypatch.setattr(weekly_inventory_snapshot, "ensure_due_snapshot_committed", weekly)
    request = Request({"type": "http", "method": "POST", "path": f"/api/stocktakes/rounds/test/{suffix}", "headers": []})
    dependency = database.get_db(request)
    assert next(dependency) is factory.return_value
    dependency.close()
    wrong_factory.assert_not_called()
    assert weekly.call_count == (0 if suffix == "close-previews" else 1)


def test_resolution_uses_bounded_connection_without_writing_weekly_snapshot(monkeypatch):
    from unittest.mock import MagicMock
    from starlette.requests import Request
    from app import database
    from app.services import weekly_inventory_snapshot
    factory, wrong_factory, weekly = MagicMock(), MagicMock(), MagicMock()
    monkeypatch.setattr(database, "CloseSessionLocal", factory)
    monkeypatch.setattr(database, "SessionLocal", wrong_factory)
    monkeypatch.setattr(weekly_inventory_snapshot, "ensure_due_snapshot_committed", weekly)
    request = Request({"type": "http", "method": "POST", "path": "/api/stocktakes/commands/key/resolve", "headers": []})
    dependency = database.get_db(request)
    assert next(dependency) is factory.return_value
    dependency.close()
    wrong_factory.assert_not_called()
    weekly.assert_not_called()
