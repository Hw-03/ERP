# useItemsQuery.test.tsx

## 이 파일은 뭐예요?
`useItemsQuery`와 관련된 React Query 훅 5종(목록조회·단건조회·생성·수정·BOM 완성 상태 변경)을 fetch mock과 QueryClientProvider wrapper로 검증하는 단위 테스트(W7-3)입니다.

## 언제 보나요?
- `useItemsQuery.ts`를 수정한 뒤 쿼리 파라미터·HTTP 메서드·쿼리 무효화 동작을 회귀 검증할 때
- `useItemQuery`의 `enabled` 조건(itemId null이면 fetch 금지)이 깨지지 않았는지 확인할 때

## 중요한 내용
- 검증 대상 훅: `useItemsQuery`, `useItemQuery`, `useCreateItemMutation`, `useUpdateItemMutation`, `useUpdateBomCompletionMutation`
- `useItemsQuery`: `process_type_code`·`search` 쿼리 파라미터 URL 인코딩 포함 전달 검증
- `useItemQuery`: `itemId === null`이면 `enabled=false`로 fetch 미호출 검증
- `useUpdateBomCompletionMutation`: `PATCH /api/items/{id}/bom-completion` body에 `{ completed: true }` 전달 검증

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useItemsQuery.ts]] — 테스트 대상 훅 구현체
- [[ERP/frontend/lib/queries/keys.ts]] — `queryKeys.items.all` 쿼리 키 정의
