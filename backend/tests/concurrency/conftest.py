"""동시성 테스트 전용 fixtures.

기존 conftest.py 의 StaticPool(in-memory)는 단일 연결만 허용하므로 실제 lock 경합을
재현할 수 없다. 이 파일은 파일 기반 SQLite + NullPool 로 다중 연결 경합을 재현한다.
"""

from __future__ import annotations

import sys
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import NullPool

from app.database import Base
from app import models  # noqa: F401


_PT_SEED = [
    ("TR", "T", "R", 10), ("TA", "T", "A", 20), ("TF", "T", "F", 25),
    ("HR", "H", "R", 15), ("HA", "H", "A", 30), ("HF", "H", "F", 35),
    ("VR", "V", "R", 25), ("VA", "V", "A", 40), ("VF", "V", "F", 45),
    ("NR", "N", "R", 50), ("NA", "N", "A", 55), ("NF", "N", "F", 60),
    ("AR", "A", "R", 45), ("AA", "A", "A", 65), ("AF", "A", "F", 70),
    ("PR", "P", "R", 55), ("PA", "P", "A", 75), ("PF", "P", "F", 80),
]


@pytest.fixture()
def concurrent_engine(tmp_path):
    """파일 기반 SQLite + NullPool — 실제 다중 연결 lock 경합 재현."""
    db_path = tmp_path / "concurrent_test.db"
    eng = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )

    @event.listens_for(eng, "connect")
    def _pragmas(dbapi_conn, _):
        # pysqlite 자동 BEGIN 비활성화 — 아래 "begin" 이벤트에서 BEGIN IMMEDIATE 발행
        dbapi_conn.isolation_level = None
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.close()

    @event.listens_for(eng, "begin")
    def _begin_immediate(conn):
        """모든 트랜잭션을 BEGIN IMMEDIATE — 읽기 시점부터 쓰기 락 획득."""
        conn.exec_driver_sql("BEGIN IMMEDIATE")

    Base.metadata.create_all(bind=eng)

    # ProcessType 시드
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=eng)
    seed_session = SessionLocal()
    for code, prefix, suffix, order in _PT_SEED:
        seed_session.add(models.ProcessType(code=code, prefix=prefix, suffix=suffix, stage_order=order))
    seed_session.commit()
    seed_session.close()

    yield eng

    Base.metadata.drop_all(bind=eng)
    eng.dispose()


@pytest.fixture()
def make_session(concurrent_engine):
    """각 스레드가 독립 세션을 생성할 수 있는 팩토리."""
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=concurrent_engine)

    def _make() -> Session:
        return SessionLocal()

    return _make
