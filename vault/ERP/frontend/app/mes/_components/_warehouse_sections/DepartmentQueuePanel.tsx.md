# DepartmentQueuePanel.tsx

## 이 파일은 뭐예요?
부서 결재 정·부 담당자 전용 결재함 패널. `WarehouseQueuePanel`과 동일한 행 UI를 재사용하되, API를 department-* 엔드포인트로 교체하고 actor의 부서와 일치하는 요청만 표시한다.

## 언제 보나요?
- 창고 화면 "부서 승인함" 탭(`dept-queue`)이 활성일 때
- `canSeeDeptQueue`가 true이고 `operatorEmployeeId`가 있을 때 `WarehouseDraftPanelTabs`에서 렌더됨

## 중요한 내용
- `DepartmentQueuePanel({ approverEmployeeId, refreshNonce, onChanged })` — 주요 export
- `useDepartmentQueueQuery(approverEmployeeId)` — 부서별 결재 대기 목록 조회
- `useApproveStockRequestDepartmentMutation()` / `useRejectStockRequestDepartmentMutation()` — 부서 결재 전용 승인·반려 뮤테이션
- `WarehouseQueueRow` 재사용 — 행 UI는 창고 승인함과 동일

## 위험도
🔴 높음 — 승인 처리가 재고 상태를 변경함. 낱개 IO + 듀얼 결재 케이스를 처리.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_sections/WarehouseQueueRow.tsx]] — 재사용되는 단일 요청 행 컴포넌트
- [[ERP/frontend/app/mes/_components/_warehouse_sections/WarehouseQueuePanel.tsx]] — 창고 승인함 패널 (동일 구조 참고)
- [[ERP/frontend/lib/queries/useStockRequestsQuery.ts]] — 부서 결재 전용 훅 제공
