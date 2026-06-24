# useLoginEmployees.ts

## 이 파일은 뭐예요?
로그인 화면 진입 시 활성 직원 목록을 1회 fetch하는 커스텀 훅. `api.getEmployees({ activeOnly: true })`를 마운트 시점에만 호출하고 결과를 상태로 반환한다.

## 언제 보나요?
- `OperatorLoginCard`가 마운트되어 직원 목록이 필요할 때
- 로그인 화면 진입 시 한 번만 실행

## 중요한 내용
- `useLoginEmployees(): Employee[]` — 활성 직원 배열 반환, 초기값 `[]`
- 에러는 무시(`.catch(() => {})`) — 목록 로드 실패 시 빈 배열 유지
- `activeOnly: true`로 비활성 직원은 목록에 포함되지 않음

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/login/OperatorLoginCard.tsx]] — 이 훅을 호출하는 컴포넌트
- [[ERP/frontend/lib/api.ts]] — `api.getEmployees` 정의
