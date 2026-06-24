# test_io_dispatch.py

## 이 파일은 뭐예요?
`services/io_dispatch.py`의 내부 함수들(`_apply_line`, `_submit_immediate`, `_submit_approval`, `_submit_dept_only_approval`, `execute_batch_after_dept_approval`, `submit_existing_draft`)을 DB에 IoBatch/IoBundle/IoLine을 직접 구성해 호출하고, Inventory·InventoryLocation·TransactionLog 변화를 검증하는 회귀 테스트입니다.

## 언제 보나요?
- 입출고 dispatch 분기(방향별 재고 이동·로그 타입)를 수정할 때
- 창고 승인 경로(pending 점유 → 승인 후 실행) 로직을 바꿀 때
- 부서 결재(자가승인·대기·결재 후 실행) 동작을 확인할 때
- draft 임시저장 재제출 흐름을 변경할 때

## 중요한 내용
- `_build_batch` — IoBatch/IoBundle/IoLine 한 묶음 생성 헬퍼
- `test_apply_line_*` — in/out/move/defective/adjust 방향 각각 TransactionType 매핑 검증
- `test_submit_immediate_*` — out 먼저 정렬·excluded 건너뜀·재고 부족 롤백
- `test_submit_approval_*` — StockRequest 생성 + pending 점유, 즉시 이동 없음
- `test_submit_dept_only_*` — department_role=primary 자가승인 vs 일반 직원 대기
- `test_execute_batch_after_dept_approval_*` — 결재 통과 후 실재고 반영
- `test_submit_existing_draft_*` — 소유권 확인·draft 상태 확인 후 재제출

## 위험도
🔴 높음 — io_dispatch는 MES의 모든 입출고 작업(produce/ship/receive/transfer/adjust)의 실행 심장부. 분기 오류는 잘못된 TransactionLog와 재고 불일치로 이어진다.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/io_dispatch.py]] — 테스트 대상 서비스
- [[ERP/backend/tests/test_io_v2.py]] — HTTP 경유 E2E (dispatch 분기는 여기서 커버)
- [[ERP/backend/app/models/📁_models]] — IoBatch·IoBundle·IoLine·TransactionTypeEnum 정의
