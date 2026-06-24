# DepartmentsContext.tsx

## 이 파일은 뭐예요?
전체 앱에서 부서 목록과 부서별 색상을 공급하는 React Context 파일입니다. `DepartmentsProvider`로 감싼 하위 어디서든 부서 데이터를 꺼내 쓸 수 있습니다.

## 언제 보나요?
- 부서 색상을 화면에 표시해야 할 때 (`useDeptColor`, `useDeptColorLookup`)
- 부서 목록 드롭다운을 채워야 할 때 (`useDepartments`)
- 부서 데이터를 강제로 새로고침해야 할 때 (`useRefreshDepartments`)

## 중요한 내용
- `DepartmentsProvider` — Context 루트. 마운트 시 `api.getDepartments`를 호출해 활성 부서만 가져옴. 중복 요청 방지를 위해 `inflightRef` 사용.
- `useDepartments()` — `DepartmentMaster[]` 반환
- `useRefreshDepartments()` — 수동 갱신 트리거 함수 반환
- `useDeptColor(name?)` — 단일 부서명 → `color_hex` 우선, 없으면 팔레트 폴백
- `useDeptColorLookup()` — hook을 쓸 수 없는 곳(콜백 등)에 넘길 lookup 클로저 반환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/color.ts]] — `employeeColor` 폴백 팔레트 정의
- [[ERP/frontend/lib/mes/department.ts]] — `normalizeDepartment` 정규화 함수
- [[ERP/frontend/lib/api.ts]] — `DepartmentMaster` 타입 및 `getDepartments` API
