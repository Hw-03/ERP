# test_reorder.py

## 이 파일은 뭐예요?
`services/reorder.py`의 `reorder_by_display_order` 함수가 Department·Item 등 어떤 모델이든 display_order(또는 sort_order)를 올바르게 갱신하는지, 중복 키·음수 순서 등 비정상 입력을 400으로 막는지 검증하는 단위 테스트입니다.

## 언제 보나요?
- 부서/품목 드래그 정렬 순서 저장 로직을 수정할 때
- `reorder_by_display_order`의 동작을 바꾸거나 order_field 옵션을 추가할 때

## 중요한 내용
- `test_valid_reorder` — 3개 Department display_order 갱신, 반환값 3
- `test_duplicate_key_rejected` — 동일 id 두 번 → 400 BAD_REQUEST
- `test_negative_display_order_rejected` — 음수 → 400 BAD_REQUEST
- `test_nonexistent_key_silent_skip` — 비존재 id는 조용히 건너뜀, 반환값 1
- `test_custom_order_field` — order_field="sort_order" 옵션으로 Item.sort_order 갱신

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/reorder.py]] — 테스트 대상 서비스
