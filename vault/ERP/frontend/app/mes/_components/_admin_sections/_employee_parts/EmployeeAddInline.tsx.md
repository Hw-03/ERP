# EmployeeAddInline.tsx

## 이 파일은 뭐예요?
관리자 직원 관리 화면에서 새 직원을 추가할 때 나타나는 인라인 폼 컴포넌트입니다. 이름·직급·연락처·부서·창고/부서 결재 역할을 입력받고, 조립 부서 선택 시 담당 모델 슬롯 에디터를 추가로 노출합니다.

## 언제 보나요?
- 관리자가 직원 목록에서 "직원 추가" 버튼을 눌렀을 때
- 신규 직원 등록 폼 전체가 이 컴포넌트 하나로 구성됨

## 중요한 내용
- `EmployeeAddInlineProps`: `form`(추가 폼 상태), `setForm`(상태 변경), `departments`(활성 부서 목록), `productModels`(제품 모델 목록), `onSubmit`(등록 실행 콜백)
- `form.department === ASSEMBLY_DEPT("조립")`일 때만 `AssignedModelsEditor`(담당 모델 슬롯) 섹션이 렌더됨
- 직원 코드는 서버에서 자동 부여되며 이 폼에는 입력 필드 없음
- `useAdminEmployeesContext`의 `empAddForm` / `setEmpAddForm` 타입을 그대로 props 타입으로 참조

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminEmployeesContext.tsx]] — empAddForm·setEmpAddForm 상태 공급처
- [[ERP/frontend/app/mes/_components/_admin_sections/_employee_parts/employeeDetailPrimitives.tsx]] — FieldRow·TextInput·SelectInput 공통 UI
- [[ERP/frontend/app/mes/_components/_admin_sections/_employee_parts/employeeRoleLabels.ts]] — ASSEMBLY_DEPT·WAREHOUSE_ROLE_LABEL·DEPARTMENT_ROLE_LABEL 상수
- [[ERP/frontend/app/mes/_components/_admin_sections/AssignedModelsEditor.tsx]] — 조립 부서 전용 담당 모델 슬롯 에디터
