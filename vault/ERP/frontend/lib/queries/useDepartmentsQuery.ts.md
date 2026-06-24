# useDepartmentsQuery.ts

## 이 파일은 뭐예요?
부서 마스터 데이터를 조회·추가·수정·삭제·순서 변경하는 React Query 훅 모음입니다. `useModelsQuery.ts` 패턴을 그대로 따릅니다.

## 언제 보나요?
- 부서 관리 화면에서 데이터 흐름을 추적할 때
- 결재 라우팅이나 직원 소속 부서 목록이 어디서 오는지 확인할 때

## 중요한 내용
- `useDepartmentsQuery(params?)` — `isActive` 필터 지원, `STALE_TIME.MASTER`(30분) 적용
- `useCreateDepartmentMutation` / `useUpdateDepartmentMutation` / `useDeleteDepartmentMutation` / `useReorderDepartmentsMutation` — 성공 시 `queryKeys.departments.all` invalidate
- 삭제는 `{ id, pin }` 구조 (PIN 필요)
- `departmentsApi`를 통해 `GET /departments` 등을 호출

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/departments]] — 실제 API 호출 함수
- [[ERP/frontend/lib/queries/keys.ts]] — 쿼리 키 정의
- [[ERP/frontend/lib/queries/client.tsx]] — STALE_TIME 상수
