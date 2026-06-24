# useItemsQuery.ts

## 이 파일은 뭐예요?
품목(자재/부품) 마스터를 조회·추가·수정하고 BOM 완성 여부 변경 및 품목 순서 변경까지 처리하는 React Query 훅 모음입니다.

## 언제 보나요?
- 품목 목록/상세 화면에서 데이터 흐름을 추적할 때
- 드래그 순서 변경 기능(`useReorderItemsMutation`)이 어떻게 동작하는지 확인할 때

## 중요한 내용
- `useItemsQuery(params?)` — `process_type_code`, `search`, `skip`, `limit`, `legacyPart`, `legacyItemType`, `department` 필터 지원
- `useItemQuery(itemId)` — 단일 품목 상세. `itemId` 없으면 비활성
- `useCreateItemMutation` / `useUpdateItemMutation` — 성공 시 `queryKeys.items.all` invalidate
- `useUpdateBomCompletionMutation` — `{ itemId, completed }` BOM 완성 플래그 토글
- `useReorderItemsMutation` — 드래그 정렬 결과 저장
- `itemsApi`를 통해 `GET /items` 등을 호출

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/items]] — 실제 API 호출 함수
- [[ERP/frontend/lib/queries/keys.ts]] — 쿼리 키 정의
