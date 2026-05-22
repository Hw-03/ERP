---
type: file-explanation
source_path: "backend/tests/concurrency/conftest.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# conftest.py — conftest.py 설명

## 이 파일은 무엇을 책임지나

`conftest.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `concurrent_engine`
- `make_session`

## 연결되는 파일

- [[ERP/backend/tests/concurrency/📁_concurrency]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
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
```
