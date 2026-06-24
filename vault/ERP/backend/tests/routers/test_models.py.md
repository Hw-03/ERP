# test_models.py

## 이 파일은 뭐예요?
`POST /api/models`의 예약 슬롯 승격 동작 회귀 테스트. 시드가 슬롯을 모두 채운 상태에서 `create_model`이 가장 낮은 예약 슬롯을 찾아 승격하지 못하고 400을 반환하던 버그의 재발을 막는다.

## 언제 보나요?
- 제품 모델 생성 로직(`create_model`)이나 슬롯 할당 알고리즘을 수정할 때
- `ProductSymbol`의 `is_reserved` 처리 방식을 변경할 때

## 중요한 내용
- `_seed_symbols(db)`: 배정 슬롯 1개 + 예약 슬롯 2개(slot 2, 3) 시드
- 신규 모델 생성 시 가장 낮은 예약 슬롯(slot 2) 승격 → `is_reserved=False`로 변경
- 중복 `model_name` → 409, 중복 `symbol` → 409
- 예약 슬롯이 없을 때 → 400

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/models.py]] — POST /api/models 구현
- [[ERP/backend/app/models/📁_models]] — ProductSymbol 모델
