# clear_orphan_reservations.py

## 이 파일은 뭐예요?
재고 리셋이나 재적재 후 pending이 소멸됐는데 RESERVED / SUBMITTED 상태로 남은 미결 stock_request를 CANCELLED로 일괄 전이하는 일회성 정리 스크립트다.

## 언제 보나요?
- 창고 승인 시 "Pending 0" failed_approval 오류가 반복될 때 (고아 예약이 원인)
- reset_test_stock 실행 후 stock_request 상태가 꼬였을 때

## 위험도
🔴 높음 — RESERVED / SUBMITTED 상태의 모든 미결 재고 요청을 CANCELLED로 전이한다. 실제 운영 데이터에서 실수로 실행하면 진행 중인 요청이 일괄 취소된다.

## 중요한 내용
- `--dry-run`: commit 없이 대상 목록만 출력
- `--yes`: 확인 프롬프트 없이 즉시 실행
- 내부적으로 `cancel_open_stock_requests(db, reason=...)` 서비스 함수를 사용
- 대상 상태: `StockRequestStatusEnum.RESERVED`, `StockRequestStatusEnum.SUBMITTED`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/sr_approval.py]] — cancel_open_stock_requests 함수
- [[ERP/backend/scripts/reset_test_stock.py]] — 재고 리셋 시 이 스크립트 패턴을 내부에서도 사용
