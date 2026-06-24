# useTransactionsQuery.ts

## 이 파일은 뭐예요?
입출고 트랜잭션 목록·KPI 집계·수정 이력 조회와 메타 수정·수량 보정·월별 건수 조회 mutation을 제공하는 React Query 훅 모음입니다.

## 언제 보나요?
- 입출고 내역 화면에서 트랜잭션 목록이나 KPI 카드 데이터 흐름을 추적할 때
- 트랜잭션 메타(메모·기준번호·담당자) 또는 수량 보정 흐름을 확인할 때

## 중요한 내용
- `useTransactionsQuery(params?, options?)` — `STALE_TIME.VOLATILE`(30초) 적용, `enabled` 옵션 지원
- `useTransactionsSummaryQuery(params?)` — KPI 집계, `STALE_TIME.VOLATILE` 적용
- `useTransactionEditsQuery(logId)` — 특정 트랜잭션의 수정 이력. `logId` 없으면 비활성
- `useMonthlyCountsQuery(year)` — 연도별 월별 건수 집계
- `useMetaEditTransactionMutation` / `useQuantityCorrectTransactionMutation` — 성공 시 `queryKeys.transactions.all` invalidate
- `productionApi` 트랜잭션 관련 메서드에 1:1 대응

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/production]] — 실제 API 호출 함수
- [[ERP/frontend/lib/queries/keys.ts]] — 쿼리 키 정의
- [[ERP/frontend/lib/queries/client.tsx]] — STALE_TIME.VOLATILE 상수
