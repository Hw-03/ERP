---
type: code-note
project: ERP
layer: backend
source_path: backend/app/database.py
status: active
tags:
  - erp
  - backend
  - database
aliases:
  - DB 연결
  - 세션 관리
---

# database.py

> [!summary] 역할
> SQLAlchemy를 이용해 SQLite 데이터베이스에 연결하고, 세션과 Base 클래스를 제공한다.
> 모든 모델과 라우터는 여기서 가져온 `SessionLocal`과 `Base`를 사용한다.

> [!info] 주요 책임
> - SQLite DB 파일 경로 설정 (`erp.db`)
> - SQLAlchemy 엔진 생성 (`engine`)
> - 세션 팩토리 생성 (`SessionLocal`)
> - ORM Base 클래스 제공 (`Base`)
> - FastAPI dependency로 사용할 `get_db()` 함수 제공

> [!warning] 주의
> - DB 파일은 `backend/erp.db`에 저장됨 (루트 `erp.db`와 별개)
> - SQLite는 단일 파일 DB이므로 동시 쓰기에 한계가 있음 (프로토타입 수준)

---

## 쉬운 말로 설명

**DB 연결 설정 한 자리에 모아둔 파일**. 다른 파일들은 여기서 `engine`, `Base`, `SessionLocal`, `get_db` 네 가지만 가져다 씀.

DB는 기본적으로 `backend/erp.db` (SQLite 단일 파일). `.env` 에 `DATABASE_URL` 있으면 그 값을 우선(Postgres 등 전환 가능).

---

## 제공하는 것

### `engine`
- SQLAlchemy 엔진. 실제 DB 연결 풀.
- SQLite면 `check_same_thread=False` (FastAPI 멀티스레드 허용).
- Postgres 등이면 `pool_pre_ping=True`, 풀 크기 10 + overflow 20.

### `Base`
- 모든 ORM 클래스의 부모. `models.py` 의 `class Item(Base):` 같은 식으로 상속.

### `SessionLocal`
- 세션 팩토리. `SessionLocal()` 호출해서 세션 생성.
- `autocommit=False, autoflush=False` — 명시적 `db.commit()` 필요.

### `get_db()` (FastAPI Dependency)
```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```
라우터에서 `db: Session = Depends(get_db)` 로 주입받음. 요청 끝나면 자동 close.

---

## SQLite PRAGMA

SQLite 연결 시 자동 설정:
```python
PRAGMA journal_mode=WAL       # Write-Ahead Logging (동시 읽기 성능 ↑)
PRAGMA foreign_keys=ON        # FK 제약 활성화 (기본은 OFF)
```

`foreign_keys=ON` 안 하면 CASCADE DELETE 등이 동작 안 함.

---

## DB 경로 결정

```python
BACKEND_DIR = Path(__file__).resolve().parents[1]   # backend/
DEFAULT_SQLITE_PATH = BACKEND_DIR / "erp.db"        # backend/erp.db

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}")
```

우선순위: `.env` > 기본 경로. `.env` 예:
```
DATABASE_URL=postgresql://user:pw@localhost:5432/erp
```

---

## 사용 예 (라우터)

```python
from fastapi import Depends
from sqlalchemy.orm import Session
from app.database import get_db

@router.get("/items")
def list_items(db: Session = Depends(get_db)):
    return db.query(Item).all()
```

---

## FAQ

**Q. Postgres로 바꾸려면?**
`.env` 에 `DATABASE_URL=postgresql://...` 추가. 그 다음 시작하면 자동으로 Postgres 연결 + `create_all` 로 테이블 생성. 단, SQLite 데이터 이관은 별도 작업 필요.

**Q. `backend/erp.db` 파일이 갑자기 크면?**
`TransactionLog` 누적 때문. 주기적 백업 + 오래된 로그 아카이브 권장.

**Q. WAL 모드 켰는데 뭐가 좋아지나?**
읽기와 쓰기 동시 허용. 기본 모드(DELETE)는 쓰기 중 읽기 블록. 프로덕션 환경 필수.

**Q. 여러 서버 띄우면?**
SQLite로는 안 됨 (파일 잠금 충돌). Postgres로 전환 필요.

**Q. `get_db` 없이 직접 `SessionLocal()` 써도 되나?**
가능하지만 반드시 `try/finally` 로 `close` 해야 함. `main.py` 의 시드 함수들이 그런 패턴.

---

## 관련 문서

- [[backend/app/main.py.md]] — `Base.metadata.create_all(bind=engine)`
- [[backend/app/models.py.md]] — `Base` 상속 ORM
- [[docker-compose.yml.md]] — DB 볼륨 설정

Up: [[backend/app/app]]
