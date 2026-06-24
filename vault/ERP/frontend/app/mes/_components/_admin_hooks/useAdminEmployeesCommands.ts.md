# useAdminEmployeesCommands.ts

## 이 파일은 뭐예요?
직원 도메인의 목록 수준 변경 작업(생성/활성화 토글/삭제/PIN 초기화) 4종을 담은 Commands sub-hook입니다. React Query mutation을 호출하고 결과를 `setEmployees`로 낙관적 반영합니다.

## 언제 보나요?
- 직원 추가 실패나 PIN 초기화 에러를 디버깅할 때
- 삭제 시 "거래 이력 보존" 분기(`result.result === "deleted"` 여부)를 확인할 때

## 중요한 내용
- `add(input: EmployeeAddForm): Promise<Employee | null>` — 조립 부서 여부에 따라 `assigned_model_slots` 포함 여부 결정
- `toggleActive(employee)`: `is_active` 반전 업데이트
- `delete(employee)`: 이력 있으면 비활성화(소프트), 없으면 영구 삭제 — 반환 `{ deleted, updated }`
- `resetPin(employee, adminPin)`: 성공 시 PIN 0000으로 초기화, 반환 `boolean`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useEmployeesQuery.ts]] — 직원 React Query mutation 4종
- [[ERP/frontend/app/mes/_components/_admin_sections/adminShared.ts]] — `EmployeeAddForm` 타입
