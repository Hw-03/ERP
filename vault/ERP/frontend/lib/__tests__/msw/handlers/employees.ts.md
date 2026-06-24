# employees.ts

## 이 파일은 뭐예요?
MSW 테스트용 직원 CRUD API 핸들러로, 직원 목록 조회·생성·수정·삭제와 PIN 초기화 엔드포인트를 가짜 응답으로 제공합니다.

## 언제 보나요?
- 직원 관리 화면(`AdminEmployees`) 컴포넌트를 테스트할 때
- 직원 PIN 초기화 플로우를 테스트할 때

## 중요한 내용
- `employeesHandlers` — export되는 핸들러 배열
- 샘플 데이터: `홍길동(E001, 조립)`, `김철수(E002, 포장)` 2명
- `employee_id`와 `employee_code`가 동일 값으로 반환됨
- `POST /reset-pin` — PIN `"0000"` 검증, 불일치 시 403, 성공 시 null 반환
- `DELETE` — PIN 검증 없음, `{ result: "deleted" }` 200 반환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/📁__admin_sections]] — 이 핸들러가 mock하는 실제 직원 관리 UI
