# useEmployeesQuery.test.tsx

## 이 파일은 뭐예요?
`useEmployeesQuery`와 관련된 React Query 훅 5종(조회·생성·수정·삭제·PIN 초기화)을 fetch mock과 QueryClientProvider wrapper로 검증하는 단위 테스트(W7-2)입니다.

## 언제 보나요?
- `useEmployeesQuery.ts`를 수정한 뒤 훅 동작을 회귀 검증할 때
- `useResetEmployeePinMutation`이 employees 쿼리를 무효화하지 않는 동작을 의도적으로 유지하는지 확인할 때

## 중요한 내용
- 검증 대상 훅: `useEmployeesQuery`, `useCreateEmployeeMutation`, `useUpdateEmployeeMutation`, `useDeleteEmployeeMutation`, `useResetEmployeePinMutation`
- `useEmployeesQuery`: `active_only=true` 쿼리 파라미터 전달 검증
- `useResetEmployeePinMutation`: `POST /api/employees/{id}/reset-pin` 호출 + **employees 캐시 무효화 안 함** (의도적) 검증
- `useDeleteEmployeeMutation`: 경로에 `employeeId` 문자열 포함 검증

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useEmployeesQuery.ts]] — 테스트 대상 훅 구현체
- [[ERP/frontend/lib/queries/keys.ts]] — `queryKeys.employees.all` 등 쿼리 키 정의
