# useAdminDepartmentsCommands.test.tsx

## 이 파일은 뭐예요?
`useAdminDepartmentsCommands` 훅의 단위 테스트. 부서 추가(`add`), 순서 변경(`reorder`), 색상 변경(`updateColor`) 동작이 올바른 mutation 페이로드를 만들고 콜백을 호출하는지 검증한다.

## 언제 보나요?
- `useAdminDepartmentsCommands` 수정 후 mutation 호출 로직이 의도대로 동작하는지 확인할 때
- 부서 CRUD 관련 버그를 재현하거나 수정할 때

## 중요한 내용
- `createMutate`, `updateMutate`, `deleteMutate`, `reorderMutate`를 `vi.fn()`으로 목(mock)
- `useDepartmentsQuery`와 `DepartmentsContext`를 모킹해 네트워크 없이 동작
- 검증 케이스: 빈 이름 → mutate 미호출, 이름 있을 때 onSuccess 시 `setDepartments`/`onAfterAdd`/`onStatusChange` 호출, reorder 페이로드의 `display_order` 인덱스 매핑, `updateColor` 페이로드의 `{ id, payload }` 형태

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminDepartmentsCommands.ts]] — 테스트 대상 훅
- [[ERP/frontend/app/mes/_components/_admin_hooks/__tests__/useAdminDepartmentsList.test.tsx]] — 같은 부서 도메인 list 테스트
