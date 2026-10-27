"""Optional request-local SQL totals; no statements, parameters or payloads retained."""

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from time import perf_counter
from typing import Iterator


@dataclass
class ReadQueryMetrics:
    """Shared by a request's async context and its copied worker-thread context."""

    started: float = field(default_factory=perf_counter)
    query_count: int = 0
    sql_ms: float = 0
    dependency_start_ms: float | None = None
    first_sql_ms: float | None = None


_current: ContextVar[ReadQueryMetrics | None] = ContextVar("read_query_metrics", default=None)


@contextmanager
def collect_read_queries(*, enabled: bool) -> Iterator[ReadQueryMetrics | None]:
    """Reset even failed requests so the next request never inherits counters."""
    metrics = ReadQueryMetrics() if enabled else None
    token = _current.set(metrics)
    try:
        yield metrics
    finally:
        _current.reset(token)


def mark_db_dependency() -> None:
    """Observe dependency entry, including scheduling delay before its worker starts."""
    metrics = _current.get()
    if metrics is not None and metrics.dependency_start_ms is None:
        metrics.dependency_start_ms = (perf_counter() - metrics.started) * 1000


def record_query_duration(duration_ms: float) -> None:
    """Accumulate cursor execution time; ORM fetching and conversion are separate."""
    metrics = _current.get()
    if metrics is None:
        return
    metrics.query_count += 1
    metrics.sql_ms += duration_ms
    if metrics.first_sql_ms is None:
        metrics.first_sql_ms = max(0, (perf_counter() - metrics.started) * 1000 - duration_ms)
