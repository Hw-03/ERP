# useAdminEmployeesForm.ts

## 이 파일은 뭐예요?
직원 선택 상태·추가 폼·인라인 편집 폼 세 가지 상태와 `dirty` 계산을 담은 Form sub-hook입니다. 직원이 선택될 때 `editForm`을 자동으로 채우고, 외부 `employees` 목록이 바뀌면 `selectedEmployee`를 동기화합니다.

## 언제 보나요?
- 직원 선택 후 편집 폼이 자동으로 채워지는 로직을 확인할 때
- `dirty` 플래그(원본 vs 현재 editForm 비교)가 왜 특정 필드에서 반응하는지 볼 때
- `assigned_model_slots` 배열 비교 로직을 추적할 때

## 중요한 내용
- `EmployeeEditForm`: name / role / phone / department / level / warehouse_role / department_role / io_enabled / assigned_model_slots
- `toEditForm(emp)`: Employee → EmployeeEditForm 변환 (level·warehouse_role·department_role `?? "none"` 처리)
- `dirty`: `useMemo`로 선택 직원 원본과 현재 editForm을 필드별 비교 (배열은 순서까지 비교)
- `resetAddForm()`: 추가 폼 초기화 + `empAddMode` 해제

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/adminShared.ts]] — `EMPTY_EMPLOYEE_FORM`, `EmployeeAddForm`
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminEmployees.ts]] — 이 훅을 포함하는 wrapper
