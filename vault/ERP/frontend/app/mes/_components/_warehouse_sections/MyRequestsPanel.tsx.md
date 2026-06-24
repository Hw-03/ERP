# MyRequestsPanel.tsx

## 이 파일은 뭐예요?
"내 요청" 탭에서 현재 직원이 제출한 재고 요청 목록을 보여주고, 요청 취소 및 승인 전 수정(draft 전환) 기능을 PIN 확인 모달과 함께 제공하는 패널.

## 언제 보나요?
- 창고 화면 "내 요청" 탭(`mine`)이 활성일 때
- `WarehouseDraftPanelTabs`에서 `sectionTab === "mine"` 분기에서 렌더됨

## 중요한 내용
- `MyRequestsPanel({ employeeId, refreshNonce, onChanged })` — 주요 export
- `useMyStockRequestsQuery(employeeId)` — 30초 폴링 포함 (훅 내부 `refetchInterval`)
- `useCancelStockRequestMutation()` — 요청 취소 뮤테이션
- `useRevertToDraftMutation()` — 승인 전 요청을 draft로 전환하는 뮤테이션
- 취소·수정 각각 별도 `ConfirmModal` + PIN 입력 인라인 폼
- `refreshNonce` 변경 시 수동 `refetch` (외부 트리거)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_sections/MyRequestRow.tsx]] — 단일 요청 행 컴포넌트
- [[ERP/frontend/lib/queries/useStockRequestsQuery.ts]] — `useMyStockRequestsQuery`, `useCancelStockRequestMutation`, `useRevertToDraftMutation` 훅 제공
