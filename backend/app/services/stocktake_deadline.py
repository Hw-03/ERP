"""Bound close lock waits and cumulative SQL time without hiding uncertain commits."""
import time

from sqlalchemy import event
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import OperationalError

from app.services.inventory_conflicts import InventoryConflict

KEY = "stocktake_deadline"
LOCK_WAIT_MS = 750
LOCK_SECONDS = 2.0
REQUEST_SECONDS = 10.0


def busy() -> InventoryConflict:
    """Clients may retry the same key only after a confirmed rollback."""
    return InventoryConflict("STOCKTAKE_BUSY", "종료 잠금 또는 실행 시간 제한을 초과했습니다. 같은 요청으로 다시 시도해 주세요.",
        status_code=503, extra={"retryable": True, "retry_delays_seconds": [1, 2, 4], "max_retries": 3,
                                "request_deadline_seconds": REQUEST_SECONDS})


def unknown_result() -> InventoryConflict:
    """A lost commit acknowledgement requires receipt lookup before any new command."""
    return InventoryConflict("COMMAND_RESULT_UNKNOWN", "종료 결과를 확인할 수 없습니다. 동일 작업자의 요청 영수증을 먼저 조회해 주세요.",
                             status_code=503, extra={"retryable": False, "receipt_lookup_required": True})


def clear(connection: Connection) -> None:
    """Disable the limiter before rollback; it must never interrupt recovery."""
    state = connection.info.get(KEY)
    if state is not None:
        state["enabled"] = False


def limit_acquired(connection: Connection) -> None:
    """PostgreSQL starts its short budget when the exclusive Control lock is acquired."""
    state = connection.info.get(KEY)
    if state is not None:
        state["deadline"] = min(state["deadline"], time.monotonic() + LOCK_SECONDS)


def is_timeout(exc: Exception) -> bool:
    """Only known lock/deadline failures are eligible for safe busy retry."""
    if isinstance(exc, InventoryConflict):
        return exc.code == "STOCKTAKE_BUSY"
    if not isinstance(exc, OperationalError):
        return False
    original = exc.orig
    sqlstate = getattr(original, "sqlstate", None) or getattr(original, "pgcode", None)
    sqlite_code = getattr(original, "sqlite_errorcode", None)
    return sqlstate in {"55P03", "57014"} or (sqlite_code is not None and sqlite_code & 255 in {5, 6, 9})


def install(engine: Engine) -> None:
    """Install only on the dedicated close engine, leaving other requests unchanged."""
    @event.listens_for(engine, "connect")
    def connected(raw: object, record: object) -> None:
        state = {"enabled": False, "deadline": 0.0}
        record.info[KEY] = state
        if engine.dialect.name == "sqlite":
            raw.set_progress_handler(lambda: int(state["enabled"] and time.monotonic() >= state["deadline"]), 1000)

    @event.listens_for(engine, "begin")
    def begin(connection: Connection) -> None:
        state = connection.info[KEY]
        state.update(enabled=True, deadline=time.monotonic() + REQUEST_SECONDS)
        if engine.dialect.name != "sqlite":
            connection.exec_driver_sql(f"SET LOCAL lock_timeout = '{LOCK_WAIT_MS}ms'")

    @event.listens_for(engine, "before_cursor_execute")
    def before_sql(connection: Connection, cursor: object, statement: str, parameters: object,
                   context: object, executemany: bool) -> None:
        state = connection.info.get(KEY)
        if not state or not state["enabled"]:
            return
        remaining = state["deadline"] - time.monotonic()
        if remaining <= 0:
            raise busy()
        if engine.dialect.name != "sqlite":
            cursor.execute(f"SET LOCAL statement_timeout = '{max(1, int(remaining * 1000))}ms'")

    @event.listens_for(engine, "after_cursor_execute")
    def after_sql(connection: Connection, cursor: object, statement: str, parameters: object,
                  context: object, executemany: bool) -> None:
        if engine.dialect.name == "sqlite" and statement == "BEGIN IMMEDIATE":
            limit_acquired(connection)

    @event.listens_for(engine, "commit")
    def before_commit(connection: Connection) -> None:
        state = connection.info.get(KEY)
        if state and state["enabled"] and time.monotonic() >= state["deadline"]:
            raise busy()
        if state and state["enabled"] and engine.dialect.name != "sqlite":
            cursor = connection.connection.driver_connection.cursor()
            try:
                remaining = max(1, int((state["deadline"] - time.monotonic()) * 1000))
                cursor.execute(f"SET LOCAL statement_timeout = '{remaining}ms'")
            finally:
                cursor.close()

    @event.listens_for(engine, "rollback")
    def before_rollback(connection: Connection) -> None:
        clear(connection)
