---
layer: backend
---

# test_reserve_concurrent.py — 예약 동시 경합

> [!summary] 창고 10개, 30스레드 동시 예약하기. 초과/음수 없음 + pending 유효성

## 1. 역할
reserve(1) 30회 동시 호출. 최대 10건 성공, 나머지는 ValueError(avail 부족). 최종 pending_quantity ≤ warehouse_qty 유지.

## 2. 실제 원본 위치
`erp/backend/tests/concurrency/test_reserve_concurrent.py`

## 3. 관련 형제 파일
- [[test_consume_warehouse_concurrent.py.md|창고 차감]]
- [[test_inventory_invariant.py.md|재고 불변식]]
