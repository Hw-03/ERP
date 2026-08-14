"""SQLite GET 전용 read session 회귀 테스트."""

from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import event, text
from sqlalchemy.exc import OperationalError
from starlette.requests import Request

from app import database


def _request(method: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": method,
            "path": "/probe",
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
