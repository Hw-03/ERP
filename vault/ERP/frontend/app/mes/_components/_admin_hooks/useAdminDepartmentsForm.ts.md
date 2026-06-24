# useAdminDepartmentsForm.ts

## 이 파일은 뭐예요?
부서 추가 입력 필드(`addName`)와 미저장 편집 여부(`dirty`) 두 가지 상태만 관리하는 최소 Form sub-hook입니다. 부서 도메인은 인라인 편집이 없어 필드가 단 하나입니다.

## 언제 보나요?
- 부서 추가 입력란의 상태 흐름을 따라갈 때
- `dirty` 플래그가 왜 존재하는지 (unsaved guard PR-2) 확인할 때

## 중요한 내용
- `useAdminDepartmentsForm(): UseAdminDepartmentsFormState`
  - `form.addName`: 추가할 부서명 입력값
  - `dirty` / `setDirty`: PR-2 unsaved guard가 읽는 미저장 플래그
  - `reset()`: `addName` 초기화 + `dirty` 해제

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminDepartments.ts]] — 이 훅을 포함하는 wrapper
