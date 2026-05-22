---
layer: backend
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# test_return_to_supplier_concurrent.py — 불량품 동시 반품

> [!summary] DEFECTIVE 10개, 20스레드 동시 반품. 음수 없음 + 반품 상태 정합

## 1. 역할
return_to_supplier() 다중 스레드 동시 호출. 불량 격리 재고에서 동시 반품. 최종 상태 예측 가능.

## 2. 실제 원본 위치
`erp/backend/tests/concurrency/test_return_to_supplier_concurrent.py`

## 3. 관련 형제 파일
- [[test_defective_concurrent.py.md|불량 격리]]
- [[test_inventory_invariant.py.md|재고 불변식]]
