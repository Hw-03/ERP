# useInventoryQuery.ts

## 이 파일은 뭐예요?
재고 현황 조회(집계·위치별)와 입고·조정·창고↔생산 이동·불량 처리 mutation을 제공하는 React Query 훅 모음입니다.

## 위험도
🔴 높음 — 재고 수량을 직접 변경하는 mutation(입고·조정·이동·불량 처리)이 포함되어 있어 잘못 호출하면 실제 재고 수치가 틀어집니다.

## 언제 보나요?
- 재고 현황 화면의 집계·품목별 위치 데이터가 어디서 오는지 확인할 때
- 입고/조정/불량 처리 흐름을 추적할 때

## 중요한 내용
- `useInventorySummaryQuery` / `useItemLocationsQuery(itemId)` — `STALE_TIME.VOLATILE`(30초) 적용
- `useReceiveInventoryMutation` — 입고
- `useAdjustInventoryMutation` — 재고 조정
- `useTransferToProductionMutation` / `useTransferToWarehouseMutation` — 창고↔생산 이동
- `useMarkDefectiveMutation` — 불량 처리
- 모든 mutation 성공 시 `queryKeys.inventory.all` invalidate

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/inventory]] — 실제 API 호출 함수
- [[ERP/frontend/lib/queries/keys.ts]] — 쿼리 키 정의
- [[ERP/frontend/lib/queries/client.tsx]] — STALE_TIME.VOLATILE 상수
