# test_transaction_cancel.py

## 이 파일은 뭐예요?
거래 취소(효과 기반 역재생) 재구현 테스트. 입고·불량 격리·IO v2 경로를 실제 엔드포인트로 생성 후 취소하여 재고 원복을 검증하고, 음수 방지·중복 취소·권한·레거시 로그(효과 기록 없음) 처리를 커버.

## 언제 보나요?
- `inventory_effect` 기반 취소 로직(`apply_effect_reverse`) 수정 시
- 취소 권한 정책(본인/결재권자) 변경 시
- 레거시 로그(이전 버전 형식) 취소 처리 방식 변경 시

## 중요한 내용
- `test_cancel_quarantine_restores_warehouse_and_defective`: 격리 취소 시 창고 +30, 부서 DEFECTIVE -30 원복
- `test_effect_helper_roundtrip`: `snapshot_cells → capture_effect → apply_effect_reverse` 라운드트립
- `test_cancel_blocked_when_would_go_negative`: 취소 시 음수 발생 → 422 + `"음수"` 메시지
- `test_cancel_idempotent_double`: 중복 취소 → 422 + `"이미 취소"` 메시지
- `test_cancel_legacy_mark_defective_restores_*`: `inventory_effect=None` 레거시 로그를 `warehouse_qty_before/after`로 추론해 취소

## 위험도
🔴 높음 — `inv_effect.apply_effect_reverse` 로직 오류 시 재고가 잘못 복구됨. 취소 경로 수정 시 반드시 이 테스트 전체 통과 확인.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/inv_effect.py]] — `snapshot_cells`, `capture_effect`, `apply_effect_reverse`
- [[ERP/backend/app/routers/inventory/transactions.py]] — `/api/inventory/transactions/{log_id}/cancel` 라우터
