# test_items_reorder.py

## 이 파일은 뭐예요?
`PATCH /api/items/reorder` 엔드포인트의 통합 테스트. 올바른 admin PIN으로 복수 품목의 `sort_order`를 일괄 갱신하는 정상 케이스와 잘못된 PIN(403), PIN 누락(400/422) 오류 케이스를 검증한다.

## 언제 보나요?
- 품목 정렬 순서 변경 API를 수정할 때
- admin PIN 검증 로직이 올바르게 동작하는지 확인할 때

## 중요한 내용
- 정상: PIN `"0000"` + items 배열 → `{"ok": True}` 200, DB의 `sort_order` 갱신 확인
- 오류: 잘못된 PIN → 403, PIN 필드 자체 누락 → 400 또는 422(pydantic)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/items.py]] — PATCH /api/items/reorder 구현
- [[ERP/backend/app/models/📁_models]] — Item 모델, `sort_order` 컬럼
