# useEmployees.ts

## 이 파일은 뭐예요?
부서(`Department`)와 활성 여부(`activeOnly`) 조건으로 직원 목록을 API에서 불러오는 React 커스텀 훅입니다. 조건이 바뀌면 자동으로 재요청하고, 이전 요청을 취소(cancelled 플래그)하여 race condition을 방지합니다.

## 언제 보나요?
- 모바일 화면에서 담당자 선택 드롭다운에 직원 목록이 필요할 때
- 특정 부서 소속 활성 직원만 필터링해서 보여줄 때

## 중요한 내용
- `useEmployees(params?)` — `{ department?, activeOnly? }` 옵션을 받아 `{ employees, loading, error }` 반환
- `activeOnly` 기본값은 `true` (비활성 직원은 기본 제외)
- `key`를 `department|activeOnly` 문자열로 만들어 `useEffect` 의존성으로 사용 (Cat-A 패턴)
- `api.getEmployees()` 호출 — `@/lib/api` 의 공통 API 클라이언트 사용

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api.ts]] — `api.getEmployees`, `Department`, `Employee` 타입 정의
