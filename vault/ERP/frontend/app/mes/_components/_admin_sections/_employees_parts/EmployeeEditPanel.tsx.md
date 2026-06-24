# EmployeeEditPanel.tsx

## 이 파일은 뭐예요?
관리자 직원 탭에서 직원을 선택했을 때 우측에 표시되는 편집 패널입니다. 이름·직급·연락처·부서·결재역할 수정 폼, PIN 상태 카드, PIN 초기화·비활성화·삭제 버튼을 모두 포함합니다.

## 언제 보나요?
- 관리자 화면 직원 탭에서 `selectedEmployee`가 있을 때 우측 패널에 렌더됩니다.
- PIN이 기본값(0000)이면 노란색 뱃지, 직원 설정 PIN이면 초록색 뱃지로 표시됩니다.

## 중요한 내용
- `EmployeeEditPanel` — 메인 export 컴포넌트. `employee`, `form`, `setForm`, `departments`, `onSave`, `onRequestPinReset`, `onToggle`, `onRequestDelete` props를 받습니다.
- `EmployeeEditForm` — `useAdminEmployees` 훅에서 정의된 수정 폼 타입 (`name` / `role` / `phone` / `department` / `warehouse_role` / `department_role`).
- `FieldRow` — 레이블+입력 필드를 감싸는 내부 헬퍼 컴포넌트(export 없음).
- PIN 카드 — `employee.pin_is_default` 값으로 기본/직원 설정 PIN 상태를 구분하고, `pin_last_changed`로 마지막 변경일을 표시합니다.
- 비활성화 버튼 — `employee.is_active` 값에 따라 "비활성화"(빨강) / "활성화"(초록)으로 동적 전환됩니다.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminEmployees.ts]] — `EmployeeEditForm` 타입 및 직원 관리 상태 훅
- [[ERP/frontend/app/mes/_components/common/AppSelect.tsx]] — 부서·역할 선택 드롭다운 공통 컴포넌트
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 디자인 토큰
