---
layer: backend
---

# test_dept_adjustment_concurrent.py — 교차 아이템 교착 방지

> [!summary] 정렬된 락(lock_inventories) 검증. 교차 아이템 조정 시 교착 없음

## 1. 역할
10스레드는 [A→out, B→out] 순, 다른 10스레드는 [B→out, A→out] 순 동시 조정. 교착 타임아웃 없이 완료. 음수 재고 없음.

## 2. 실제 원본 위치
`erp/backend/tests/concurrency/test_dept_adjustment_concurrent.py`

## 3. 관련 형제 파일
- [[test_consume_warehouse_concurrent.py.md|창고 차감]]
- [[test_inventory_invariant.py.md|재고 불변식]]
