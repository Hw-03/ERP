---
layer: backend
---

# test_production_receipt_concurrent_same_item.py — 생산 입고 경합

> [!summary] WS9 회귀: 같은 부품 생산 입고 2건 경합 시 1건만 성공, orphan 없음

## 1. 역할
2개 생산 입고가 같은 부품 소모 시 정확히 1건만 2xx, 나머지는 422. 재고 불변식 유지, 부분 배치 없음. HTTP + conftest 파일 기반 SQLite로 실제 경합 재현.

## 2. 실제 원본 위치
`erp/backend/tests/concurrency/test_production_receipt_concurrent_same_item.py`

## 3. 관련 형제 파일
- [[conftest.py.md|동시성 픽스처]]
- [[test_inventory_invariant.py.md|재고 불변식]]
