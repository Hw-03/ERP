# sr_execution.py

## 이 파일은 뭐예요?

승인된 결재 요청을 **실행**하는 서비스입니다. 점유(reserved) 해제, 재고 이동, TransactionLog 기록을 처리합니다.

## 언제 보나요?

- 결재 승인 후 재고가 반영되지 않을 때
- `reserved` 상태 점유 해제 로직을 파악할 때
- 결재 실행 후 감사 로그가 남지 않을 때

## 중요한 내용

- `release_reservation(db, request)` — RESERVED 상태 라인의 pending 원복
- `_execute_all_lines(db, request, approver)` — 모든 라인 재고 실반영 + TransactionLog 기록
- `_finalize_submission(db, request, ...)` — 실행 완료 처리

**StockRequest 상태 흐름:**
```
draft → submitted → reserved → completed
                             ↘ rejected
```

## 위험도

🔴 높음

재고 수량과 결재 상태를 동시에 변경합니다. 실행 도중 예외가 나면 점유가 유지된 채로 재고가 변경될 수 있습니다.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/sr_validation.py]] — 검증
- [[ERP/backend/app/services/inv_effect.py]] — 재고 효과 캡처
- [[ERP/backend/app/routers/stock_requests.py]] — 승인 API 진입점

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/services/inventory.py]]
> - [[ERP/backend/app/models/stock_request.py]]
