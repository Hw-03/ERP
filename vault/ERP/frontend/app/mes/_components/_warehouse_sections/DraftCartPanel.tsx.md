# DraftCartPanel.tsx

## 이 파일은 뭐예요?
"작업 중" 탭에서 현재 직원의 임시저장 요청(StockRequest 초안 + IoBatch 초안) 목록을 보여주고 이어서 작업하거나 삭제할 수 있는 패널.

## 언제 보나요?
- 창고 화면 "작업 중" 탭(`cart`)이 활성일 때
- `WarehouseDraftPanelTabs`에서 `sectionTab === "cart"` 분기에서 렌더됨

## 중요한 내용
- `DraftCartPanel({ employeeId, refreshNonce, onContinue, onContinueIo, onChanged, onCountChange })` — 주요 export
- `useDraftCartQuery(employeeId)` — stock/IO 임시저장 목록 조회 (React Query)
- `useDeleteStockRequestDraftMutation()` / `useDeleteIoDraftMutation()` — 삭제 뮤테이션
- `onCountChange` — 부모 탭 badge 카운트를 `drafts.length + ioDrafts.length`로 동기화
- IO 초안 → `IoDraftWorkCard` 렌더, 재고 초안 → `DraftCartItemRow` 렌더
- 삭제 시 `ConfirmModal`로 확인

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_sections/IoDraftWorkCard.tsx]] — IO 임시저장 카드
- [[ERP/frontend/app/mes/_components/_warehouse_sections/DraftCartItemRow.tsx]] — 재고 요청 임시저장 행
- [[ERP/frontend/lib/queries/useDraftCartQuery.ts]] — `useDraftCartQuery`, `useDeleteStockRequestDraftMutation`, `useDeleteIoDraftMutation` 훅 제공
