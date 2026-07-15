"""SQLite 잠금 대기가 FastAPI의 안정적인 503 응답으로 변환되는지 검증한다."""

from __future__ import annotations

import json

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool
from starlette.requests import Request

from app.main import _operational_error_handler


def _short_timeout_engine(db_path):
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False, "timeout": 0.05},
        poolclass=NullPool,
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _connection_record):
        dbapi_connection.isolation_level = None
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=50")
        cursor.close()

    @event.listens_for(engine, "begin")
    def _begin_immediate(connection):
        connection.exec_driver_sql("BEGIN IMMEDIATE")

    return engine


def test_lock_beyond_busy_timeout_maps_to_fastapi_503(tmp_path):
    engine = _short_timeout_engine(tmp_path / "locked.db")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE lock_probe (id INTEGER PRIMARY KEY)"))

    locker = engine.connect()
    transaction = locker.begin()
    try:
        with Session(engine) as blocked_session:
            with pytest.raises(OperationalError) as caught:
                blocked_session.execute(text("SELECT 1"))

        request = Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/lock-probe",
                "headers": [],
                "query_string": b"",
                "server": ("testserver", 80),
                "client": ("testclient", 123),
                "scheme": "http",
            }
        )
        response = _operational_error_handler(request, caught.value)
        payload = json.loads(response.body)

        assert response.status_code == 503
        assert payload["detail"]["code"] == "DB_UNAVAILABLE"
    finally:
        transaction.rollback()
        locker.close()
        engine.dispose()
