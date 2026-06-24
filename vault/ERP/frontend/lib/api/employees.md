# employees.ts

## 이 파일은 뭐예요?
직원 마스터 API 모듈입니다. 직원 CRUD, PIN 검증·초기화·변경, 테마 설정 저장 등 8개 메소드를 제공합니다.

## 언제 보나요?
- 직원 관리 화면(생성·수정·삭제·PIN 관리)을 개발할 때
- 입출고 화면에서 작업자 PIN 검증 로직을 확인할 때
- 직원별 io_enabled 권한이나 assigned_model_slots 설정을 볼 때

## 중요한 내용
- `employeesApi.getEmployees(params?)` — 부서·활성 여부 필터
- `employeesApi.createEmployee(payload)` — `io_enabled`, `assigned_model_slots` 포함
- `employeesApi.updateEmployee(employeeId, payload)` — 부분 업데이트
- `employeesApi.deleteEmployee(employeeId)` — 결과 `"deleted" | "deactivated"`
- `employeesApi.verifyEmployeePin(employeeId, pin)` — 작업자 식별용(보안 인증 아님)
- `employeesApi.resetEmployeePin(employeeId, adminPin)` — 0000으로 초기화
- `employeesApi.changeMyPin(employeeId, currentPin, newPin)` — 본인 PIN 변경
- `employeesApi.setEmployeeTheme(employeeId, theme)` — 테마 저장
- 타입: `Department`, `DepartmentRole`, `Employee`, `EmployeeLevel`, `WarehouseRole` → `./types`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/employees.ts]] — Employee 타입
- [[ERP/backend/app/routers/employees.py]] — 백엔드 직원 라우터
