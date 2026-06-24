# test_sr_execution.py

## 이 파일은 뭐예요?
`services/sr_execution.py`의 재고 요청 실행 함수(`_execute_line`, `_execute_all_lines`, `_finalize_submission`, `release_reservation`)가 요청 타입별로 올바른 재고 이동·TransactionLog를 만들고, 자가승인/RESERVED 분기를 제대로 처리하는지 검증하는 회귀 테스트입니다.

## 언제 보나요?
- StockRequest 실행 경로(RAW_RECEIVE/RAW_SHIP/WAREHOUSE_TO_DEPT/DEPT_TO_WAREHOUSE/DEPT_INTERNAL/MARK_DEFECTIVE 등)를 수정할 때
- 창고 primary·deputy 자가승인, admin 자가승인, 일반 직원 RESERVED 분기를 확인할 때
- pending 점유·해제 로직을 바꿀 때

## 중요한 내용
- `_execute_line` — 타입별 재고 이동 + TransactionLog 생성 (7종 타입 커버)
- `_finalize_submission` — warehouse_role(primary/deputy/none) + admin 기준 자가승인 분기
- `test_execute_line_approval_releases_pending` — is_approval=True 시 pending 먼저 해제 후 이동
- `test_finalize_non_warehouse_requester_reserves` — 일반 직원 → RESERVED + pending 생성, 로그 없음
- `release_reservation` — RESERVED 라인의 pending 원복 (비RESERVED는 no-op)

## 위험도
🔴 높음 — sr_execution은 창고 결재 승인 시 실재고를 건드리는 경로. 자가승인 분기 오류는 pending 고아나 이중 차감을 유발할 수 있다.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/sr_execution.py]] — 테스트 대상 서비스
- [[ERP/backend/app/services/sr_approval.py]] — approve_request가 sr_execution을 호출
- [[ERP/backend/app/models/📁_models]] — StockRequest·StockRequestTypeEnum·StockRequestStatusEnum 정의
