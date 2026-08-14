"""Revision tracking and worker-local realtime delivery."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import AsyncIterator, Iterator

from sqlalchemy import event, func, update
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import SessionLocal, engine
from app.models import DataRevision


_log = logging.getLogger(__name__)
_REVISION_SUPPRESSION_INFO_KEY = "mes_suppress_realtime_revision"
_MISSING_INFO_VALUE = object()


@dataclass(frozen=True)
class RevisionSnapshot:
    """One immutable revision value read from the shared database."""

    revision: int
    updated_at: datetime


class DataRevisionError(RuntimeError):
    """Raised when the singleton row cannot be advanced safely."""


@contextmanager
def suppress_realtime_revision(session: Session) -> Iterator[None]:
    """한 commit 범위의 비업무 저장이 operational revision을 올리지 않게 한다."""

    previous = session.info.get(_REVISION_SUPPRESSION_INFO_KEY, _MISSING_INFO_VALUE)
    session.info[_REVISION_SUPPRESSION_INFO_KEY] = True
    try:
        yield
    finally:
        if previous is _MISSING_INFO_VALUE:
            session.info.pop(_REVISION_SUPPRESSION_INFO_KEY, None)
        else:
            session.info[_REVISION_SUPPRESSION_INFO_KEY] = previous


def _advance_revision_before_commit(session: Session) -> None:
    """Advance the singleton inside the transaction being committed."""

    if session.info.get(_REVISION_SUPPRESSION_INFO_KEY):
        return
    if session.in_nested_transaction():
        return
    session.flush()
    result = session.execute(
        update(DataRevision)
        .where(DataRevision.id == 1)
        .values(
            revision=DataRevision.revision + 1,
            updated_at=func.current_timestamp(),
        )
    )
    if result.rowcount != 1:
        raise DataRevisionError(
            "data_revision singleton update affected "
            f"{result.rowcount} rows; expected exactly 1"
        )


def register_session_listeners(
    session_factory: sessionmaker | None = None,
) -> None:
    """Register one fail-closed commit listener on the selected factory."""

    target = session_factory if session_factory is not None else SessionLocal
    if event.contains(target, "before_commit", _advance_revision_before_commit):
        return
    event.listen(target, "before_commit", _advance_revision_before_commit)


def unregister_session_listeners(
    session_factory: sessionmaker | None = None,
) -> None:
    """Remove the listener from an injected test factory when present."""

    target = session_factory if session_factory is not None else SessionLocal
    if event.contains(target, "before_commit", _advance_revision_before_commit):
        event.remove(target, "before_commit", _advance_revision_before_commit)


class RevisionBroker:
    """Poll the shared DB once per worker and fan out only the latest value."""

    def __init__(self, engine: Engine, *, poll_interval: float = 0.5) -> None:
        self._engine = engine
        self._poll_interval = poll_interval
        self._subscribers: set[asyncio.Queue[RevisionSnapshot]] = set()
        self._lock = asyncio.Lock()
        self._task: asyncio.Task[None] | None = None
        self._last_snapshot: RevisionSnapshot | None = None

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    @property
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    @property
    def last_snapshot(self) -> RevisionSnapshot | None:
        return self._last_snapshot

    async def read_snapshot(self) -> RevisionSnapshot:
        """Read without blocking the event loop or invoking engine begin hooks."""

        return await asyncio.to_thread(self._read_snapshot_raw)

    @asynccontextmanager
    async def subscribe(
        self,
    ) -> AsyncIterator[asyncio.Queue[RevisionSnapshot]]:
        """Register one bounded subscriber and lazily start this worker poller."""

        queue: asyncio.Queue[RevisionSnapshot] = asyncio.Queue(maxsize=1)
        async with self._lock:
            self._subscribers.add(queue)
            if self._last_snapshot is not None:
                queue.put_nowait(self._last_snapshot)
            if not self.is_running:
                self._task = asyncio.create_task(self._poll_loop())
        try:
            yield queue
        finally:
            self._subscribers.discard(queue)

    async def stop(self) -> None:
        """Stop the worker poller and release subscriber references."""

        task = self._task
        self._task = None
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._subscribers.clear()

    async def _poll_loop(self) -> None:
        while True:
            try:
                snapshot = await self.read_snapshot()
                if snapshot != self._last_snapshot:
                    self._last_snapshot = snapshot
                    self._publish(snapshot)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - polling must retry after transient DB failures
                _log.exception("realtime revision poll failed; retrying")
            await asyncio.sleep(self._poll_interval)

    def _publish(self, snapshot: RevisionSnapshot) -> None:
        for queue in tuple(self._subscribers):
            if queue.full():
                queue.get_nowait()
            queue.put_nowait(snapshot)

    def _read_snapshot_raw(self) -> RevisionSnapshot:
        raw_connection = self._engine.raw_connection()
        try:
            cursor = raw_connection.cursor()
            try:
                cursor.execute(
                    "SELECT revision, updated_at FROM data_revision WHERE id = 1"
                )
                row = cursor.fetchone()
            finally:
                cursor.close()
        finally:
            raw_connection.close()
        if row is None:
            raise DataRevisionError("data_revision singleton is missing")
        updated_at = row[1]
        if isinstance(updated_at, str):
            updated_at = datetime.fromisoformat(updated_at)
        if not isinstance(updated_at, datetime):
            raise DataRevisionError("data_revision updated_at is invalid")
        return RevisionSnapshot(revision=int(row[0]), updated_at=updated_at)


revision_broker = RevisionBroker(engine)
