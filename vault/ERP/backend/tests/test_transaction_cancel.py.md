# test_transaction_cancel.py

## 이 파일은 뭐예요?
거래 취소(cancel) 기능을 효과 기반 역재생 방식으로 검증하는 통합 테스트. 불량 격리·입고·IO v2 경로 취소 후 재고 원복, 안전 가드(음수 방지·중복 취소), 권한·PIN 검증을 커버한다.

## 검증하는 것
- 불량 격리(MARK_DEFECTIVE) 취소 → 창고·DEFECTIVE 위치 수량 정확히 원복
- 단순 입고(RECEIVE) 취소 → 창고 수량 원복
- `inv_effect` 라운드트립: snapshot→capture→apply_effect_reverse 후 원상복구
- IO v2(`io_dispatch`) 경로 입고 취소 → `inventory_effect`, `operation_batch_id` 있을 때 원복
- 취소 후 음수 발생 케이스 → 422 + "음수" 메시지, 재고·로그 불변
- 중복 취소 → 422 + "이미 취소" 메시지
- 본인·결재권한자 아닌 직원 취소 → 403
- 창고 결재권한자는 타인 거래도 취소 가능
- 잘못된 PIN → 403
- `inventory_effect=None`인 레거시 MARK_DEFECTIVE → 422 + "이전 버전" 안내
- 레거시 로그도 `warehouse_qty_before/after`가 있으면 수량 추론해 취소 성공

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/inventory/📁_inventory]] — `/api/inventory/transactions/{id}/cancel` (테스트 대상)
- [[ERP/backend/app/services/inv_effect.py]] — `snapshot_cells`, `capture_effect`, `apply_effect_reverse`
- [[ERP/backend/app/services/inv_transfer.py]] — `consume_warehouse`, `transfer_to_production`
