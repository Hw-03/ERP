from __future__ import annotations

import asyncio
import importlib.util
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

from app.models import DataRevision
from app.services import realtime


RealtimeTestBase = declarative_base()


class WorkRow(RealtimeTestBase):
    __tablename__ = "realtime_test_rows"

    id = sa.Column(sa.Integer, primary_key=True)
    name = sa.Column(sa.String(50), nullable=False, unique=True)


def test_realtime_revision_service_module_exists() -> None:
    assert importlib.util.find_spec("app.services.realtime") is not None


@pytest.fixture()
def revision_store():
    engine = sa.create_engine("sqlite://")
    DataRevision.__table__.create(engine)
    RealtimeTestBase.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(
            sa.insert(DataRevision),
            {"id": 1, "revision": 0},
        )
    factory = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine,
    )
    try:
        yield engine, factory
    finally:
        realtime.unregister_session_listeners(factory)
        engine.dispose()


def _revision(engine: sa.Engine) -> int:
    with engine.connect() as connection:
        return int(
            connection.scalar(
                sa.select(DataRevision.revision).where(DataRevision.id == 1)
            )
        )


def test_one_commit_advances_once_even_with_multiple_flushes(revision_store) -> None:
    engine, factory = revision_store
    realtime.register_session_listeners(factory)
    realtime.register_session_listeners(factory)

    with factory() as session:
        session.add(WorkRow(id=1, name="first"))
        session.flush()
        session.add(WorkRow(id=2, name="second"))
        session.flush()
        session.commit()

    assert _revision(engine) == 1


def test_business_flush_precedes_data_revision_update(revision_store) -> None:
    engine, factory = revision_store
    realtime.register_session_listeners(factory)
    statements: list[str] = []

    @sa.event.listens_for(engine, "before_cursor_execute")
    def capture_statement(
        _connection,
        _cursor,
        statement: str,
        _parameters,
        _context,
        _executemany,
    ) -> None:
        statements.append(" ".join(statement.lower().split()))

    try:
        with factory() as session:
            session.add(WorkRow(id=1, name="ordered"))
            session.commit()
    finally:
        sa.event.remove(engine, "before_cursor_execute", capture_statement)

    business_insert = next(
        index
        for index, statement in enumerate(statements)
        if statement.startswith("insert into realtime_test_rows")
    )
    revision_update = next(
        index
        for index, statement in enumerate(statements)
        if statement.startswith("update data_revision")
    )
    assert business_insert < revision_update


def test_nested_commit_only_advances_on_outer_commit(revision_store) -> None:
    engine, factory = revision_store
    realtime.register_session_listeners(factory)

    with factory() as session:
        with session.begin():
            with session.begin_nested():
                session.add(WorkRow(id=1, name="savepoint"))

    assert _revision(engine) == 1


@pytest.mark.parametrize("write_style", ["orm", "core", "bulk"])
def test_orm_core_and_bulk_commits_each_advance_revision(
    revision_store,
    write_style: str,
) -> None:
    engine, factory = revision_store
    realtime.register_session_listeners(factory)

    with factory() as session:
        if write_style == "orm":
            session.add(WorkRow(id=1, name="orm"))
        elif write_style == "core":
            session.execute(
                sa.insert(WorkRow.__table__),
                {"id": 1, "name": "core"},
            )
        else:
            session.bulk_insert_mappings(
                WorkRow,
                [{"id": 1, "name": "bulk"}],
            )
        session.commit()

    assert _revision(engine) == 1


def test_commit_without_business_changes_still_advances_revision(revision_store) -> None:
    engine, factory = revision_store
    realtime.register_session_listeners(factory)

    with factory() as session:
        session.commit()

    assert _revision(engine) == 1


def test_explicit_rollback_does_not_advance_revision(revision_store) -> None:
    engine, factory = revision_store
    realtime.register_session_listeners(factory)

    with factory() as session:
        session.add(WorkRow(id=1, name="rolled-back"))
        session.flush()
        session.rollback()

    assert _revision(engine) == 0


def test_flush_failure_rolls_back_revision_increment(revision_store) -> None:
    engine, factory = revision_store
    realtime.register_session_listeners(factory)
    statements: list[str] = []

    @sa.event.listens_for(engine, "before_cursor_execute")
    def capture_statement(
        _connection,
        _cursor,
        statement: str,
        _parameters,
        _context,
        _executemany,
    ) -> None:
        statements.append(" ".join(statement.lower().split()))

    try:
        with factory() as session:
            session.add_all(
                [
                    WorkRow(id=1, name="duplicate"),
                    WorkRow(id=2, name="duplicate"),
                ]
            )
            with pytest.raises(IntegrityError):
                session.commit()
            session.rollback()
    finally:
        sa.event.remove(engine, "before_cursor_execute", capture_statement)

    assert _revision(engine) == 0
    assert any(
        statement.startswith("insert into realtime_test_rows")
        for statement in statements
    )
    assert not any(
        statement.startswith("update data_revision")
        for statement in statements
    )


