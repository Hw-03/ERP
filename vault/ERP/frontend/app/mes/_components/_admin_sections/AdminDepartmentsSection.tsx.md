# AdminDepartmentsSection.tsx

## 이 파일은 뭐예요?
관리자 화면의 "부서 관리" 섹션 본체 컴포넌트입니다. 좌측 부서 목록 + 우측 부서 상세(`DeptDetailView`)를 2열 레이아웃으로 구성하고, 부서 추가·선택·삭제·활성화 토글을 처리합니다.

## 언제 보나요?
- `AdminSectionContent`에서 `section === "departments"`일 때 렌더됨

## 중요한 내용
- `AdminDepartmentsSection({ employees, items, adminPin, setDepartments, onStatusChange, onError })` — export 컴포넌트
- `useAdminDepartmentsContext()` — 부서 목록·선택·추가 폼 등 Context 상태 소비
- `AdminListPanel` + `AdminDetailCard` — 2열 마스터-디테일 레이아웃
- `DeptAddForm` — 추가 모드 폼
- `DeptDetailView` — 선택 부서 상세 뷰 (색상·활성화·삭제 등)
- `useRegisterDirty` / `useLocalDirtyGuard` — 더티 가드(현재 dirty=false placeholder, A3 연결 대기)
- `empCountByDept` / `itemCountByDept` — 부서별 직원·품목 수 집계 (메모)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminDepartmentsContext.tsx]] — 상태 Context
- [[ERP/frontend/app/mes/_components/_admin_sections/_department_parts/DeptDetailView.tsx]] — 우측 상세 뷰
- [[ERP/frontend/app/mes/_components/_admin_sections/_department_parts/DeptAddForm.tsx]] — 부서 추가 폼
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminSectionContent.tsx]] — 이 섹션의 마운트 부모
