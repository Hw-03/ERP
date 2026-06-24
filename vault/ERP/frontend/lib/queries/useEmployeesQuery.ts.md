# useEmployeesQuery.ts

## 이 파일은 뭐예요?
직원 마스터 데이터를 조회·추가·수정·삭제하고, 직원 PIN 초기화까지 담당하는 React Query 훅 모음입니다.

## 언제 보나요?
- 직원 관리 화면에서 데이터 흐름을 추적할 때
- PIN 초기화 흐름(관리자 PIN 필요)을 확인할 때

## 중요한 내용
- `useEmployeesQuery(params?)` — `department` / `activeOnly` 필터 지원, `STALE_TIME.MASTER`(30분) 적용
- `useCreateEmployeeMutation` / `useUpdateEmployeeMutation` / `useDeleteEmployeeMutation` — 성공 시 `queryKeys.employees.all` invalidate
- `useResetEmployeePinMutation` — `{ employeeId, adminPin }` 구조, 캐시 invalidate 없음 (부작용이 직원 데이터에 없음)
- `employeesApi`를 통해 `GET /employees` 등을 호출

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/employees]] — 실제 API 호출 함수
- [[ERP/frontend/lib/queries/keys.ts]] — 쿼리 키 정의
- [[ERP/frontend/lib/queries/client.tsx]] — STALE_TIME 상수
