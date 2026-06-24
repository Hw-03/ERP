# useEmployees.test.tsx

## 이 파일은 뭐예요?
`useEmployees` 훅의 단위 테스트. `api.getEmployees`를 모킹하여 기본 호출 시 `activeOnly=true` 전달 여부, 에러 상태 처리, `department` 인자 전달을 검증한다.

## 언제 보나요?
- `useEmployees` 훅 수정 후 동작 회귀를 확인할 때
- `api.getEmployees` 호출 파라미터 계약이 맞는지 확인할 때

## 중요한 내용
- `api.getEmployees`를 `vi.mock`으로 가로채어 테스트마다 `vi.clearAllMocks()` 초기화
- 검증 케이스 3개: ①기본 fetch 시 `activeOnly=true` ②에러 → `error` state ③`department` 옵션 전달

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/hooks/useEmployees.ts]] — 테스트 대상 훅
- [[ERP/frontend/lib/api.ts]] — 모킹되는 `api.getEmployees` 원본
