# useAdminEmployeesList.test.tsx

## 이 파일은 뭐예요?
`useAdminEmployeesList` 훅의 단위 테스트. 검색어(`search`)와 부서 필터(`deptFilter`)가 `visibleItems`를 올바르게 좁히는지, `deptOptions`가 중복 제거·정렬되는지, 이름 한글 정렬이 적용되는지 검증한다.

## 언제 보나요?
- 직원 목록 필터링·정렬 로직 수정 시
- `search`가 `role` 필드까지 포함해 매치하는지 확인할 때

## 중요한 내용
- 외부 의존성 없이 동작 (QueryClient 불필요)
- 검증 케이스:
  - 초기: `search=""`, `deptFilter="ALL"`, 전체 노출
  - `setSearch("김")` → 이름 매치 필터링
  - `setDeptFilter("조립")` → 부서 필터링
  - `visibleItems` 이름 한글 오름차순 정렬
  - `deptOptions` = `["ALL", ...중복제거 부서 정렬]`
  - `search`가 `role`(직급)까지 매치

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminEmployeesList.ts]] — 테스트 대상 훅
- [[ERP/frontend/app/mes/_components/_admin_hooks/__tests__/useAdminEmployeesCommands.test.tsx]] — 직원 commands 훅 테스트
