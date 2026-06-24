# useAdminDepartmentsList.test.tsx

## 이 파일은 뭐예요?
`useAdminDepartments` 훅의 list pass-through 동작 테스트. 입력 부서 배열이 그대로 노출되는지, 입력 변경 시 동기화되는지, 동일 reference 시 메모이즈되는지 검증한다.

## 언제 보나요?
- `useAdminDepartments`의 부서 목록 노출 로직(메모이제이션, 동기화)을 수정할 때
- departments 상태가 리렌더 시 불필요하게 교체되는 성능 버그를 확인할 때

## 중요한 내용
- `useDepartmentsQuery`와 `DepartmentsContext` 모킹
- 검증 케이스: 빈 배열 처리, 입력 그대로 pass-through, 입력 변경 시 길이 동기화, 동일 reference 시 `departments`가 같은 객체(`toBe`)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminDepartments.ts]] — 테스트 대상 훅
- [[ERP/frontend/app/mes/_components/_admin_hooks/__tests__/useAdminDepartmentsCommands.test.tsx]] — 같은 부서 도메인 commands 테스트
