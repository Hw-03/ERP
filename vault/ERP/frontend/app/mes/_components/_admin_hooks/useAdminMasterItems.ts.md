# useAdminMasterItems.ts

## 이 파일은 뭐예요?
품목 관리 섹션(`AdminMasterItemsSection`)이 사용하는 wrapper 훅입니다. List / Form / Commands 세 sub-hook을 조합해 품목 검색·추가·정렬·편집·삭제·복구 전체를 하나의 `AdminMasterItemsState` 표면으로 통합합니다.

## 언제 보나요?
- 품목 추가/수정/삭제/복구 흐름을 전체적으로 추적할 때
- `onShowSave`(상단 토스트 메시지)가 어느 경로로 흘러가는지 확인할 때
- `editForm`, `dirty`, `saveItem` 구조를 파악할 때

## 중요한 내용
- `useAdminMasterItems(args: UseAdminMasterItemsArgs): AdminMasterItemsState`
- `saveItemField(field, value)`: 단일 필드 즉시 저장 (Form sub-hook)
- `updateItemFull(payload)`: 복수 필드 일괄 업데이트 (Form sub-hook)
- `reorderItems(ordered)`: 낙관적 정렬 후 서버 동기화 (Commands sub-hook)
- `deleteItem` / `restoreItem`: 소프트삭제·복구 (Commands sub-hook)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminMasterItemsList.ts]] — 검색 필터 sub-hook
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminMasterItemsForm.ts]] — 편집 폼 sub-hook
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminMasterItemsCommands.ts]] — CRUD 명령 sub-hook
