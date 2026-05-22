---
layer: backend
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# test_inventory_invariant.py — 재고 불변식 다중 이동

> [!summary] 동시 이동/격리 후 total = warehouse + 부서 합 검증

## 1. 역할
다중 이동(transfer_to_production, transfer_to_warehouse, mark_defective) 동시 실행. Inventory.quantity == warehouse_qty + Σ InventoryLocation.quantity 불변식 유지 확인.

## 2. 실제 원본 위치
`erp/backend/tests/concurrency/test_inventory_invariant.py`

## 3. 관련 형제 파일
- [[test_transfer_concurrent.py.md|이동 동시성]]
- [[test_defective_concurrent.py.md|불량 격리]]
