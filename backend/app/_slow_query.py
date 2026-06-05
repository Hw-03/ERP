"""SQLAlchemy 슬로우 쿼리 감지 훅.

SLOW_QUERY_MS(기본 500ms) 초과 시 evt=slow_query WARN 1줄.
SQL 본문은 80자 truncate (정상 SELECT 노이즈 방지).
"""

from __future__ import annotations

import os
import time
from typing import Any

from sqlalchemy import event
from sqlalchemy.engine import Engine

from app._logging import get_logger


_log = get_logger()


def _slow_threshold_ms() -> int:
    try:
        return int(os.environ.get("SLOW_QUERY_MS", "500"))
    except ValueError:
        return 500


SLOW_QUERY_MS = _slow_threshold_ms()

_SQL_MAX = 80
_TIMER_KEY = "_mes_slow_query_t0"


def _truncate(sql: str) -> str:
    s = " ".join(sql.split())
    return s if len(s) <= _SQL_MAX else s[:_SQL_MAX] + "…"


def install_slow_query_hook(engine: Engine) -> None:
    """엔진에 before/after cursor 훅을 1회 설치. 멱등."""
    if getattr(engine, "_mes_slow_query_hooked", False):
        return

    @event.listens_for(engine, "before_cursor_execute")
    def _before(conn: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:  # noqa: ANN401
        context._mes_slow_query_t0 = time.perf_counter()  # type: ignore[attr-defined]

    @event.listens_for(engine, "after_cursor_execute")
    def _after(conn: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:  # noqa: ANN401
        t0 = getattr(context, "_mes_slow_query_t0", None)
        if t0 is None:
            return
        dur_ms = int((time.perf_counter() - t0) * 1000)
        if dur_ms >= SLOW_QUERY_MS:
            _log.warning(
                "evt=slow_query dur_ms=%d sql=%s",
                dur_ms,
                _truncate(statement),
            )

    engine._mes_slow_query_hooked = True  # type: ignore[attr-defined]
