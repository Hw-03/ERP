# useAdminMasterItemsCommands.test.tsx

## 이 파일은 뭐예요?
`useAdminMasterItemsCommands` 훅의 단위 테스트. 품목 추가 모드 토글(`setAddMode`), 품목 추가(`add`) 성공/실패 경로를 검증한다.

## 언제 보나요?
- 품목 추가 플로우(`addMode` 진입 → 폼 입력 → `add` 호출) 수정 시
- `item_name` 빈값 검증이나 추가 성공 후 상태 초기화 로직을 확인할 때

## 중요한 내용
- `useItemsQuery`의 `useCreateItemMutation`/`useReorderItemsMutation`을 목
- 초기 상태: `addMode=false`, `addForm.item_name=""`
- 검증 케이스:
  - `setAddMode(true)` 토글
  - `add` 시 `item_name` 공백 → `onError("품목명을 입력하세요.")` + `createMutateAsync` 미호출
  - `add` 성공 → `setItems`/`setSelectedItem` 호출, `addMode=false`로 초기화

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminMasterItemsCommands.ts]] — 테스트 대상 훅
- [[ERP/frontend/app/mes/_components/_admin_hooks/__tests__/useAdminMasterItemsList.test.tsx]] — 품목 목록 훅 테스트
