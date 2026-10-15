import os
from collections.abc import Generator
from pathlib import Path

from dotenv import load_dotenv
from fastapi import HTTPException, Request
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool
from app.utils import search as _search  # noqa: F401  # register deterministic SQLite search functions

load_dotenv()

BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_SQLITE_PATH = BACKEND_DIR / "mes.db"

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}",
)

_is_sqlite = DATABASE_URL.startswith("sqlite")
_sqlite_database = make_url(DATABASE_URL).database if _is_sqlite else None
_is_file_sqlite = _is_sqlite and _sqlite_database not in (None, "", ":memory:")

# 실서버 가드(WS2): 운영 환경에서 SQLite/DATABASE_URL 미설정이면 즉시 기동 거부.
# SQLite 는 다중 사용자 동시성(락) 한계로 운영 불가 — '무성(silent) SQLite prod'
# 가 가장 위험한 실패 모드. import 시점 raise → uvicorn 기동 실패 → 컨테이너
# fail-fast(헬스 never green). dev/test/start.bat 는 플래그 미설정 시 기존 동작
# (SQLite 허용) 그대로 유지하므로 pytest·로컬 개발에 영향 없음.
_require_postgres = (
    os.getenv("APP_ENV", "").strip().lower() == "production"
    or os.getenv("REQUIRE_POSTGRES", "").strip().lower() in ("1", "true", "yes")
)
if _require_postgres and _is_sqlite:
    raise RuntimeError(
        "운영 환경(APP_ENV=production 또는 REQUIRE_POSTGRES) 인데 DATABASE_URL 이 "
        "SQLite 이거나 미설정입니다. SQLite 는 다중 사용자 운영 불가입니다 — "
        "PostgreSQL DATABASE_URL 을 설정하세요. "
        "(개발/테스트는 APP_ENV/REQUIRE_POSTGRES 를 비우면 SQLite 가 허용됩니다.)"
    )

def _create_database_engine(
    database_url: str,
    *,
    sqlite_read_only: bool = False,
    stocktake_close: bool = False,
) -> Engine:
    """요청 역할에 맞는 engine을 만들고 SQLite 트랜잭션 경계를 고정한다."""

    is_sqlite = database_url.startswith("sqlite")
    if sqlite_read_only and not is_sqlite:
        raise ValueError("sqlite_read_only requires a SQLite database URL")
    created_engine = create_engine(
        database_url,
        connect_args=({"check_same_thread": False, "timeout": 0.75 if stocktake_close else 10}
                      if is_sqlite else {"connect_timeout": 2} if stocktake_close else {}),
        **(
            {"poolclass": NullPool}
            if is_sqlite
            else {"pool_pre_ping": True, "pool_size": 10, "max_overflow": 20,
                  **({"pool_timeout": 0.75} if stocktake_close else {})}
        ),
    )
    if stocktake_close:
        from app.services.stocktake_deadline import install
        install(created_engine)
    if not is_sqlite:
        return created_engine

    @event.listens_for(created_engine, "connect")
    def set_sqlite_pragma(dbapi_conn, _connection_record) -> None:
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=750" if stocktake_close else "PRAGMA busy_timeout=10000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        if sqlite_read_only:
            cursor.execute("PRAGMA query_only=ON")
        cursor.close()
        # pysqlite 자동 BEGIN 비활성화 → begin 이벤트에서 요청 역할별 BEGIN 직접 발행
        dbapi_conn.isolation_level = None

    @event.listens_for(created_engine, "begin")
    def set_transaction_mode(connection) -> None:
        connection.exec_driver_sql("BEGIN" if sqlite_read_only else "BEGIN IMMEDIATE")

    return created_engine


engine = _create_database_engine(DATABASE_URL)
read_engine = (
    _create_database_engine(DATABASE_URL, sqlite_read_only=True)
    if _is_file_sqlite
    else engine
)


from app._slow_query import install_slow_query_hook  # noqa: E402

install_slow_query_hook(engine)
if read_engine is not engine:
    install_slow_query_hook(read_engine)


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
ReadSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=read_engine)
close_engine = _create_database_engine(DATABASE_URL, stocktake_close=True)
CloseSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=close_engine)
snapshot_engine = read_engine if _is_sqlite else engine.execution_options(isolation_level="REPEATABLE READ")
ClosePreviewSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=snapshot_engine)

