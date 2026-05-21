---
layer: backend
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# test_transfer_concurrent_atomic.py — 원자적 UPDATE 검증

> [!summary] 창고 10개 이동(20스레드) + 부서 10개 복귀(20스레드). 원자성 + 음수 없음

## 1. 역할
transfer_to_production(창고→부서) 및 transfer_to_warehouse(부서→창고) 각 20스레드 동시. 음수 없음, 총량 불변식 유지.

## 2. 실제 원본 위치
`erp/backend/tests/concurrency/test_transfer_concurrent_atomic.py`

## 3. 관련 형제 파일
- [[test_transfer_concurrent.py.md|이동 동시성]]
- [[test_inventory_invariant.py.md|재고 불변식]]
