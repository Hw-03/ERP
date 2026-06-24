# test_sr_approval.py

## 이 파일은 뭐예요?
`services/sr_approval.py`의 창고 결재(`approve_request`/`reject_request`), 부서 결재(`approve_request_department`/`reject_request_department`), 전체 취소(`cancel_open_stock_requests`) 함수가 권한·PIN 검증, pending 점유·해제, 실재고 이동, 상태 전환(RESERVED→COMPLETED/REJECTED)을 올바르게 처리하는지 검증하는 회귀 테스트입니다.

## 언제 보나요?
- 창고 승인·반려 로직이나 권한 조건(warehouse_role/department_role/admin)을 수정할 때
- 듀얼(창고+부서) 결재 순서와 완료 조건을 확인할 때
- `cancel_open_stock_requests`의 고아 pending 처리(음수 방지) 동작을 점검할 때

## 중요한 내용
- `approve_request` — RESERVED→COMPLETED + pending 해제 + 창고 차감 + 부서 생산 입고
- `test_approve_completed_request_is_idempotent` — 이미 완료된 요청 재승인은 멱등 (이중 차감 없음)
- `test_warehouse_approve_holds_when_department_pending` — 듀얼 결재에서 창고만 충족되면 RESERVED 유지
- `test_cancel_open_requests_pending_zero_safe` — 고아 요청(pending=0) 취소 시 음수 재고 방지

## 위험도
🔴 높음 — 결재 승인 경로는 실재고를 건드리는 최종 관문. PermissionError/멱등/pending 정합이 깨지면 재고 이중 차감 또는 고아 pending이 발생한다.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/sr_approval.py]] — 테스트 대상 서비스
- [[ERP/backend/app/services/sr_execution.py]] — 실재고 이동 실행 계층
- [[ERP/backend/app/services/stock_requests.py]] — create_request (요청 생성, 테스트에서 직접 사용)
