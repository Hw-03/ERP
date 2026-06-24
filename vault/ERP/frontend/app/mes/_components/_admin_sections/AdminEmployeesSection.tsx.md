# AdminEmployeesSection.tsx

## 이 파일은 뭐예요?
관리자 화면의 "직원 관리" 섹션 본체 컴포넌트입니다. 좌측 직원 목록 + 우측 직원 상세(`EmployeeDetailGrid`)를 2열 레이아웃으로 구성하고, 직원 추가·선택·저장·PIN 초기화·활성화 토글·삭제를 처리합니다.

## 언제 보나요?
- `AdminSectionContent`에서 `section === "employees"`일 때 렌더됨

## 중요한 내용
- `AdminEmployeesSection()` — export 컴포넌트 (props 없음, Context에서 모두 꺼냄)
- `useAdminEmployeesContext()` — 직원 목록·선택·편집·PIN 초기화·삭제 등 Context 상태 소비
- `useModelsQuery()` — 담당 모델 편집을 위한 전체 모델 목록 조회
- `EmployeeAddInline` — 추가 모드 인라인 폼
- `EmployeeDetailGrid` — 선택 직원 상세 편집 그리드
- `useRegisterDirty` / `useLocalDirtyGuard` — 더티 가드 (미저장 변경 시 경고)
- `filteredEmployees` — 이름·부서·직급 검색 + 부서 필터 적용
- 3개 ConfirmModal: 활성화 토글 / 삭제 / PIN 초기화(관리자 PIN 입력 필요)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminEmployeesContext.tsx]] — 상태 Context
- [[ERP/frontend/app/mes/_components/_admin_sections/_employee_parts/EmployeeDetailGrid.tsx]] — 우측 상세 그리드
- [[ERP/frontend/app/mes/_components/_admin_sections/_employee_parts/EmployeeAddInline.tsx]] — 추가 폼
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminSectionContent.tsx]] — 마운트 부모
