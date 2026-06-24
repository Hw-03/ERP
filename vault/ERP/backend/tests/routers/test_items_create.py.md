# test_items_create.py

## 이 파일은 뭐예요?
`POST /api/items`의 초기 재고 부서별 분배 로직을 검증하는 통합 테스트. 총 수량을 창고와 복수 부서로 나누는 케이스 및 유효성 오류(합계 초과, 잘못된 부서, 중복 부서 등)를 커버한다.

## 언제 보나요?
- 품목 생성 시 `initial_locations` 분배 로직을 수정할 때
- `warehouse_qty` / `production_total` 계산이 올바른지 확인할 때
- 유효성 검증(422) 규칙을 변경할 때

## 중요한 내용
- `seed_symbol` fixture: `slot=1, symbol="9"` `ProductSymbol` 시드 — `model_slots=[1]` 사용 가능하게 함
- `_create_item(client, ...)`: POST /api/items 헬퍼 (name, process_type_code, initial_quantity, initial_locations)
- 분배 없이 전량 → `warehouse_qty`에 적재, `locations=[]`
- 분배 합계 > `initial_quantity` → 422
- "창고" 부서 명시, 중복 부서, 수량 0인 location → 모두 422

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/items.py]] — POST /api/items 구현
- [[ERP/backend/app/models/📁_models]] — ProductSymbol, Item 모델
- [[ERP/backend/app/utils/mes_code.py]] — `refresh_symbol_cache`
