# test_transactions_export.py

## 이 파일은 뭐예요?
거래 이력 export(CSV/XLSX) 시 요청자명·승인자명이 올바르게 채워지고, `search` 파라미터가 요청자명까지 매칭되는지 검증하는 통합 테스트.

## 검증하는 것
- CSV export 응답에 `requester_name`, `approver_name` 컬럼 존재 + 실제 이름 포함
- `search=요청자A` 로 CSV export 시 해당 품목 행이 매칭됨(요청자명 검색 동작)
- XLSX export → 200 + `application/vnd.openxmlformats-*` Content-Type

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/inventory/📁_inventory]] — `/api/inventory/transactions/export.csv`, `export.xlsx` (테스트 대상)
