# useDraftCartQuery.ts

## 이 파일은 뭐예요?
재고요청 draft와 IO draft를 `Promise.all`로 한 번에 묶어서 가져오는 장바구니 쿼리와, 각 종류별 삭제 mutation을 제공하는 React Query 훅 모음입니다.

## 언제 보나요?
- DraftCartPanel에서 저장된 임시 요청 목록이 어떻게 합쳐져서 보여지는지 추적할 때
- 재고요청 draft와 IO draft 삭제 흐름을 확인할 때

## 중요한 내용
- `useDraftCartQuery(employeeId)` — `stockRequestsApi.listStockRequestDrafts` + `ioApi.listDrafts`를 `Promise.all`로 병렬 호출해 `{ stockDrafts, ioDrafts }` 반환. `queryKeys.stockRequests.drafts` 키 재사용. `STALE_TIME.VOLATILE`(30초) 적용
- `useDeleteStockRequestDraftMutation` — `{ requestId, employeeId }`, 성공 시 `queryKeys.stockRequests.all` invalidate
- `useDeleteIoDraftMutation` — `{ batchId, employeeId }`, 성공 시 `queryKeys.stockRequests.all` invalidate

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/stock-requests]] — 재고요청 draft API
- [[ERP/frontend/lib/api/io]] — IO draft API
- [[ERP/frontend/lib/queries/keys.ts]] — 쿼리 키 정의
