# useAdminMasterItemsCommands.ts

## 이 파일은 뭐예요?
품목 도메인의 목록 수준 명령(추가 폼 상태 + 생성 / 순서 변경 / 소프트삭제 / 복구)을 담은 Commands sub-hook입니다. 추가 시 `initial_locations`를 가공해 창고 위치 초기값도 함께 전송합니다.

## 언제 보나요?
- 품목 추가 시 초기 재고 위치 데이터가 어떻게 구성되는지 확인할 때
- 드래그 정렬(`reorderItems`) 낙관적 업데이트 흐름을 추적할 때
- 소프트삭제·복구 API 경로를 찾을 때

## 중요한 내용
- `add()`: `addForm.initial_locations`에서 창고 외 부서만 필터 후 `initial_locations` 전송, 전체 수량도 집계
- `reorder(ordered)`: `setItems(() => ordered)` 낙관적 반영 후 `reorderMutation` 비동기 전송
- `deleteItem(itemId)`: `itemsApi.softDeleteItem` 호출 — is_deleted 플래그 처리
- `restoreItem(itemId)`: `itemsApi.restoreItem` 호출

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useItemsQuery.ts]] — `useCreateItemMutation`, `useReorderItemsMutation`
- [[ERP/frontend/lib/api/items]] — `itemsApi.softDeleteItem`, `itemsApi.restoreItem`
- [[ERP/frontend/app/mes/_components/_admin_sections/adminShared.ts]] — `AddForm`, `EMPTY_ADD_FORM`
