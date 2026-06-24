# BomReviewModal.tsx

## 이 파일은 뭐예요?
"검토·완료" 버튼 클릭 시 열리는 모달. 저장된 BOM 행 요약을 보여주면서 수량≤0·중복 자식 여부를 사전 검증하고, 검증 통과 시에만 "완료로 표시" 버튼을 활성화한다. 이미 완료된 경우는 "완료 해제" 버튼을 보여준다.

## 언제 보나요?
- BOM 완료 처리나 해제 흐름이 이상할 때
- 완료 버튼이 비활성인 이유를 파악할 때 (수량 0 이하 또는 중복 자식)

## 중요한 내용
- `Props`: `parent: Item`, `rows: BOMEntry[]`, `items: Item[]`, `isCompleted`, `onClose`, `onConfirm: (completed: boolean) => Promise<void>`
- `canComplete`: `rows.length > 0 && !hasIssue`
- 검증: `badQty`(수량≤0) + `dupChildIds`(중복 자식 ID 목록) 계산
- 순환 참조는 백엔드에서 차단되므로 이 모달에서는 검사하지 않음

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx]] — `handleToggleCompletion` 전달
- [[ERP/frontend/lib/ui/ConfirmModal.tsx]] — 기반 모달 컴포넌트
