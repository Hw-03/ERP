# query-transactions.test.ts

## 이 파일은 뭐예요?
MSW와 React Query를 결합한 입출고 내역 hook 통합 테스트 파일(W7-4)입니다. 거래 내역 조회·요약·수정이력·메타편집·수량정정·월별집계 hook의 정상 동작과 에러(404, 403, 422) 처리를 검증합니다.

## 언제 보나요?
- `useTransactionsQuery` 계열 hook이나 트랜잭션 API를 수정할 때
- PIN 기반 거래 수정(메타편집·수량정정) 흐름에 문제가 생겼을 때

## 중요한 내용
- `useTransactionsQuery` — 목록 조회, params(transactionType·limit) 전달 지원, 404 에러 처리
- `useTransactionsSummaryQuery` — `total`, `warehouseCount`, `departmentCounts` 검증
- `useTransactionEditsQuery(logId)` — 수정이력 조회, 빈 문자열 시 `fetchStatus: "idle"`
- `useMetaEditTransactionMutation` — PIN `"0000"` 통과 / `"1234"` 불일치 시 403 에러 검증
- `useQuantityCorrectTransactionMutation` — PIN 통과 시 `original` + `correction` 응답 검증, PIN 불일치 → 에러
- `useMonthlyCountsQuery(year)` — 12개월 키 + 값 검증, 422 에러 처리

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useTransactionsQuery.ts]] — 테스트 대상 hook 구현체
- [[ERP/frontend/lib/__tests__/msw/handlers/transactions.ts]] — MSW mock 핸들러(거래내역)
- [[ERP/frontend/lib/__tests__/msw/server.ts]] — MSW 서버 설정
