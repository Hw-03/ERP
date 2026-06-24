# OperatorLoginCard.tsx

## 이 파일은 뭐예요?
작업자 식별용 PIN 로그인 카드 컴포넌트. 직원 선택 콤보박스 + 4자리 PIN 입력 + 로그인 버튼으로 구성되며, 로그인 성공 시 작업자 정보를 localStorage에 저장하고 테마를 DOM에 즉시 적용한다.

## 언제 보나요?
- `MesLoginGate`의 `form` 단계에서 화면 중앙에 카드로 렌더될 때
- 작업자가 PIN 인증을 시도할 때

## 중요한 내용
- `OperatorLoginCardProps`: `onLogin: () => void` — 인증 성공 콜백
- `submit()`: `api.verifyEmployeePin(employee_id, pin)` 호출 → 성공 시 `setCurrentOperator(op, session.boot_id)` 저장
- `PIN_LENGTH`(4자리) 충족 + 직원 선택 시에만 제출 버튼 활성화(`canSubmit`)
- 인증 성공 후 백엔드의 `theme` 값을 `document.documentElement.classList`에 즉시 반영(dark/light)
- 직원 선택 직후 `requestAnimationFrame`으로 PIN 입력 필드에 자동 포커스

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/login/MesLoginGate.tsx]] — 이 카드를 실제로 렌더하는 부모 게이트
- [[ERP/frontend/app/mes/_components/login/useCurrentOperator.ts]] — `setCurrentOperator` 함수 제공
- [[ERP/frontend/app/mes/_components/login/useLoginEmployees.ts]] — 직원 목록 fetch 훅
- [[ERP/frontend/app/mes/_components/login/EmployeeCombobox.tsx]] — 직원 선택 드롭다운 컴포넌트
