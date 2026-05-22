---
type: file-explanation
source_path: "backend/app/database.py"
importance: critical
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# database.py — database.py 설명

## 이 파일은 무엇을 책임지나

`database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `get_db`

## 연결되는 파일

- [[ERP/backend/app/📁_app]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

이 파일은 운영 데이터, 재고 수량, 승인 상태, DB 구조, 백업/복구 중 하나와 직접 연결됩니다. 수정 전에는 관련 테스트, 백업 여부, 연결 화면/API를 반드시 확인해야 합니다.

## 핵심 발췌

```python
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

load_dotenv()

BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_SQLITE_PATH = BACKEND_DIR / "mes.db"

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
```