Base = declarative_base()


_WEEKLY_SNAPSHOT_GUARD_PREFIXES = (
    "/api/items",
    "/api/inventory",
    "/api/io",
    "/api/production",
    "/api/shipping",
    "/api/stock-requests",
    "/api/handovers",
    "/api/dept-adjustment",
    "/api/defects",
    "/api/stocktakes",
)

_SQLITE_READ_ONLY_PREVIEW_ROUTES = frozenset({
    "/api/io/preview",
    "/api/inventory/operations/{operation_id}/cancel/preview",
})


def _requires_weekly_snapshot_guard(request: Request) -> bool:
    """재고 수량이나 완료품 활성 범위에 영향을 줄 수 있는 쓰기인지 판정한다."""

    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return False
    path = request.url.path
    return any(
        path == prefix or path.startswith(f"{prefix}/")
        for prefix in _WEEKLY_SNAPSHOT_GUARD_PREFIXES
    )


def get_db(request: Request) -> Generator[Session, None, None]:
    """확인된 SQLite 미리보기만 읽기 연결로 보내고 실제 변경은 기존 가드로 보호한다."""
    read_only_preview = (
        _is_file_sqlite
        and request.method == "POST"
        and getattr(request.scope.get("route"), "path", None) in _SQLITE_READ_ONLY_PREVIEW_ROUTES
    )
    close_preview = request.method == "POST" and request.url.path.startswith("/api/stocktakes/rounds/") and request.url.path.endswith("/close-previews")
    closing = request.method == "POST" and request.url.path.startswith("/api/stocktakes/rounds/") and request.url.path.endswith("/close")
    resolving = request.method == "POST" and request.url.path.startswith("/api/stocktakes/commands/") and request.url.path.endswith("/resolve")
    bounded = closing or resolving
    session_factory = (
        ClosePreviewSessionLocal if close_preview else CloseSessionLocal if bounded else
        ReadSessionLocal
        if _is_file_sqlite and (request.method in {"GET", "HEAD"} or read_only_preview)
        else SessionLocal
    )
    db = session_factory()
    try:
        if close_preview:
            db.info["stocktake_preview_writer"] = engine
            if not _is_sqlite:
                db.connection().exec_driver_sql("SET TRANSACTION READ ONLY")
        if bounded:
            db.info["stocktake_close_request"] = True
        if not close_preview and not resolving and not read_only_preview and _requires_weekly_snapshot_guard(request):
            from app.services.weekly_inventory_snapshot import (
                WeeklyInventorySnapshotGapError,
                ensure_due_snapshot_committed,
            )

            try:
                ensure_due_snapshot_committed(db, source="first_write")
            except WeeklyInventorySnapshotGapError as exc:
                raise HTTPException(
                    status_code=503,
                    detail={
                        "code": "DB_UNAVAILABLE",
                        "message": str(exc),
                    },
                ) from exc
        if not read_only_preview and request.method not in {"GET", "HEAD", "OPTIONS"} and (
            _requires_weekly_snapshot_guard(request)
            or request.url.path.startswith(("/api/warehouse-map/", "/api/settings/"))
            or request.url.path == "/api/departments" or request.url.path.startswith("/api/departments/")
        ) and not request.url.path.startswith("/api/stocktakes/"):
            from app.services.stocktake_guard import lock_control
            lock_control(db, exclusive=request.url.path == "/api/warehouse-map/box-tracking")
        yield db
    except Exception as exc:
        # WS4: 핸들러 중간 예외 시 세션을 명시적으로 롤백한 뒤 반환.
        # 미롤백 시 풀드 PostgreSQL(pool_size=10) 경로에서 aborted-transaction
        # 상태의 커넥션이 풀로 반환돼 다음 요청을 오염시킨다(SQLite/NullPool 은
        # 커넥션 폐기로 가려졌을 뿐). 재던지기로 기존 예외 핸들러 체인은 유지.
        db.rollback()
        if bounded:
            from app.services.stocktake_deadline import busy, is_timeout
            if is_timeout(exc):
                raise busy() from exc
        raise
    finally:
        db.close()
