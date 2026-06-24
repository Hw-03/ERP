# EmployeeAddPanel.tsx

## 이 파일은 뭐예요?
관리자 직원 탭에서 "직원 추가" 버튼 클릭 시 우측에 표시되는 입력 폼 패널입니다. 직원코드·이름·직급·연락처·부서·창고결재역할·부서결재역할을 입력받아 추가 요청을 부모 컴포넌트로 전달합니다.

## 언제 보나요?
- 관리자 화면 직원 탭에서 `empAddMode === true`일 때 우측 패널에 렌더됩니다.
- 직원 추가 폼을 취소하면 `EMPTY_EMPLOYEE_FORM`으로 초기화됩니다.

## 중요한 내용
- `EmployeeAddPanel` — 메인 export 컴포넌트. `form`, `setForm`, `departments`, `onClose`, `onSubmit` props를 받습니다.
- `EmployeeAddForm` — `adminShared`에서 정의된 폼 타입. `name`(필수) / `role` / `phone` / `department` / `warehouse_role` / `department_role` 필드를 가집니다.
- `EMPTY_EMPLOYEE_FORM` — 취소 시 폼을 초기화하는 기본값 상수 (`adminShared`에서 import).
- `WAREHOUSE_ROLE_OPTIONS` / `DEPARTMENT_ROLE_OPTIONS` — `none(없음)` / `primary(정)` / `deputy(부)` 3가지 선택지.
- `TEXT_FIELDS` — 이름·직급·연락처 입력 필드 메타데이터 배열. `required` 여부에 따라 "필수"/"선택" 뱃지 색상이 분기됩니다.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/adminShared.ts]] — `EMPTY_EMPLOYEE_FORM`·`EmployeeAddForm` 타입 정의
- [[ERP/frontend/app/mes/_components/common/AppSelect.tsx]] — 부서·역할 선택 드롭다운 공통 컴포넌트
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 디자인 토큰
