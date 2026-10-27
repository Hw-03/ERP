"""Opt-in request profiling keeps SQL counters isolated without retaining SQL data."""

from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context

import pytest
from sqlalchemy import create_engine, text

from app._slow_query import install_slow_query_hook


def test_query_profile_counts_real_sql_and_resets_after_request() -> None:
    from app.read_query_diagnostics import collect_read_queries

    engine = create_engine("sqlite://")
    install_slow_query_hook(engine)
    try:
        with collect_read_queries(enabled=True) as metrics:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1")).all()
                connection.execute(text("SELECT 2")).all()
            assert metrics.query_count == 2
            assert metrics.sql_ms >= 0
            assert metrics.first_sql_ms is not None
        with engine.connect() as connection:
            connection.execute(text("SELECT 3")).all()
        assert metrics.query_count == 2
    finally:
        engine.dispose()


def test_dependency_marker_survives_threadpool_context_copy() -> None:
    from app.read_query_diagnostics import collect_read_queries, mark_db_dependency

    with collect_read_queries(enabled=True) as metrics:
        with ThreadPoolExecutor(max_workers=1) as pool:
            pool.submit(copy_context().run, mark_db_dependency).result()
        assert metrics.dependency_start_ms is not None
        assert metrics.dependency_start_ms >= 0


def test_profiles_are_disabled_by_default_and_reset_after_exception() -> None:
    from app.read_query_diagnostics import collect_read_queries, mark_db_dependency

    with collect_read_queries(enabled=False) as disabled:
        mark_db_dependency()
        assert disabled is None
    with pytest.raises(ValueError), collect_read_queries(enabled=True):
        raise ValueError("test boundary")
    with collect_read_queries(enabled=True) as metrics:
        assert metrics.query_count == 0
        assert metrics.dependency_start_ms is None


@pytest.mark.parametrize("enabled", [False, True])
def test_middleware_profiles_real_dependency_without_logging_search_values(
    monkeypatch: pytest.MonkeyPatch, enabled: bool,
) -> None:
    from fastapi import Depends, FastAPI
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session, sessionmaker
    from sqlalchemy.pool import StaticPool
    from app import database
    from app import _access_log

    engine = create_engine("sqlite://", poolclass=StaticPool,
                           connect_args={"check_same_thread": False})
    install_slow_query_hook(engine)
    monkeypatch.setattr(database, "SessionLocal", sessionmaker(bind=engine))
    monkeypatch.setattr(database, "_is_file_sqlite", False)
    if enabled:
        monkeypatch.setenv("QUERY_READ_DIAGNOSTICS", "1")
    else:
        monkeypatch.delenv("QUERY_READ_DIAGNOSTICS", raising=False)
    logs = []
    monkeypatch.setattr(_access_log._log, "info", lambda message, *args: logs.append(message % args))
    app = FastAPI()
    app.middleware("http")(_access_log.access_log_middleware)

    @app.get("/api/items")
    def read(db: Session = Depends(database.get_db)) -> list[int]:
        return list(db.execute(text("SELECT 1")).scalars())

    try:
        with TestClient(app) as client:
            response = client.get("/api/items?search=private-test-search")
        assert response.json() == [1]
        profiles = [line for line in logs if "evt=read_query_profile" in line]
        assert len(profiles) == int(enabled)
        if enabled:
            assert "query_count=1" in profiles[0]
            assert "dependency_start_ms=-1" not in profiles[0]
            assert "first_sql_ms=-1" not in profiles[0]
            assert "private-test-search" not in profiles[0]
    finally:
        engine.dispose()


def test_concurrent_request_contexts_have_separate_counters() -> None:
    import asyncio
    from app.read_query_diagnostics import collect_read_queries, record_query_duration

    async def read(count: int) -> int:
        with collect_read_queries(enabled=True) as metrics:
            for _ in range(count):
                record_query_duration(1)
                await asyncio.sleep(0)
            return metrics.query_count

    async def concurrent() -> list[int]:
        return await asyncio.gather(read(2), read(3))

    assert asyncio.run(concurrent()) == [2, 3]
