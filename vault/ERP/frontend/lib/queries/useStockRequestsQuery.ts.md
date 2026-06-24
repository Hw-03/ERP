# useStockRequestsQuery.ts

## 이 파일은 뭐예요?
재고 요청(출고 요청)의 창고 대기열·부서 대기열·내 요청 목록 조회와 승인·반려·취소·draft 복원·신규 생성 mutation을 제공하는 React Query 훅 모음입니다.

## 위험도
🔴 높음 — 승인/반려/취소 mutation이 실제 재고 상태와 결재 흐름을 변경하므로 잘못된 호출이 재고 수량 불일치나 결재 고아(pending orphan)를 만들 수 있습니다.

## 언제 보나요?
- 창고 대기열 화면이나 부서 결재 화면의 데이터 흐름을 추적할 때
- 요청 상태(submitted → approved / rejected / cancelled / draft)가 어떻게 변경되는지 확인할 때

## 중요한 내용
- `useWarehouseQueueQuery` / `useDepartmentQueueQuery(actorEmployeeId)` — `STALE_TIME.VOLATILE`(30초) 적용
- `useMyStockRequestsQuery(employeeId)` — 30초 폴링(`refetchInterval: 30_000`), `STALE_TIME.VOLATILE`
- `useApproveStockRequestMutation` / `useRejectStockRequestMutation` — 창고 결재
- `useApproveStockRequestDepartmentMutation` / `useRejectStockRequestDepartmentMutation` — 부서 결재
- `useCancelStockRequestMutation` — 요청 취소
- `useRevertToDraftMutation` — draft 복원 후 `queryKeys.stockRequests.all` + `["io-drafts"]` 동시 invalidate
- `useCreateStockRequestMutation` — 신규 요청 생성

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/stock-requests]] — 실제 API 호출 함수
- [[ERP/frontend/lib/queries/keys.ts]] — 쿼리 키 정의
- [[ERP/frontend/lib/queries/client.tsx]] — STALE_TIME.VOLATILE 상수
