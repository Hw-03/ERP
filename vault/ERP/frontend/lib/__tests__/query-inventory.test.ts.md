# query-inventory.test.ts

## 이 파일은 뭐예요?
MSW와 React Query를 결합한 재고 관련 hook 통합 테스트 파일(W7-6)입니다. 재고 요약 조회, 위치별 재고 조회, 입고·조정·이동(창고↔생산)·불량 처리 mutation hook이 올바르게 동작하는지 검증합니다.

## 언제 보나요?
- `useInventoryQuery` 계열 hook을 수정하거나 API 엔드포인트가 변경될 때
- 재고 mutation(입고·조정·이동·불량) 흐름에 문제가 생겼을 때

## 중요한 내용
- `useInventorySummaryQuery` — `total_items`, `total_quantity`, `process_types` 검증, 500 에러 처리
- `useItemLocationsQuery(itemId)` — 위치별 재고 반환, 빈 문자열 시 `fetchStatus: "idle"` 확인
- `useReceiveInventoryMutation` — POST `/api/inventory/receive`, 입고 성공 검증
- `useAdjustInventoryMutation` — POST `/api/inventory/adjust`, 조정 성공 검증
- `useTransferToProductionMutation` — 창고→생산 이동 성공
- `useTransferToWarehouseMutation` — 생산→창고 이동 성공
- `useMarkDefectiveMutation` — 불량 처리 성공 및 404 에러 처리

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useInventoryQuery.ts]] — 테스트 대상 hook 구현체
- [[ERP/frontend/lib/__tests__/msw/handlers/inventory.ts]] — MSW mock 핸들러(재고)
- [[ERP/frontend/lib/__tests__/msw/server.ts]] — MSW 서버 설정
