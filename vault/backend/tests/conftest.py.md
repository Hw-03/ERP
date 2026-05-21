---
layer: backend
---

# conftest.py — 공용 pytest 픽스처

> [!summary] in-memory SQLite + StaticPool. 각 테스트 독립 DB + client/db_session/make_* 헬퍼

## 1. 역할
DATABASE_URL=sqlite:///:memory: 환경 고정. app.* import 전 설정으로 실 DB 보호. Base.metadata.create_all + PRAGMA(foreign_keys, journal_mode). FastAPI TestClient 제공.

## 2. 실제 원본 위치
erp/backend/tests/conftest.py

## 3. 관련 형제 파일
- [[test_stock_requests.py.md|스톡 요청 워크플로]]
- [[../concurrency/conftest.py.md|동시성 픽스처]]
