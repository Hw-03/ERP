# useCurrentOperator.ts

## 이 파일은 뭐예요?
현재 로그인된 작업자 정보를 localStorage에서 읽고 쓰는 유틸 함수 + React 훅 모음. 작업자 식별용(보안 인증 아님)이며, 저장된 작업자 정보는 입출고·수정 작업의 `produced_by` 기본값으로 사용된다.

## 언제 보나요?
- 작업자 로그인/로그아웃 처리할 때
- 현재 작업자 정보가 필요한 컴포넌트에서 `useCurrentOperator()` 훅을 쓸 때
- `MesLoginGate`에서 boot_id 검증과 세션 초기화를 할 때

## 중요한 내용
- `Operator` 인터페이스: `employee_id`, `name`, `department`, `level`, `employee_code`, `warehouse_role`, `department_role`, `theme?`, `assigned_model_slots`, `io_enabled`
- `readCurrentOperator()`: localStorage 동기 읽기, SSR-safe(서버에서 null)
- `setCurrentOperator(op, bootId?)`: localStorage 저장 + `dexcowin_operator_change` CustomEvent 발행
- `clearCurrentOperator()`: localStorage 삭제 + 이벤트 발행
- `getStoredBootId()`: 저장된 boot_id 읽기 — 서버 재시작 감지용
- `useCurrentOperator()`: React 훅 — `storage` 이벤트 + CustomEvent 구독으로 실시간 동기화
- `operatorProducedBy(op)`: `"이름(부서)"` 형식 문자열 반환 — IO 레코드의 `produced_by` 필드에 사용

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/login/MesLoginGate.tsx]] — boot_id 검증 + `clearCurrentOperator` 사용
- [[ERP/frontend/app/mes/_components/login/OperatorLoginCard.tsx]] — `setCurrentOperator`로 로그인 저장
