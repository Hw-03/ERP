---
layer: backend
---

# test_transactions_summary.py — 입출고 내역 KPI

> [!summary] GET /api/inventory/transactions/summary. 필터 동일 + 4개 KPI 카운트 반환

## 1. 역할
list_transactions와 동일 필터(100건 아닌 전체 조건). 입/출/반품/불량 카운트 집계. TransactionLog 시딩.

## 2. 실제 원본 위치
`erp/backend/tests/routers/test_transactions_summary.py`

## 3. 관련 형제 파일
- [[test_weekly_report.py.md|주간보고]]
- [[../conftest.py.md|공용 픽스처]]
