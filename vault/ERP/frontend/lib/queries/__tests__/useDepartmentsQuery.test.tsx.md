# useDepartmentsQuery.test.tsx

## 이 파일은 뭐예요?
`useDepartmentsQuery`와 관련된 React Query 훅 5종(조회·생성·수정·삭제·순서변경)을 fetch mock과 QueryClientProvider wrapper로 검증하는 단위 테스트(W7-1)입니다.

## 언제 보나요?
- `useDepartmentsQuery.ts`를 수정한 뒤 훅이 올바른 HTTP 메서드·URL·쿼리 무효화를 수행하는지 확인할 때
- `io_enabled` 같은 새 필드가 PUT body에 제대로 실려가는지 회귀 검증이 필요할 때

## 중요한 내용
- 검증 대상 훅: `useDepartmentsQuery`, `useCreateDepartmentMutation`, `useUpdateDepartmentMutation`, `useDeleteDepartmentMutation`, `useReorderDepartmentsMutation`
- `useUpdateDepartmentMutation` W11 케이스: `io_enabled: false`가 PUT body에 포함되는지 별도 검증
- `useDeleteDepartmentMutation`: DELETE body에 `pin` 필드 포함 여부 검증
- `useReorderDepartmentsMutation`: `PATCH /api/departments/reorder` 호출 확인
- 성공 시 모두 `queryKeys.departments.all` invalidate 확인

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useDepartmentsQuery.ts]] — 테스트 대상 훅 구현체
- [[ERP/frontend/lib/queries/keys.ts]] — `queryKeys.departments.all` 등 쿼리 키 정의
