---
layer: backend
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# test_get_db_rollback.py — 세션 롤백 검증

> [!summary] WS4 회귀: get_db() 예외 시 롤백+close. 풀 오염 방지

## 1. 역할
MagicMock으로 get_db() 제너레이터 계약 검증. 핸들러 예외 시 rollback 먼저, close 나중. 풀드 PostgreSQL에서 aborted-transaction 커넥션 반환 방지.

## 2. 실제 원본 위치
`erp/backend/tests/test_get_db_rollback.py`

## 3. 관련 형제 파일
- [[conftest.py.md|공용 픽스처]]
- [[test_stock_requests.py.md|스톡 요청 워크플로]]
