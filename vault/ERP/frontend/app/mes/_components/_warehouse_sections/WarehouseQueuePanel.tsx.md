# WarehouseQueuePanel.tsx

## 이 파일은 뭐예요?
창고 담당자 전용 승인 대기 목록 패널. 재고 요청을 불러와 각 행에 승인/반려 인라인 폼을 제공하고, PIN 입력 후 처리 결과를 상위에 알린다.

## 언제 보나요?
- 창고 화면 "창고 승인함" 탭(`queue`)이 활성일 때
- `canSeeQueue`가 true이고 `operatorEmployeeId`가 있을 때 `WarehouseDraftPanelTabs`에서 렌더됨

## 중요한 내용
- `WarehouseQueuePanel({ approverEmployeeId, refreshNonce, onChanged })` — 주요 export
- `useWarehouseQueueQuery()` — 승인 대기 목록 조회
- `useApproveStockRequestMutation()` / `useRejectStockRequestMutation()` — 승인·반려 뮤테이션
- 승인/반려 인라인 폼 상태(`approvePinFor`, `showRejectFor`)를 직접 관리해 `WarehouseQueueRow`에 내려줌
- `refreshNonce` 변경 시 수동 `refetch` 호출 (외부 트리거 지원)

## 위험도
🔴 높음 — 승인 처리가 재고 상태를 직접 변경함. ApiError conflict(409) / unavailable(503) 에러 핸들링 포함.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_sections/WarehouseQueueRow.tsx]] — 단일 요청 행 렌더 컴포넌트
- [[ERP/frontend/lib/queries/useStockRequestsQuery.ts]] — `useWarehouseQueueQuery`, `useApproveStockRequestMutation`, `useRejectStockRequestMutation` 훅 제공
