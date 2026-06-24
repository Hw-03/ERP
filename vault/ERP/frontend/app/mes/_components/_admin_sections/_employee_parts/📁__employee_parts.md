# 📁 _employee_parts

## 이 폴더는 뭐예요?
관리자 직원 관리 화면(`AdminEmployees`)에서 사용하는 하위 컴포넌트와 상수 파일을 모아 둔 폴더입니다. 직원 추가 폼, 직원 상세 편집 그리드, 공통 UI 원시 컴포넌트, 역할 레이블 상수 등이 여기에 있습니다.

## 언제 여기를 보나요?
- 직원 등록/편집 폼 UI를 수정할 때
- 창고·부서 결재 역할 레이블이나 색상을 바꿀 때
- 직원 관련 공통 입력 컴포넌트(TextInput, SelectInput 등)를 수정할 때

## 주요 파일
- `EmployeeAddInline.tsx` — 새 직원 추가 인라인 폼
- `EmployeeDetailGrid.tsx` — 선택된 직원의 상세 편집 그리드 (5개 카드)
- `employeeDetailPrimitives.tsx` — 폼 공통 UI 원시 컴포넌트 4종 (DetailCardSlot·FieldRow·TextInput·SelectInput)
- `employeeRoleLabels.ts` — 창고/부서 결재 역할·시스템 레벨 한국어 레이블·설명·색상 상수

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminEmployeesContext.tsx]] — 직원 목록·편집 폼 상태를 공급하는 Context
- [[ERP/frontend/app/mes/_components/_admin_sections/AssignedModelsEditor.tsx]] — 조립 부서 직원의 담당 모델 슬롯 편집기
