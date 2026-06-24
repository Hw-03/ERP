# test_transactions_export.py

## 이 파일은 뭐예요?
거래 이력 CSV/XLSX export API가 `requester_name` / `approver_name` 컬럼을 올바르게 채우고, `search` 파라미터가 요청자명까지 검색되는지 검증하는 통합 테스트.

## 언제 보나요?
- export 라우터(`/api/inventory/transactions/export.csv`, `.xlsx`) 수정 시
- IoBatch outerjoin으로 요청자/승인자명 컬럼 추가하는 쿼리 변경 시
- 엑셀 export가 status 200인데 내용이 비어있다는 버그 리포트 시

## 중요한 내용
- `_seed_batch_transaction`: `IoBatch` + `StockRequest` + `TransactionLog` 한 세트 시드
- `test_export_csv_includes_requester_and_approver`: CSV 헤더에 두 컬럼 존재 + 행에 이름 채워짐 확인
- `test_export_csv_search_matches_requester_name`: `search=요청자A` 쿼리 파라미터가 CSV 결과에 반영됨
- `test_export_xlsx_ok`: XLSX content-type 확인

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/inventory/transactions.py]] — export 엔드포인트
