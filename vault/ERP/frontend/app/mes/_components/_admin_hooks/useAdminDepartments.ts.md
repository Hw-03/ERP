# useAdminDepartments.ts

## 이 파일은 뭐예요?
`AdminDepartmentsSection`이 사용하는 wrapper 훅입니다. Form / Commands 두 sub-hook을 조합해 하나의 `AdminDepartmentsState` 표면으로 병합하고, 바깥 컴포넌트가 서브훅 구조를 몰라도 되게 감춥니다.

## 언제 보나요?
- 부서 관리 섹션(`AdminDepartmentsSection`)의 상태 흐름을 추적할 때
- `addName`, `dirty`, `setDirty` 같은 부서 폼 상태가 어디서 오는지 확인할 때
- `COLOR_PALETTE` 상수를 외부에서 import하는 컴포넌트 경로를 찾을 때

## 중요한 내용
- `useAdminDepartments(args: UseAdminDepartmentsArgs): AdminDepartmentsState`
- `COLOR_PALETTE` 재-export — 원본은 `useAdminDepartmentsCommands.ts`
- `addNameRef`로 stale closure 방지 (Commands hook에 ref getter 전달)
- `dirty` / `setDirty`: unsaved guard(PR-2) 에서 읽는 미저장 편집 플래그

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminDepartmentsForm.ts]] — addName + dirty sub-hook
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminDepartmentsCommands.ts]] — 부서 CRUD 명령 sub-hook
