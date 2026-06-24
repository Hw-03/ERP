# AdminDepartmentsContext.tsx

## 이 파일은 뭐예요?
부서 관리 섹션의 상태를 React Context로 감싸는 파일입니다. `useAdminDepartments` 훅이 반환하는 상태를 Provider로 트리에 주입하고, 하위 컴포넌트가 `useAdminDepartmentsContext()`로 꺼내 쓸 수 있게 합니다.

## 언제 보나요?
- `AdminDepartmentsSection` 등 부서 관련 하위 컴포넌트에서 부서 목록·선택 상태를 공유할 때
- "부서 관리" 섹션이 마운트되는 시점(`AdminSectionContent`에서 section === "departments"일 때)

## 중요한 내용
- `AdminDepartmentsProvider` — `useAdminDepartments` 훅 값을 Context에 주입하는 Provider
- `useAdminDepartmentsContext()` — 하위 컴포넌트에서 부서 상태를 꺼내는 훅 (Provider 바깥에서 호출 시 에러)
- `AdminDepartmentsState` 타입은 `useAdminDepartments` 훅에 정의됨

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminDepartments.ts]] — 실제 상태 로직
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminSectionContent.tsx]] — Provider를 래핑하는 부모
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminDepartmentsSection.tsx]] — Context 소비자
