# useModelsQuery.test.tsx

## 이 파일은 뭐예요?
`useModelsQuery`와 관련된 React Query 훅 5종(목록조회·생성·수정·삭제·순서변경)을 fetch mock과 QueryClientProvider wrapper로 검증하는 단위 테스트(W4-A)입니다.

## 언제 보나요?
- `useModelsQuery.ts`를 수정한 뒤 모델 CRUD 훅의 HTTP 메서드·URL·쿼리 무효화 동작을 회귀 검증할 때
- `useReorderModelsMutation`의 `PATCH /api/models/reorder` 호출 경로를 확인할 때

## 중요한 내용
- 검증 대상 훅: `useModelsQuery`, `useCreateModelMutation`, `useUpdateModelMutation`, `useDeleteModelMutation`, `useReorderModelsMutation`
- `useUpdateModelMutation`: `PUT /api/models/{slot}` — slot 번호가 경로에 포함되는지 검증
- `useDeleteModelMutation`: `DELETE /api/models/{slot}` 경로 + 메서드 검증 (body pin 포함 여부는 검증 안 함)
- `useReorderModelsMutation`: `PATCH /api/models/reorder` + `queryKeys.models.all` invalidate 검증

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useModelsQuery.ts]] — 테스트 대상 훅 구현체
- [[ERP/frontend/lib/queries/keys.ts]] — `queryKeys.models.all` 쿼리 키 정의
