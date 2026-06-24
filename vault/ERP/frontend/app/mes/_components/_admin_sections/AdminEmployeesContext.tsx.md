# AdminEmployeesContext.tsx

## 이 파일은 뭐예요?
직원 관리 섹션의 상태를 React Context로 감싸는 파일입니다. `useAdminEmployees` 훅의 반환값을 Provider로 트리에 주입하고, 하위 컴포넌트가 `useAdminEmployeesContext()`로 꺼내 씁니다.

## 언제 보나요?
- `AdminEmployeesSection`에서 직원 목록·선택·편집 폼 상태를 공유할 때
- "직원 관리" 섹션이 마운트되는 시점 (`AdminSectionContent`에서 section === "employees"일 때)

## 중요한 내용
- `AdminEmployeesProvider` — Context Provider, `UseAdminEmployeesArgs`를 받아 훅 실행 후 주입
- `useAdminEmployeesContext()` — 하위 컴포넌트용 훅 (Provider 바깥 호출 시 throw)
- `AdminEmployeesState` 타입은 `useAdminEmployees` 훅에 정의됨

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminEmployees.ts]] — 실제 상태 로직
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminSectionContent.tsx]] — Provider 주입부
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminEmployeesSection.tsx]] — Context 소비자
