"""SQLite GET 전용 read session 회귀 테스트."""

from __future__ import annotations

import time
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import event, text
from sqlalchemy.exc import OperationalError
from starlette.requests import Request

from app import database


def _request(method: str, path: str = "/probe", route_path: str | None = None) -> Request:
    return Request(
        {
            "type": "http",
            "method": method,
            "path": path,
            "route": SimpleNamespace(path=route_path or path),
            "headers": [],
            "query_string": b"",
            "server": ("testserver", 80),
            "client": ("testclient", 123),
            "scheme": "http",
        }
    )


def test_sqlite_read_engine_reads_committed_snapshot_while_writer_is_open(tmp_path):
    db_url = f"sqlite:///{(tmp_path / 'read-route.db').as_posix()}"
    writer_engine = database._create_database_engine(db_url)
    read_engine = database._create_database_engine(db_url, sqlite_read_only=True)

    @event.listens_for(read_engine, "connect")
    def _short_read_timeout(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA busy_timeout=50")
        cursor.close()

    try:
        with writer_engine.begin() as connection:
            connection.execute(text("CREATE TABLE probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"))
            connection.execute(text("INSERT INTO probe (id, value) VALUES (1, 'committed')"))

        locker = writer_engine.connect()
        transaction = locker.begin()
        locker.execute(text("UPDATE probe SET value = 'pending' WHERE id = 1"))
        try:
            started = time.perf_counter()
            with read_engine.connect() as connection:
                value = connection.scalar(text("SELECT value FROM probe WHERE id = 1"))
            elapsed = time.perf_counter() - started
        finally:
            transaction.rollback()
            locker.close()

        assert value == "committed"
        assert elapsed < 0.25
    finally:
        read_engine.dispose()
        writer_engine.dispose()


def test_sqlite_read_engine_rejects_dml(tmp_path):
    db_url = f"sqlite:///{(tmp_path / 'query-only.db').as_posix()}"
    writer_engine = database._create_database_engine(db_url)
    read_engine = database._create_database_engine(db_url, sqlite_read_only=True)
    try:
        with writer_engine.begin() as connection:
            connection.execute(text("CREATE TABLE probe (id INTEGER PRIMARY KEY)"))

        with read_engine.connect() as connection:
            with pytest.raises(OperationalError, match="readonly"):
                connection.execute(text("INSERT INTO probe (id) VALUES (1)"))
    finally:
        read_engine.dispose()
        writer_engine.dispose()


@pytest.mark.parametrize("method", ["GET", "HEAD"])
def test_get_db_uses_read_session_for_file_sqlite_reads(method):
    read_session = MagicMock()
    writer_factory = MagicMock()
    read_factory = MagicMock(return_value=read_session)
    with (
        patch.object(database, "_is_file_sqlite", True),
        patch.object(database, "SessionLocal", writer_factory),
        patch.object(database, "ReadSessionLocal", read_factory),
    ):
        generator = database.get_db(_request(method))
        assert next(generator) is read_session
        generator.close()

    read_factory.assert_called_once_with()
    writer_factory.assert_not_called()
    read_session.close.assert_called_once_with()


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
def test_get_db_keeps_mutations_on_writer_session(method):
    writer_session = MagicMock()
    writer_factory = MagicMock(return_value=writer_session)
    read_factory = MagicMock()
    with (
        patch.object(database, "_is_file_sqlite", True),
        patch.object(database, "SessionLocal", writer_factory),
        patch.object(database, "ReadSessionLocal", read_factory),
    ):
        generator = database.get_db(_request(method))
        assert next(generator) is writer_session
        generator.close()

    writer_factory.assert_called_once_with()
    read_factory.assert_not_called()
    writer_session.close.assert_called_once_with()


PREVIEW_ROUTES = [
    ("/api/io/preview", "/api/io/preview"),
    (
        "/api/inventory/operations/00000000-0000-0000-0000-000000000001/cancel/preview",
        "/api/inventory/operations/{operation_id}/cancel/preview",
    ),
]


@pytest.mark.parametrize(("path", "route_path"), PREVIEW_ROUTES)
def test_file_sqlite_previews_skip_both_write_guards(path, route_path):
    read_session = MagicMock()
    with (
        patch.object(database, "_is_file_sqlite", True),
        patch.object(database, "SessionLocal") as writer_factory,
        patch.object(database, "ReadSessionLocal", return_value=read_session),
        patch("app.services.weekly_inventory_snapshot.ensure_due_snapshot_committed") as snapshot,
        patch("app.services.stocktake_guard.lock_control") as control,
    ):
        generator = database.get_db(_request("POST", path, route_path))
        assert next(generator) is read_session
        generator.close()

    writer_factory.assert_not_called()
    snapshot.assert_not_called()
    control.assert_not_called()
    read_session.close.assert_called_once_with()


@pytest.mark.parametrize(("method", "path", "route_path", "file_sqlite"), [
    ("POST", "/api/io/submit", "/api/io/submit", True),
    ("POST", "/api/inventory/operations/id/cancel", "/api/inventory/operations/{operation_id}/cancel", True),
    ("POST", "/api/io/other/preview", "/api/io/other/preview", True),
    ("POST", "/api/io/preview/extra", "/api/io/preview/extra", True),
    ("PUT", "/api/io/preview", "/api/io/preview", True),
    ("POST", "/api/io/preview", "/api/io/preview", False),
    ("POST", "/api/inventory/other/id/cancel/preview", "/api/inventory/other/{operation_id}/cancel/preview", True),
])
def test_only_file_sqlite_preview_routes_bypass_write_guards(method, path, route_path, file_sqlite):
    writer_session = MagicMock()
    with (
        patch.object(database, "_is_file_sqlite", file_sqlite),
        patch.object(database, "SessionLocal", return_value=writer_session),
        patch.object(database, "ReadSessionLocal") as reader,
        patch("app.services.weekly_inventory_snapshot.ensure_due_snapshot_committed") as snapshot,
        patch("app.services.stocktake_guard.lock_control") as control,
    ):
        generator = database.get_db(_request(method, path, route_path))
        assert next(generator) is writer_session
        generator.close()

    reader.assert_not_called()
    snapshot.assert_called_once_with(writer_session, source="first_write")
    control.assert_called_once_with(writer_session, exclusive=False)


def test_preview_read_session_rolls_back_and_closes_on_error():
    read_session = MagicMock()
    with (
        patch.object(database, "_is_file_sqlite", True),
        patch.object(database, "ReadSessionLocal", return_value=read_session),
        patch("app.services.weekly_inventory_snapshot.ensure_due_snapshot_committed"),
        patch("app.services.stocktake_guard.lock_control"),
    ):
        generator = database.get_db(_request("POST", "/api/io/preview"))
        assert next(generator) is read_session
        with pytest.raises(ValueError, match="preview failed"):
            generator.throw(ValueError("preview failed"))

    read_session.rollback.assert_called_once_with()
    read_session.close.assert_called_once_with()


def test_get_db_keeps_in_memory_sqlite_get_on_existing_session_factory():
    writer_session = MagicMock()
    writer_factory = MagicMock(return_value=writer_session)
    read_factory = MagicMock()
    with (
        patch.object(database, "_is_file_sqlite", False),
        patch.object(database, "SessionLocal", writer_factory),
        patch.object(database, "ReadSessionLocal", read_factory),
    ):
        generator = database.get_db(_request("GET"))
        assert next(generator) is writer_session
        generator.close()

    writer_factory.assert_called_once_with()
    read_factory.assert_not_called()
