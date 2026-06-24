# test_warehouse_box_depletion.py

## 이 파일은 뭐예요?
창고 박스 자동 차감(R1~R6) 로직을 단위 테스트로 검증. 정렬 규칙, 순차 차감, 활성화 플래그 게이팅, `inventory_effect` 캡처 및 역재생(취소 원복)을 커버한다.

## 검증하는 것
- R1 정렬: 높은 층(`layer_no DESC`) 먼저, 같은 자리에선 위 박스(`stack_order DESC`) 먼저
- R2 순차 차감: 박스를 순서대로 비우고 다음으로 넘어감
- R3 빈 박스(수량 0) 건너뜀
- R5 박스 합계 < 차감량 → `ValueError("박스 배치 수량 부족")`
- 플래그 OFF(기본): `consume_warehouse` 호출해도 박스 무변경
- 플래그 ON: `consume_warehouse` 시 박스 차감
- 플래그 ON: 창고엔 재고 있어도 박스 배치 부족 시 차단(R5)
- 플래그 ON: 창고→부서 이동(`transfer_to_production`)도 박스 차감
- R6 효과 캡처: `inventory_effect`에 `warehouse_box` scope delta 기록 → 역재생 시 박스·창고 원복

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/warehouse_map.py]] — `deplete_boxes_by_order`, `boxes_total_for_item`, `set_box_tracking_enabled` (테스트 대상)
- [[ERP/backend/app/services/inv_transfer.py]] — `consume_warehouse`, `transfer_to_production`
- [[ERP/backend/app/services/inv_effect.py]] — `snapshot_cells`, `capture_effect`, `apply_effect_reverse`
