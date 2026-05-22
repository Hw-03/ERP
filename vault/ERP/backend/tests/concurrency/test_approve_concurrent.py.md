---
layer: backend
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# test_approve_concurrent.py — 스레드 동시 승인 멱등성

> [!summary] 같은 StockRequest를 여러 스레드가 동시 승인해도 1건만 처리되는지 검증

## 1. 역할
ThreadPoolExecutor로 30개 스레드가 동일 요청을 동시 승인. SQLite WAL + busy_timeout 직렬화 및 approve_request 멱등성 검증. TransactionLog 라인당 1건만 기록 확인.

## 2. 실제 원본 위치
`erp/backend/tests/concurrency/test_approve_concurrent.py`

## 3. 관련 형제 파일
- [[test_approve_reject_conflict.py.md|동시 승인-반려 충돌]]
- [[test_cancel_approve_conflict.py.md|취소-승인 충돌]]
- [[conftest.py.md|동시성 픽스처]]
