# useDraftCartQuery.test.tsx

## 이 파일은 뭐예요?
`useDraftCartQuery`(임시저장 카트: stock draft + io draft 병합 조회)와 draft 삭제 mutation 2종을 fetch mock으로 검증하는 단위 테스트입니다.

## 언제 보나요?
- `useDraftCartQuery.ts`를 수정한 뒤 두 API를 `Promise.all`로 합치는 동작이 깨지지 않았는지 확인할 때
- `employeeId`가 null일 때 fetch가 발생하지 않는 비활성 조건을 검증할 때

## 중요한 내용
- 검증 대상 훅: `useDraftCartQuery`, `useDeleteStockRequestDraftMutation`, `useDeleteIoDraftMutation`
- `useDraftCartQuery`: `Promise.all`로 `/api/stock-requests/drafts`와 `/api/io/drafts` 동시 호출 + `{ stockDrafts, ioDrafts }` 형태 반환 검증
- `employeeId === null`: fetch 미호출(enabled=false) 검증
- `useDeleteStockRequestDraftMutation`: `DELETE /api/stock-requests/draft/{requestId}` + `queryKeys.stockRequests.all` invalidate
- `useDeleteIoDraftMutation`: `DELETE /api/io/draft/{batchId}` + `queryKeys.stockRequests.all` invalidate

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useDraftCartQuery.ts]] — 테스트 대상 훅 구현체
- [[ERP/frontend/lib/queries/keys.ts]] — `queryKeys.stockRequests.all` 쿼리 키 정의
