"""Overlapping read calls share only their in-flight computation, never cached results."""
from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from datetime import date
from pathlib import Path
from threading import Event
from typing import Any, Iterator, Optional
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, Query
from fastapi.testclient import TestClient
from pydantic import BaseModel
import pytest
from sqlalchemy import create_engine, delete, event, update
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.models import DataRevision, TransactionTypeEnum
from app.services import read_singleflight


@pytest.fixture
def revision_engine(tmp_path: Path) -> Iterator[Engine]:
    """Use a dedicated database so threads own independent sessions and connections."""
    engine = create_engine(f"sqlite:///{(tmp_path / 'revision.db').as_posix()}")
    DataRevision.__table__.create(engine)
    with engine.begin() as connection:
        connection.execute(DataRevision.__table__.insert().values(id=1, revision=7))
    yield engine
    engine.dispose()


def _waiter_signal(monkeypatch: pytest.MonkeyPatch) -> Event:
    """Observe the follower entering Future.result before releasing the leader."""
    waiting = Event()

    class ObservedFuture(Future):
        def result(self, timeout: float | None = None) -> Any:
            """Signal the actual wait path without relying on thread scheduling delays."""
            waiting.set()
            return super().result(timeout=timeout)

    monkeypatch.setattr(read_singleflight, "Future", ObservedFuture)
    return waiting


