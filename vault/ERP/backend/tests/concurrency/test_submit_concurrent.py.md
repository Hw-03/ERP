---
layer: backend
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# test_submit_concurrent.py — 요청 제출 동시성

> [!summary] DRAFT 요청을 30스레드 동시 제출. 1건만 상태 전환, 나머지 에러

## 1. 역할
같은 DRAFT를 다중 제출 시도. 정확히 1건이 RESERVED/COMPLETED/SUBMITTED로 전환, 나머지는 실패. 트랜잭션 일관성 검증.

## 2. 실제 원본 위치
`erp/backend/tests/concurrency/test_submit_concurrent.py`

## 3. 관련 형제 파일
- [[test_approve_concurrent.py.md|동시 승인]]
- [[test_cancel_approve_conflict.py.md|취소-승인 충돌]]
