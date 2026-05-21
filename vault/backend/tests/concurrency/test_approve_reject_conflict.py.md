---
layer: backend
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# test_approve_reject_conflict.py — 승인/반려 경쟁

> [!summary] 같은 요청에 승인+반려 동시 실행 → 터미널 상태 1개만 유지

## 1. 역할
10쌍(승인+반려) 스레드 동시 실행. RESERVED → COMPLETED 또는 REJECTED만 허용. TransactionLog 최대 1건, 음수 재고 방지 검증.

## 2. 실제 원본 위치
`erp/backend/tests/concurrency/test_approve_reject_conflict.py`

## 3. 관련 형제 파일
- [[test_approve_concurrent.py.md|순수 동시 승인]]
- [[test_inventory_invariant.py.md|재고 불변식]]
