# test_warehouse_box_depletion.py

## 이 파일은 뭐예요?
창고 박스 자동 차감(R1~R6 규칙) 단위 테스트. `deplete_boxes_by_order` 정렬 순서(층↓ 줄↑ 스택↓), 순차 차감, 빈 박스 스킵, 수량 부족 차단, 활성화 플래그 게이팅, `inventory_effect` 박스 scope 캡처 및 역재생을 검증.

## 언제 보나요?
- `warehouse_map.deplete_boxes_by_order` 정렬 규칙 변경 시
- 박스 차감 활성화 플래그(`set_box_tracking_enabled`) 로직 수정 시
- 취소 역재생 시 박스 수량도 함께 원복되는지 확인 시

## 중요한 내용
- `test_r1_layer_desc_first`: 높은 층 박스부터 차감
- `test_r1_stack_desc_first`: 같은 자리에서 위 박스(stack_order 높음)부터
- `test_r2_sequential_depletion`: 20/100/100에서 50 → 0/70/100
- `test_r5_insufficient_raises`: 박스 합 < 요청량 → `ValueError("박스 배치 수량 부족")`
- `test_flag_off_consume_warehouse_box_untouched`: 플래그 OFF 시 박스 미변경
- `test_box_effect_capture_and_reverse`: `inventory_effect`에 `warehouse_box` scope delta 기록, 역재생으로 원복

## 위험도
🔴 높음 — 박스 차감 순서 오류 시 실물 재고와 시스템 위치가 불일치. 플래그 ON 운영 전 이 테스트 전체 통과 필수.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/warehouse_map.py]] — `deplete_boxes_by_order`, `set_box_tracking_enabled`, `boxes_total_for_item`
- [[ERP/backend/app/services/inv_transfer.py]] — `consume_warehouse`, `transfer_to_production` (플래그 연동)
- [[ERP/backend/app/services/inv_effect.py]] — `snapshot_cells`, `capture_effect`, `apply_effect_reverse`
