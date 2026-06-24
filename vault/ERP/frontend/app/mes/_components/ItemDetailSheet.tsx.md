# ItemDetailSheet.tsx

## 이 파일은 뭐예요?
모바일에서 품목을 선택했을 때 하단에서 올라오는 BottomSheet입니다. 요약·위치·거래 3개 탭으로 품목 정보를 보여 주고, 요약 탭에서 수량 조정·입고 작업을 직접 처리합니다.

## 언제 보나요?
- 모바일 재고 목록에서 품목 행을 탭했을 때

## 중요한 내용
- **props**: `item: Item | null`, `onClose`, `onSaved(updated: Item)`
- **탭 3개**: `summary`(요약 + 조정 폼), `locations`(부서·상태별 위치 분포), `history`(최근 거래 10건)
- **ActionMode**: `ADJUST`(재고 절대값 설정, `api.adjustInventory`) / `RECEIVE`(입고 더하기, `api.receiveInventory`)
- `useTransactionsQuery(itemId, limit:10)` + `useItemLocationsQuery(itemId)` — React Query 훅
- `getStockState(availableQty, min_stock)` — 재고 상태(정상/부족/품절) 색상 뱃지
- `ItemLocationsPanel` — 위치별 수량 비율 프로그레스 바 포함 (`useDeptColor` 훅으로 부서 색상)
- `item` prop이 바뀔 때마다 탭·모드·수량·메모·에러 상태 전부 초기화

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/ItemDetailActionForm.tsx]] — 수량 조정·입고 폼 UI
- [[ERP/frontend/app/mes/_components/ItemDetailHistoryList.tsx]] — 거래 내역 목록
- [[ERP/frontend/lib/ui/BottomSheet.tsx]] — 하단 슬라이드 모달 컨테이너
- [[ERP/frontend/lib/queries/useTransactionsQuery.ts]] — 거래 내역 쿼리
- [[ERP/frontend/lib/queries/useInventoryQuery.ts]] — `useItemLocationsQuery`
