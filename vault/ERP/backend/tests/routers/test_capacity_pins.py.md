# test_capacity_pins.py

## 이 파일은 뭐예요?
`/api/production/capacity/pf-pins` 엔드포인트(GET/PUT/DELETE)의 회귀 테스트. PF 품목 지정 시 UUID 포맷이 PUT→GET 라운드트립에서 일치하는지를 핵심으로 검증한다(4df41ffb 회귀 가드).

## 언제 보나요?
- PF 핀 관련 엔드포인트를 수정할 때 회귀가 생겼는지 확인할 때
- UUID 직렬화(hex 32자 ↔ 표준 36자) 어댑터 로직을 건드릴 때

## 중요한 내용
- `_create_model_pf_pins_table` fixture: `model_pf_pins` 테이블은 `bootstrap/migrate.py`의 raw SQL로만 생성되므로 테스트에서 수동 CREATE
- `test_pf_pins_put_then_get_returns_same_uuid_format`: PUT에 표준 UUID(36자)를 보내면 GET에서도 동일 36자로 반환되어야 함
- `test_pf_pins_rejects_non_pf_item`: process_type_code가 PF가 아닌 품목 지정 시 400 반환 검증
- DELETE는 없는 키에 대해서도 멱등하게 204 반환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/production_capacity.py]] — pf-pins GET/PUT/DELETE 구현
- [[ERP/backend/app/models/📁_models]] — items 테이블 및 UUIDString 타입
- [[ERP/backend/bootstrap/migrate.py]] — model_pf_pins 테이블 생성 raw SQL
