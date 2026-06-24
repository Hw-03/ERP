# useAdminMasterItemsForm.test.tsx

## 이 파일은 뭐예요?
`useAdminMasterItemsForm` 훅의 단위 테스트. 선택 품목에 따른 폼 자동 채움, `dirty` 플래그 변화, 저장(`save`) 성공 후 상태 초기화를 검증한다.

## 언제 보나요?
- 품목 상세 편집 폼의 `dirty` 추적이나 저장 후 상태 리셋 로직 수정 시
- `selectedItem` 변경 시 폼이 올바르게 동기화되는지 확인할 때

## 중요한 내용
- `@/lib/api`의 `api.updateItem`을 직접 목
- 검증 케이스:
  - `selectedItem=null` → 빈 form, `dirty=false`
  - `selectedItem` 주어지면 `item_name`/`mes_code` 자동 채움, `dirty=false`
  - `setForm` 호출 → `dirty=true`
  - `save` 시 `selectedItem` 없으면 `updateItem` 미호출
  - `save` 성공 → `setItems`/`setSelectedItem` 호출, `dirty=false`로 초기화

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminMasterItemsForm.ts]] — 테스트 대상 훅
- [[ERP/frontend/app/mes/_components/_admin_hooks/__tests__/useAdminMasterItemsCommands.test.tsx]] — 품목 commands 훅 테스트
