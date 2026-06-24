# test_inv_calc.py

## 이 파일은 뭐예요?
`services/inv_calc.py`의 재고 집계 함수(`_sync_total`, `production_total`, `defective_total`, `available`)와, DB CHECK 제약으로 음수 재고를 원천 차단하는 방어망을 검증하는 단위 테스트입니다.

## 언제 보나요?
- 창고/생산/불량 재고를 집계하는 로직을 수정할 때
- `available` 계산(warehouse + production − pending, 불량 제외)을 바꿀 때
- DB CHECK 제약(ck_inventory_quantity_nonneg, ck_inventory_warehouse_nonneg 등)이 살아있는지 확인할 때

## 중요한 내용
- `test_sync_total_combines_warehouse_and_locations` — warehouse 10 + PRODUCTION 5 + DEFECTIVE 3 = 18
- `test_db_check_blocks_negative_location` — InventoryLocation.quantity 음수 → IntegrityError
- `test_db_check_blocks_negative_warehouse` — Inventory.warehouse_qty 음수 → IntegrityError
- `test_available_excludes_defective_and_pending` — available = warehouse + production − pending (불량 제외)
- `test_available_warehouse_only_without_db` — db 인자 없으면 production 미계산 → warehouse − pending

## 위험도
🔴 높음 — inv_calc는 모든 재고 이동의 수량 정합성 기반. 여기 수식이 바뀌면 창고·부서·불량 재고가 조용히 어긋난다.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/inv_calc.py]] — 테스트 대상 서비스
- [[ERP/backend/app/models/📁_models]] — Inventory·InventoryLocation·LocationStatusEnum 정의
