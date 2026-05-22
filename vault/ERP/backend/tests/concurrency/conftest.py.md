---
layer: backend
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# conftest.py — 동시성 테스트 픽스처

> [!summary] 파일 기반 SQLite + NullPool + BEGIN IMMEDIATE. 다중 연결 경합 재현

## 1. 역할
concurrent_engine, make_session 제공. StaticPool 대신 NullPool(각 스레드 독립 연결), BEGIN IMMEDIATE(writer 직렬화). 실제 WAL + 경합 동작 재현.

## 2. 실제 원본 위치
`erp/backend/tests/concurrency/conftest.py`

## 3. 관련 형제 파일
- [[test_approve_concurrent.py.md|동시 승인]]
- [[test_production_receipt_concurrent_same_item.py.md|생산 입고 경합]]
