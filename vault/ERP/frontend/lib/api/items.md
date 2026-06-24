# items.ts

## 이 파일은 뭐예요?
품목 마스터 API 모듈입니다. 품목 CRUD, 소프트 삭제·복원, 순서 재정렬, 직원별 개인 품목 순서(my-order) 관리까지 11개 메소드를 제공합니다.

## 언제 보나요?
- 품목 관리 화면(생성·수정·삭제·복원·정렬)을 개발할 때
- 직원별 커스텀 품목 순서 저장·조회·초기화 로직을 볼 때
- `mes_code`, `legacy_part`, `legacy_item_type` 필드 업데이트 흐름을 확인할 때

## 중요한 내용
- `itemsApi.getItems(params?, opts?)` — 다중 필터(process_type_code, search, legacyPart, legacyItemType, department), AbortSignal 지원
- `itemsApi.getItem(itemId)` — 단건 조회
- `itemsApi.createItem(payload)` — `model_slots`, `initial_locations` 포함
- `itemsApi.updateItem(itemId, payload)` — `mes_code`, `min_stock`, `model_slots` 포함
- `itemsApi.updateBomCompletion(itemId, completed)` — BOM 완료 토글
- `itemsApi.softDeleteItem / restoreItem` — 소프트 삭제·복원
- `itemsApi.reorderItems(payload)` — 전체 정렬 (PIN 필수)
- `itemsApi.getMyItemOrder / putMyItemOrder / resetMyItemOrder` — 직원별 개인 품목 순서
- `ItemOrderEntry` interface — `{ item_id, display_order }`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/items.ts]] — Item 타입
- [[ERP/backend/app/routers/items.py]] — 백엔드 품목 라우터