def test_missing_singleton_fails_commit_closed() -> None:
    engine = sa.create_engine("sqlite://")
    DataRevision.__table__.create(engine)
    RealtimeTestBase.metadata.create_all(engine)
    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    realtime.register_session_listeners(factory)
    try:
        with factory() as session:
            session.add(WorkRow(id=1, name="must-not-commit"))
            with pytest.raises(RuntimeError, match="singleton"):
                session.commit()
            session.rollback()

        with engine.connect() as connection:
            assert connection.scalar(sa.select(sa.func.count()).select_from(WorkRow)) == 0
    finally:
        realtime.unregister_session_listeners(factory)
        engine.dispose()


def _file_revision_engine(path: Path) -> sa.Engine:
    engine = sa.create_engine(
        f"sqlite:///{path.as_posix()}",
        connect_args={"check_same_thread": False},
    )
    DataRevision.__table__.create(engine)
    with engine.begin() as connection:
        connection.execute(
            sa.insert(DataRevision),
            {"id": 1, "revision": 0},
        )
    return engine


def _set_revision_raw(engine: sa.Engine, revision: int) -> None:
    raw = engine.raw_connection()
    try:
        cursor = raw.cursor()
        try:
            cursor.execute(
                "UPDATE data_revision "
                "SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
                (revision,),
            )
            raw.commit()
        finally:
            cursor.close()
    finally:
        raw.close()


def test_snapshot_read_uses_raw_connection_not_engine_begin(tmp_path: Path) -> None:
    engine = _file_revision_engine(tmp_path / "raw-read.db")

    @sa.event.listens_for(engine, "begin")
    def reject_sqlalchemy_begin(_connection) -> None:
        raise AssertionError("poll read must bypass SQLAlchemy begin listeners")

    broker = realtime.RevisionBroker(engine, poll_interval=0.01)
    try:
        snapshot = asyncio.run(broker.read_snapshot())
    finally:
        engine.dispose()

    assert snapshot.revision == 0
    assert snapshot.updated_at is not None


def test_two_independent_brokers_detect_shared_database_change(tmp_path: Path) -> None:
    engine = _file_revision_engine(tmp_path / "two-workers.db")
    first = realtime.RevisionBroker(engine, poll_interval=0.01)
    second = realtime.RevisionBroker(engine, poll_interval=0.01)

    async def scenario() -> None:
        async with first.subscribe() as first_queue:
            async with second.subscribe() as second_queue:
                assert (await asyncio.wait_for(first_queue.get(), 1)).revision == 0
                assert (await asyncio.wait_for(second_queue.get(), 1)).revision == 0

                await asyncio.to_thread(_set_revision_raw, engine, 1)

                assert (await asyncio.wait_for(first_queue.get(), 1)).revision == 1
                assert (await asyncio.wait_for(second_queue.get(), 1)).revision == 1
        await first.stop()
        await second.stop()

    try:
        asyncio.run(scenario())
    finally:
        engine.dispose()


def test_broker_coalesces_slow_subscriber_to_latest_revision(tmp_path: Path) -> None:
    engine = _file_revision_engine(tmp_path / "coalesce.db")
    broker = realtime.RevisionBroker(engine, poll_interval=0.01)

    async def wait_for_revision(expected: int) -> None:
        for _ in range(100):
            if (
                broker.last_snapshot is not None
                and broker.last_snapshot.revision == expected
            ):
                return
            await asyncio.sleep(0.01)
        raise AssertionError(f"broker did not observe revision {expected}")

    async def scenario() -> None:
        assert broker.is_running is False
        async with broker.subscribe() as queue:
            assert (await asyncio.wait_for(queue.get(), 1)).revision == 0
            assert broker.is_running is True
            assert broker.subscriber_count == 1

            await asyncio.to_thread(_set_revision_raw, engine, 1)
            await wait_for_revision(1)
            await asyncio.to_thread(_set_revision_raw, engine, 2)
            await wait_for_revision(2)

            assert queue.qsize() == 1
            assert queue.get_nowait().revision == 2

        assert broker.subscriber_count == 0
        await broker.stop()
        assert broker.is_running is False

    try:
        asyncio.run(scenario())
    finally:
        engine.dispose()


def test_sqlite_concurrent_commits_do_not_lose_revision_increments(
    tmp_path: Path,
) -> None:
    engine = sa.create_engine(
        f"sqlite:///{(tmp_path / 'concurrent-commits.db').as_posix()}",
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )

    @sa.event.listens_for(engine, "connect")
    def configure_sqlite(dbapi_connection, _record) -> None:
        dbapi_connection.execute("PRAGMA journal_mode=WAL")
        dbapi_connection.execute("PRAGMA busy_timeout=10000")
        dbapi_connection.isolation_level = None

    @sa.event.listens_for(engine, "begin")
    def begin_immediate(connection) -> None:
        connection.exec_driver_sql("BEGIN IMMEDIATE")

    DataRevision.__table__.create(engine)
    RealtimeTestBase.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(
            sa.insert(DataRevision),
            {"id": 1, "revision": 0},
        )
    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    realtime.register_session_listeners(factory)
    barrier = threading.Barrier(4)

    def commit_one(row_id: int) -> None:
        with factory() as session:
            session.add(WorkRow(id=row_id, name=f"worker-{row_id}"))
            barrier.wait(timeout=5)
            session.commit()

    try:
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(commit_one, row_id) for row_id in range(1, 5)]
            for future in futures:
                future.result(timeout=15)

        assert _revision(engine) == 4
    finally:
        realtime.unregister_session_listeners(factory)
        engine.dispose()
