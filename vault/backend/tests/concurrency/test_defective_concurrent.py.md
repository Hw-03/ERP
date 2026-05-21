---
layer: backend
---

# test_defective_concurrent.py — 불량 격리 동시성

> [!summary] 창고/부서 불량 처리 동시 실행하기. 음수 재고 없음 + 격리 상태 정합성

## 1. 역할
mark_defective() 다중 스레드 동시 호출. 창고/부서 각각 10개 + 부서 10개 동시 처리. 최종 재고 예측+검증.

## 2. 실제 원본 위치
`erp/backend/tests/concurrency/test_defective_concurrent.py`

## 3. 관련 형제 파일
- [[test_consume_warehouse_concurrent.py.md|창고 차감]]
- [[test_dept_adjustment_concurrent.py.md|교차 아이템 조정]]
