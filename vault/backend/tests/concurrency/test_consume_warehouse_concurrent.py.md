---
layer: backend
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# test_consume_warehouse_concurrent.py — 창고 재고 동시 차감

> [!summary] 창고 10개 재고, 30스레드 동시 차감하기. 음수 방지 + 최종 0 또는 양수

## 1. 역할
consume_warehouse() 함수 동시성 검증. 각 스레드가 1개씩 차감하려 할 때 정확한 직렬화 확인. 최종 재고 예측 가능.

## 2. 실제 원본 위치
`erp/backend/tests/concurrency/test_consume_warehouse_concurrent.py`

## 3. 관련 형제 파일
- [[test_defective_concurrent.py.md|불량 격리]]
- [[test_inventory_invariant.py.md|재고 불변식]]