def test_capacity_route_shares_overlapping_reads_to_avoid_starving_inventory(
    revision_engine: Engine, monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routers import production

    waiting = _waiter_signal(monkeypatch)
    entered, release = Event(), Event()
    calls = []

    def compute(db: Session) -> dict[str, int]:
        """Hold the measured competing read until the second request joins it."""
        calls.append(1)
        entered.set()
        assert release.wait(5)
        return {"immediate": 3}

    def read() -> dict[str, int]:
        with Session(revision_engine) as db:
            return production.get_production_capacity(db=db)

    monkeypatch.setattr(production, "compute_capacity", compute)
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(read)
        try:
            assert entered.wait(5)
            second = pool.submit(read)
            assert waiting.wait(1), "competing capacity reads repeated the calculation"
        finally:
            release.set()
        assert first.result(timeout=5) == second.result(timeout=5) == {"immediate": 3}
    assert calls == [1]


def test_overlapping_identical_reads_compute_once_and_completed_reads_are_not_cached(
    revision_engine: Engine, monkeypatch: pytest.MonkeyPatch,
) -> None:
    waiting = _waiter_signal(monkeypatch)
    entered, release = Event(), Event()
    calls = []
    value = {"items": [1, 2]}

    def compute() -> dict[str, list[int]]:
        """Keep the leader in flight until the follower is known to be waiting."""
        calls.append(1)
        entered.set()
        assert release.wait(5)
        return value

    def read() -> dict[str, list[int]]:
        """Mirror separate request-scoped sessions against the same bind."""
        with Session(revision_engine) as db:
            return read_singleflight.coalesce_read(db, (compute, "same"), compute)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(read)
        try:
            assert entered.wait(5)
            second = pool.submit(read)
            assert waiting.wait(5)
        finally:
            release.set()
        assert first.result(timeout=5) is value
        assert second.result(timeout=5) is value
    assert calls == [1]
    assert read() is value
    assert calls == [1, 1]
    assert not read_singleflight._inflight


@pytest.mark.parametrize("difference", ["bind", "revision", "function", "arguments"])
def test_different_database_revision_function_or_arguments_never_share(
    revision_engine: Engine, difference: str,
) -> None:
    entered, release = Event(), Event()
    arguments = (date(2026, 10, 27), uuid4(), TransactionTypeEnum.RECEIVE, None, 2000)

    def compute() -> str:
        """Hold one logical read while a distinct one returns independently."""
        entered.set()
        assert release.wait(5)
        return "first"

    def alternate() -> str:
        """Represent a different query function identity."""
        return "second"

    def read_first() -> str:
        """Start the leader with its own Session."""
        with Session(revision_engine) as db:
            return read_singleflight.coalesce_read(db, (compute, arguments), compute)

    other_engine = create_engine(revision_engine.url) if difference == "bind" else revision_engine
    with ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(read_first)
        try:
            assert entered.wait(5)
            if difference == "revision":
                with revision_engine.begin() as connection:
                    connection.execute(update(DataRevision).values(revision=8))
            key = (alternate if difference == "function" else compute,
                   (*arguments[:-1], 100) if difference == "arguments" else arguments)
            with Session(other_engine) as db:
                assert read_singleflight.coalesce_read(db, key, alternate) == "second"
        finally:
            release.set()
        assert first.result(timeout=5) == "first"
    if other_engine is not revision_engine:
        other_engine.dispose()
    assert not read_singleflight._inflight


def test_missing_revision_bypasses_coalescing(revision_engine: Engine) -> None:
    with revision_engine.begin() as connection:
        connection.execute(delete(DataRevision))
    entered, release = Event(), Event()

    def compute() -> str:
        """Leave a revisionless read running while its peer executes separately."""
        entered.set()
        assert release.wait(5)
        return "first"

    def first_read() -> str:
        """Use a request-specific session for the first computation."""
        with Session(revision_engine) as db:
            return read_singleflight.coalesce_read(db, (compute,), compute)

    with ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(first_read)
        try:
            assert entered.wait(5)
            with Session(revision_engine) as db:
                assert read_singleflight.coalesce_read(db, (compute,), lambda: "second") == "second"
        finally:
            release.set()
        assert first.result(timeout=5) == "first"
    assert not read_singleflight._inflight


def test_failure_reaches_all_waiters_and_next_request_retries(
    revision_engine: Engine, monkeypatch: pytest.MonkeyPatch,
) -> None:
    waiting = _waiter_signal(monkeypatch)
    entered, release = Event(), Event()
    failure = ValueError("failed read")

    def compute() -> str:
        """Publish a failure only after another request has joined."""
        entered.set()
        assert release.wait(5)
        raise failure

    def read() -> str:
        """Ensure errors reach followers with their own request sessions."""
        with Session(revision_engine) as db:
            return read_singleflight.coalesce_read(db, (compute,), compute)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(read)
        try:
            assert entered.wait(5)
            second = pool.submit(read)
            assert waiting.wait(5)
        finally:
            release.set()
        for pending in (first, second):
            with pytest.raises(ValueError) as caught:
                pending.result(timeout=5)
            assert caught.value is failure
    assert not read_singleflight._inflight
    with Session(revision_engine) as db:
        assert read_singleflight.coalesce_read(db, (compute,), lambda: "retried") == "retried"


def test_revision_query_errors_propagate_without_running_compute() -> None:
    engine = create_engine("sqlite:///:memory:")
    calls = []
    try:
        with Session(engine) as db, pytest.raises(OperationalError):
            read_singleflight.coalesce_read(db, ("missing table",), lambda: calls.append(1))
    finally:
        engine.dispose()
    assert calls == []
    assert not read_singleflight._inflight


def test_revision_lookup_never_autoflushes_pending_session_changes(revision_engine: Engine) -> None:
    """Discovering a read key must not turn a pending object into a database write."""
    with Session(revision_engine) as db:
        pending = DataRevision(id=1, revision=99)
        db.add(pending)
        assert read_singleflight.coalesce_read(db, ("no autoflush",), lambda: "read") == "read"
        assert pending in db.new
    with revision_engine.connect() as connection:
        assert connection.scalar(DataRevision.__table__.select().with_only_columns(DataRevision.revision)) == 7


class ReadResponse(BaseModel):
    """Verify that the helper does not alter the route's public schema."""
    count: int


def test_helper_preserves_fastapi_openapi_and_response_contract(revision_engine: Engine) -> None:
    app = FastAPI()

    def get_db() -> Iterator[Session]:
        """Give each mini-app request a read session."""
        with Session(revision_engine) as db:
            yield db

    @app.get("/read", response_model=ReadResponse)
    def read_route(limit: int = Query(2, ge=1), db: Session = Depends(get_db)) -> ReadResponse:
        """Integrate through an explicit immutable key, preserving route annotations."""
        return read_singleflight.coalesce_read(db, (read_route, limit), lambda: ReadResponse(count=limit))

    statements = []

    def record(_conn: Any, _cursor: Any, statement: str, *_args: Any) -> None:
        """Check that revision discovery issues only a single read query."""
        statements.append(statement)

    event.listen(revision_engine, "before_cursor_execute", record)
    try:
        with TestClient(app) as client:
            schema = client.get("/openapi.json").json()
            assert schema["paths"]["/read"]["get"]["parameters"][0]["name"] == "limit"
            assert "ReadResponse" in schema["components"]["schemas"]
            assert client.get("/read", params={"limit": 3}).json() == {"count": 3}
    finally:
        event.remove(revision_engine, "before_cursor_execute", record)
    assert len(statements) == 1
    assert statements[0].lstrip().upper().startswith("SELECT")


def test_decorator_resolves_foreign_module_annotations_and_preserves_defaults(
    revision_engine: Engine,
) -> None:
    app = FastAPI()
    calls = []

    def get_db() -> Iterator[Session]:
        """Supply a separate read session to the decorated endpoint."""
        with Session(revision_engine) as db:
            yield db

    @app.get("/decorated", response_model=ReadResponse)
    @read_singleflight.coalesced_read
    def read_route(
        item_id: Optional[UUID] = Query(None),
        day: Optional[date] = Query(None),
        limit: int = Query(2, ge=1),
        db: Session = Depends(get_db),
    ) -> ReadResponse:
        """Retain resolved types when FastAPI inspects a wrapper in another module."""
        calls.append((item_id, day, limit))
        return ReadResponse(count=limit)

    item_id = uuid4()
    with TestClient(app) as client:
        response = client.get("/openapi.json")
        assert response.status_code == 200
        parameters = response.json()["paths"]["/decorated"]["get"]["parameters"]
        assert [parameter["name"] for parameter in parameters] == ["item_id", "day", "limit"]
        assert parameters[0]["schema"]["anyOf"][0]["format"] == "uuid"
        assert parameters[1]["schema"]["anyOf"][0]["format"] == "date"
        response = client.get("/decorated", params={"item_id": str(item_id), "day": "2026-10-27", "limit": 3})
        assert response.status_code == 200, response.text
        assert response.json() == {"count": 3}
        assert client.get("/decorated").json() == {"count": 2}
        assert client.get("/decorated", params={"limit": 0}).status_code == 422
    assert calls == [(item_id, date(2026, 10, 27), 3), (None, None, 2)]
    with Session(revision_engine) as db:
        assert read_route(item_id=item_id, day=None, limit=4, db=db).count == 4


def test_decorator_merges_equivalent_positional_keyword_and_default_arguments(
    revision_engine: Engine, monkeypatch: pytest.MonkeyPatch,
) -> None:
    waiting = _waiter_signal(monkeypatch)
    entered, release = Event(), Event()
    calls = []

    @read_singleflight.coalesced_read
    def read_route(db: Session, limit: int = 2, day: date | None = None) -> int:
        """Equivalent argument spellings must identify the same read operation."""
        calls.append((limit, day))
        entered.set()
        assert release.wait(5)
        return limit

    def read(explicit_defaults: bool) -> int:
        """Keep Session identity out of the key while preserving all other arguments."""
        with Session(revision_engine) as db:
            return read_route(db=db, limit=2, day=None) if explicit_defaults else read_route(db)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(read, False)
        try:
            assert entered.wait(5)
            second = pool.submit(read, True)
            assert waiting.wait(5)
        finally:
            release.set()
        assert first.result(timeout=5) == second.result(timeout=5) == 2
    assert calls == [(2, None)]


def test_decorator_preserves_direct_query_defaults_and_calls_without_a_session(
    revision_engine: Engine,
) -> None:
    """Direct callers retain the original function's default objects and bypass behavior."""
    default_limit = Query(2)

    @read_singleflight.coalesced_read
    def read_route(limit: Any = default_limit, db: Session | None = None) -> Any:
        """Return the actual default to detect unwanted wrapper argument rewriting."""
        return limit

    with Session(revision_engine) as db:
        assert read_route(db=db) is default_limit
        assert read_route(limit=3, db=db) == 3
    assert read_route() is default_limit


def test_direct_query_default_cannot_share_with_an_explicit_scalar(revision_engine: Engine) -> None:
    """A direct Param object and a parsed scalar are different inputs to the original function."""
    default_limit = Query(2)
    entered, explicit_entered, release = Event(), Event(), Event()

    @read_singleflight.coalesced_read
    def read_route(limit: Any = default_limit, db: Session | None = None) -> str:
        """Observe the actual input instead of assuming direct defaults are parsed."""
        if limit is default_limit:
            entered.set()
            assert release.wait(5)
            return "query-default"
        explicit_entered.set()
        return "explicit-scalar"

    def read(explicit: bool) -> str:
        """Use separate request sessions while retaining distinct argument values."""
        with Session(revision_engine) as db:
            return read_route(limit=2, db=db) if explicit else read_route(db=db)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(read, False)
        try:
            assert entered.wait(5)
            second = pool.submit(read, True)
            assert explicit_entered.wait(5)
        finally:
            release.set()
        assert first.result(timeout=5) == "query-default"
        assert second.result(timeout=5) == "explicit-scalar"
