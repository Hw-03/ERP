# clear_pending_batches.py

## 이 파일은 뭐예요?
draft / submitted / reserved 상태의 미완료 입출고 배치(io_batches)와 하위 번들·라인을 FK 안전 순서로 일괄 삭제하는 일회성 정리 스크립트다. completed / cancelled / rejected / failed 행은 보존한다.

## 언제 보나요?
- 테스트 도중 쌓인 미완료 배치가 DB를 어지럽힐 때
- 재고 리셋(reset_test_stock) 전에 io_batches 를 깨끗하게 비우고 싶을 때

## 중요한 내용
- `PENDING_STATUSES = ("draft", "submitted", "reserved")` — 삭제 대상 상태 목록
- `--dry-run` 옵션: 실제 커밋 없이 삭제 대상 카운트만 출력
- `--yes` 옵션: 확인 프롬프트 없이 바로 실행
- 삭제 순서: `io_lines → io_bundles → io_batches` (FK 제약 안전)
- `transaction_logs.operation_batch_id`는 ON DELETE SET NULL이라 자동 처리됨

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/models/📁_models]] — IoBatch, IoBundle, IoLine 모델 정의
- [[ERP/backend/scripts/reset_test_stock.py]] — 재고 전체 리셋 시 이 스크립트와 함께 쓰임
