---
layer: backend
topic: database
file: erp/backend/app/database.py
tags:
  - "#layer/backend"
  - "#topic/database"
aliases:
  - database
  - SQLAlchemy 엔진
  - PG/SQLite 가드
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# 🔌 database.py — SQLAlchemy 엔진 & PG/SQLite 가드

> [!summary]
> SQLAlchemy 엔진 초기화, SessionLocal 팩토리, `get_db` 의존성 주입, 그리고 운영 환경에서 SQLite 를 차단하는 **PG 가드(WS2)** 를 담당한다. SQLite 와 PostgreSQL 를 동일한 코드로 지원하되, 운영 환경 오감지를 import 시점에 fail-fast 로 차단한다.

---

## 1. 한 문장 목적

DB 연결 설정 한 곳에 모아 SQLite(개발) / PostgreSQL(운영) 를 자동 분기하고, 운영 환경에서 SQLite 가 실수로 사용되는 것을 import 시점에 차단한다.

---

## 2. 파일 위치 & 임포트 경로

```
erp/backend/app/database.py
from app.database import Base, SessionLocal, get_db, _is_sqlite, BACKEND_DIR
```

---

## 3. 엔진 설정 분기

```python
_is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    **(
        {"poolclass": NullPool}                                    # SQLite
        if _is_sqlite else
        {"pool_pre_ping": True, "pool_size": 10, "max_overflow": 20}  # PostgreSQL
    ),
)
```

| 항목 | SQLite | PostgreSQL |
|------|--------|------------|
| 풀 | NullPool (커넥션 폐기) | pool_size=10, max_overflow=20 |
| 락 | BEGIN IMMEDIATE | FOR UPDATE |
| check_same_thread | False | 해당 없음 |

---

## 4. SQLite WAL 최적화

```python
if _is_sqlite:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, _):
        cursor.execute("PRAGMA journal_mode=WAL")    # WAL 모드: 읽기/쓰기 동시
        cursor.execute("PRAGMA foreign_keys=ON")     # FK 제약 활성화
        cursor.execute("PRAGMA busy_timeout=10000")  # 10초 대기 후 BUSY 에러
        cursor.execute("PRAGMA synchronous=NORMAL")  # 성능/안전 균형

    @event.listens_for(engine, "begin")
    def set_begin_immediate(conn):
        conn.exec_driver_sql("BEGIN IMMEDIATE")
        # WAL + BEGIN IMMEDIATE = 쓰기 직렬화, 동시 읽기 허용
```

---

## 5. PG 가드 (WS2) — 운영 환경 fail-fast

```python
_require_postgres = (
    os.getenv("APP_ENV", "").strip().lower() == "production"
    or os.getenv("REQUIRE_POSTGRES", "").strip().lower() in ("1", "true", "yes")
)
if _require_postgres and _is_sqlite:
    raise RuntimeError("운영 환경인데 DATABASE_URL 이 SQLite...")
    # import 시점 raise → uvicorn 기동 실패 → 컨테이너 fail-fast
```

> [!danger]
> `APP_ENV=production` 또는 `REQUIRE_POSTGRES=1` 을 설정하면 SQLite 로는 절대 기동되지 않는다. 개발/테스트 환경에서는 이 변수를 설정하지 않으면 SQLite 가 허용된다.

---

## 6. get_db 의존성 주입

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()   # WS4: 예외 시 명시적 rollback
        raise
    finally:
        db.close()
```

> [!info] WS4 미롤백 문제
> 미롤백 시 PostgreSQL 풀 커넥션이 aborted-transaction 상태로 반환되어 다음 요청을 오염시킨다. `except` 블록의 `db.rollback()` 이 이를 방지한다.

---

## 7. 주요 상수

| 상수 | 값 | 설명 |
|------|----|------|
| `BACKEND_DIR` | `Path(__file__).parents[1]` | `backend/` 디렉터리 절대 경로 |
| `DEFAULT_SQLITE_PATH` | `BACKEND_DIR / "mes.db"` | SQLite 기본 경로 |
| `_is_sqlite` | bool | True 이면 SQLite, False 이면 PostgreSQL |
| `Base` | declarative_base() | ORM 베이스 클래스 |
| `SessionLocal` | sessionmaker | autocommit=False, autoflush=False |

---

## 8. 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DATABASE_URL` | `sqlite:///mes.db` | DB 연결 문자열 |
| `APP_ENV` | (없음) | `production` 이면 PG 강제 |
| `REQUIRE_POSTGRES` | (없음) | `1` / `true` 이면 PG 강제 |

---

## 9. 의존 관계

```
database.py
  ← dotenv (.env 로드)
  ← sqlalchemy (create_engine, sessionmaker, event, declarative_base)
  호출자: models.py (Base), main.py (get_db), 모든 서비스 (_is_sqlite), audit_csv.py (BACKEND_DIR, SessionLocal)
```

---

## 10. 관련 노트 링크

- [[models.py]] — `Base` 를 임포트해 ORM 클래스 정의
- [[main.py]] — `get_db` 의존성 주입 사용
- [[audit_csv.py]] — `SessionLocal`, `BACKEND_DIR` 사용
