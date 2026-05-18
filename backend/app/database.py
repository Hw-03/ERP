import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

load_dotenv()

BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_SQLITE_PATH = BACKEND_DIR / "erp.db"

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}",
)

_is_sqlite = DATABASE_URL.startswith("sqlite")

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

connect_args = {"check_same_thread": False} if _is_sqlite else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    **({"poolclass": NullPool} if _is_sqlite else {"pool_pre_ping": True, "pool_size": 10, "max_overflow": 20}),
)


if _is_sqlite:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=10000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()
        # pysqlite 자동 BEGIN 비활성화 → begin 이벤트에서 BEGIN IMMEDIATE 직접 발행
        dbapi_conn.isolation_level = None

    @event.listens_for(engine, "begin")
    def set_begin_immediate(conn):
        conn.exec_driver_sql("BEGIN IMMEDIATE")


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        # WS4: 핸들러 중간 예외 시 세션을 명시적으로 롤백한 뒤 반환.
        # 미롤백 시 풀드 PostgreSQL(pool_size=10) 경로에서 aborted-transaction
        # 상태의 커넥션이 풀로 반환돼 다음 요청을 오염시킨다(SQLite/NullPool 은
        # 커넥션 폐기로 가려졌을 뿐). 재던지기로 기존 예외 핸들러 체인은 유지.
        db.rollback()
        raise
    finally:
        db.close()
