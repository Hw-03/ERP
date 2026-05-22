---
type: file-explanation
source_path: "backend/tests/test_migration_diagnostics.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_migration_diagnostics.py — test_migration_diagnostics.py 설명

## 이 파일은 무엇을 책임지나

`test_migration_diagnostics.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `shared_engine`
- `test_rerun_is_all_benign_skips`
- `test_real_failure_is_collected_and_logged`

## 연결되는 파일

- [[ERP/backend/tests/📁_tests]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
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
```
