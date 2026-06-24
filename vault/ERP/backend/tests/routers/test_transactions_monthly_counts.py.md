# test_transactions_monthly_counts.py

## 이 파일은 뭐예요?
`GET /api/inventory/transactions/monthly-counts` 엔드포인트 단위 테스트. 지정 연도의 월별 거래 건수를 12개월 모두 반환하는지, `archived_at`이 있는 레코드가 카운트에서 제외되는지를 검증한다.

## 언제 보나요?
- 월별 거래 집계 API 로직을 수정할 때
- `archived_at` 필터링 동작을 확인할 때
- year 파라미터 유효성(2000~2199 범위 등) 검증을 변경할 때

## 중요한 내용
- `_make_log(db_session, item, tx_type, created_at)`: TransactionLog 생성 헬퍼
- 응답 형식: `{"2026-03": 2, "2026-07": 1, ..., "2026-01": 0}` — 12개 키 고정
- `archived_at`이 있는 레코드는 집계에서 제외
- 유효하지 않은 year (1999, 2200) → 422

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/io.py]] — monthly-counts 엔드포인트 구현
- [[ERP/backend/app/models/📁_models]] — TransactionLog, TransactionTypeEnum
