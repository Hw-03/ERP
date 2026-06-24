# useAdminEmployeesList.ts

## 이 파일은 뭐예요?
직원 목록에 이름/부서 검색과 부서 필터를 적용해 `visibleItems`를 계산하는 List sub-hook입니다. 부서 옵션 목록도 직원 데이터에서 동적으로 추출합니다.

## 언제 보나요?
- 직원 목록 검색·필터가 동작하지 않을 때
- 부서 드롭다운 옵션이 어떻게 만들어지는지 확인할 때

## 중요한 내용
- `useAdminEmployeesList({ employees }): UseAdminEmployeesListState`
- `deptOptions`: `["ALL", ...부서명 정렬]` — employees에서 중복 없이 수집
- `visibleItems`: deptFilter + search(이름/부서/역할) 복합 필터 후 한국어 이름 정렬(`localeCompare ko`)
- `normalizeDepartment`: 부서명 정규화 함수 사용 (`@/lib/mes/department`)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/department.ts]] — `normalizeDepartment` 함수
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminEmployees.ts]] — 이 훅을 포함하는 wrapper
