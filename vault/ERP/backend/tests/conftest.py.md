---
type: file-explanation
source_path: "backend/tests/conftest.py"
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

- `_reset_rate_limit`
- `db_session`
- `client`
- `make_item`
- `make_location`
- `make_bom`

## 연결되는 파일

- [[ERP/backend/tests/📁_tests]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""공용 pytest fixtures.

in-memory SQLite + 단일 connection 기반. PRAGMA 셋업과 Base.metadata.create_all
이후 세션을 yield 한다. 각 테스트는 독립된 DB 를 받는다 (모듈 스코프 X).
"""

from __future__ import annotations

import os
import sys
from decimal import Decimal
from pathlib import Path

# 5.4-C: pytest 가 실제 backend/mes.db 를 건드리지 않도록 보장.
# database.py 가 모듈 로드 시 engine = create_engine(DATABASE_URL) 을 평가하므로
# app.* import 전에 DATABASE_URL 을 in-memory 로 고정한다.
# 어떤 fixture 가 app.main 을 import 해도 default engine 이 in-memory 라 실 DB 안 건드림.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

# tests/ 가 backend/ 하위지만, app 패키지 import 를 위해 backend 를 path 에 추가
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import Base  # noqa: E402  (path 보강 후 import)
from app import models  # noqa: F401, E402  (Base.metadata 등록을 위해 import)


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    """매 테스트마다 in-process PIN 레이트 리미터 상태 초기화.

    실패-시도 카운터가 테스트 간 누수되어 의도치 않은 429 가 나지 않도록 보장한다.
    """
    from app.services import rate_limit

    rate_limit.reset_all()
    yield
    rate_limit.reset_all()


@pytest.fixture()
def db_session() -> Session:
    """함수당 신규 in-memory SQLite + 모든 테이블 생성 + 세션 yield."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
```
