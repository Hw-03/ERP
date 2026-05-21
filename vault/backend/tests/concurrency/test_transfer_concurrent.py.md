---
layer: backend
---

# test_transfer_concurrent.py — 이동 동시성 (총량 불변)

> [!summary] transfer_to_production/warehouse 동시 실행. 총량 불변 + 음수 없음

## 1. 역할
창고↔부서 이동 동시 실행. warehouse_qty + Σ InventoryLocation = 불변. 각 위치에서 음수 방지.

## 2. 실제 원본 위치
`erp/backend/tests/concurrency/test_transfer_concurrent.py`

## 3. 관련 형제 파일
- [[test_transfer_concurrent_atomic.py.md|원자적 UPDATE]]
- [[test_inventory_invariant.py.md|재고 불변식]]
