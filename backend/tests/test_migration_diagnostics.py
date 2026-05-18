"""WS5 회귀: run_migrations() 가 진짜 실패를 무성(silent) 스킵으로 묻지 않는지.

문제(audit): 기존 run_migrations() 는 모든 DDL/UPDATE 를
`except Exception: skipped += 1` 로 삼켜서, 실서버의 진짜 실패(락/타입불일치/
선행 오브젝트 누락)와 멱등 "이미 존재" 스킵을 구분할 수 없었다.

검증:
- A: 동일 엔진에 schema 생성 후 run_migrations() 2회 → 2회차는 전부 멱등
     스킵(applied == 0, errors == []).
- B: _MIGRATION_DDL 에 보장된 진짜 실패(없는 테이블 ALTER)를 주입 →
     errors 에 잡히고(멱등 스킵으로 분류되지 않음) WARNING 로깅된다.

conftest 의 in-memory + StaticPool 패턴을 따른다. run_migrations() 는
모듈 글로벌 bootstrap_db.engine 을 쓰므로, 결정적 검증을 위해 단일 커넥션을
공유하는 StaticPool 엔진으로 monkeypatch 한다 (기본 :memory:+NullPool 은
매 connect() 마다 빈 DB 라 schema 가 공유되지 않음).
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import bootstrap_db  # noqa: E402  (backend on sys.path per conftest)
from app.database import Base  # noqa: E402
from app import models  # noqa: F401, E402  (Base.metadata 등록)


@pytest.fixture()
def shared_engine(monkeypatch):
    """단일 in-memory SQLite 커넥션을 공유하는 엔진으로 bootstrap_db.engine 치환."""
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(eng, "connect")
    def _pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    # ORM 메타데이터로 베이스 스키마 생성 (ALTER 대상 테이블 존재시킴)
    Base.metadata.create_all(bind=eng)

    monkeypatch.setattr(bootstrap_db, "engine", eng)
    try:
        yield eng
    finally:
        eng.dispose()


def test_rerun_is_all_benign_skips(shared_engine):
    """A: 재실행해도 진짜 실패 0, 카운트 안정 (모든 ALTER 가 멱등 스킵).

    참고: 이 DDL 세트는 순수 ALTER ADD COLUMN 외에
    `CREATE ... IF NOT EXISTS` 와 멱등 post-UPDATE 3건을 포함한다. 후자는
    재실행 시에도 예외 없이 성공하므로 'applied' 에 계속 잡힌다(정상).
    따라서 멱등성의 의미 있는 불변식은 'applied==0' 이 아니라
    "재실행해도 errors==[] 이고 카운트가 1회차와 동일(증가 없음)" 이다.
    """
    first = bootstrap_db.run_migrations()
    assert first["errors"] == []
    assert first["failed"] == 0

    second = bootstrap_db.run_migrations()
    # 재실행 시 진짜 실패 0 — 이미 적용된 컬럼은 멱등 스킵으로 분류돼야 한다.
    assert second["errors"] == []
    assert second["failed"] == 0
    # 새 ALTER 가 더 적용되지 않음(증가 없음) + 스킵 분류가 1회차와 동일.
    assert second["applied"] == first["applied"]
    assert second["skipped"] == first["skipped"]
    # 모든 문장이 applied 또는 skipped 로 분류 (누락/실패 없음).
    total = len(bootstrap_db._MIGRATION_DDL) + 3  # +3 post-UPDATE
    assert second["applied"] + second["skipped"] == total


def test_real_failure_is_collected_and_logged(shared_engine, monkeypatch, caplog):
    """B: 없는 테이블 ALTER 주입 → errors 에 잡히고 WARNING 로깅 (멱등 스킵 아님)."""
    # 먼저 bogus 없이 정상 1회 실행 — 멱등 baseline 확보(이후 재실행은
    # 전부 멱등 스킵이므로 skipped 가 안정적이다).
    bootstrap_db.run_migrations()
    clean = bootstrap_db.run_migrations()
    assert clean["failed"] == 0

    bogus = "ALTER TABLE __no_such_table__ ADD COLUMN x INTEGER"
    monkeypatch.setattr(
        bootstrap_db, "_MIGRATION_DDL", bootstrap_db._MIGRATION_DDL + [bogus]
    )

    # 전체 스위트에서 app.main 이 setup_logging() 으로 erp 로거의
    # propagate=False 를 설정하면 caplog(root 전파 기반)가 못 본다.
    # caplog 핸들러를 erp 로거에 직접 붙여 전파 설정과 무관하게 캡처한다.
    erp_logger = logging.getLogger("erp")
    prev_level = erp_logger.level
    erp_logger.setLevel(logging.WARNING)
    erp_logger.addHandler(caplog.handler)
    try:
        result = bootstrap_db.run_migrations()
    finally:
        erp_logger.removeHandler(caplog.handler)
        erp_logger.setLevel(prev_level)

    # 진짜 실패가 errors 에 정확히 1건 수집됐는지.
    assert result["failed"] == 1
    assert len(result["errors"]) == 1
    assert "__no_such_table__" in result["errors"][0]

    # 핵심: bogus 가 멱등 스킵으로 잘못 묻히지 않았는지.
    # 정상 문장은 이미 멱등 baseline 상태라 skipped 가 clean 과 동일해야 하고,
    # bogus 는 skipped 가 아니라 errors 로만 잡혀야 한다(skipped 증가 없음).
    assert result["skipped"] == clean["skipped"]

    # WARNING 으로 SQL+예외가 로깅됐는지.
    warnings = [r for r in caplog.records if r.levelno >= logging.WARNING]
    assert any("__no_such_table__" in r.getMessage() for r in warnings)
