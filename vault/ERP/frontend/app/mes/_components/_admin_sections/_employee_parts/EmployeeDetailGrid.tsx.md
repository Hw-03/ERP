# EmployeeDetailGrid.tsx

## 이 파일은 뭐예요?
관리자가 직원을 선택했을 때 오른쪽에 나타나는 직원 상세 편집 그리드입니다. 기본 정보·권한·PIN·상태·담당 모델(조립 부서 전용) 5개 카드를 2열 그리드로 배치하며, PIN 초기화·활성/비활성 토글·삭제 버튼 핸들러를 부모로부터 받아 실행합니다.

## 언제 보나요?
- 관리자 직원 목록에서 특정 직원을 클릭해 편집 패널이 열릴 때
- 직원의 이름·부서·권한·PIN·활성 상태를 수정할 때

## 중요한 내용
- `EmployeeDetailGridProps`: `employee`(현재 선택 직원), `form`/`setForm`(편집 폼 상태), `departments`, `productModels`, `onRequestPinReset`, `onToggle`, `onRequestDelete` 콜백 3종
- `form.department === ASSEMBLY_DEPT("조립")`일 때 담당 모델 카드가 `lg:col-span-2`로 전체 열 차지
- 입출고 권한(`io_enabled`)은 체크박스로 토글, 직원 개별 접근 차단 가능
- `employee.pin_is_default` 여부에 따라 PIN 상태 배지 색상이 yellow/green으로 분기
- 삭제는 직접 실행이 아닌 `onRequestDelete` 콜백으로 위임해 부모에서 확인 다이얼로그 처리

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminEmployeesContext.tsx]] — editForm·setEditForm 상태 공급처
- [[ERP/frontend/app/mes/_components/_admin_sections/_employee_parts/employeeDetailPrimitives.tsx]] — DetailCardSlot·FieldRow·TextInput·SelectInput 공통 UI
- [[ERP/frontend/app/mes/_components/_admin_sections/_employee_parts/employeeRoleLabels.ts]] — ASSEMBLY_DEPT·WAREHOUSE_ROLE_LABEL·DEPARTMENT_ROLE_LABEL 상수
- [[ERP/frontend/app/mes/_components/_admin_sections/AssignedModelsEditor.tsx]] — 조립 부서 전용 담당 모델 슬롯 에디터
