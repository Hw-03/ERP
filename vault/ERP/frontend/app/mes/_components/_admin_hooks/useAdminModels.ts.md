# useAdminModels.ts

## 이 파일은 뭐예요?
모델 관리 섹션(`AdminModelsSection`)이 사용하는 wrapper 훅입니다. List / Form / Commands 세 sub-hook을 조합해 모델 추가·인라인 편집·삭제·순서 변경을 하나의 `AdminModelsState` 표면으로 통합합니다.

## 언제 보나요?
- 모델 추가·수정·삭제·정렬 흐름을 전체적으로 추적할 때
- `editDirty`, `editSaving` 상태가 어디서 오는지 확인할 때

## 중요한 내용
- `useAdminModels(args: UseAdminModelsArgs): AdminModelsState`
- `initEditForm(model)`: 인라인 편집 시작 시 폼 초기화 (Form sub-hook)
- `saveModel(slot)`: 모델 이름/심볼 저장 (Form sub-hook)
- `addModel()` / `deleteModel(slot)` / `reorderModels(ordered)`: list 수준 CRUD (Commands sub-hook)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminModelsList.ts]] — 목록 sub-hook
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminModelsForm.ts]] — 편집 폼 sub-hook
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminModelsCommands.ts]] — CRUD 명령 sub-hook
