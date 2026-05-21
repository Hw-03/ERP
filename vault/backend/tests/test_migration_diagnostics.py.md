---
layer: backend
---

# test_migration_diagnostics.py — 마이그레이션 무성 스킵 방지

> [!summary] WS5 회귀: run_migrations()가 실패를 멱등 스킵으로 묻지 않음

## 1. 역할
schema 생성 후 2회 실행(멱등 스킵 검증) + 보장된 실패 주입(에러 캐치). StaticPool로 schema 공유. WARNING 로깅 확인.

## 2. 실제 원본 위치
`erp/backend/tests/test_migration_diagnostics.py`

## 3. 관련 형제 파일
- [[conftest.py.md|공용 픽스처]]
