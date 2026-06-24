---
type: file-explanation
source_path: "backend/app/services/sr_approval.py"
importance: important
layer: backend
graph: file
updated: 2026-06-24
project: DEXCOWIN MES
---

# sr_approval.py — StockRequest 승인·반려·취소 서비스

## 이 파일은 뭐예요?

입출고 요청(`StockRequest`)의 승인·반려·취소 업무 로직을 담당합니다. 창고 담당자의 승인이 완료될 때 실제 재고가 반영됩니다.

## 언제 보나요?

- "승인 후 재고가 왜 안 바뀌지?" 같은 승인 결과 이상 시
- 승인 권한 조건을 확인할 때 (`warehouse_role`)
- `FailedApprovalError` 오류가 발생할 때

## 중요한 내용

**승인 권한**

```python
role = (approver.warehouse_role or "none").lower()
if role not in ("primary", "deputy"):
    raise PermissionError("창고 담당자만 승인할 수 있습니다.")
```

`warehouse_role`이 `primary` 또는 `deputy`인 직원만 승인 가능. PIN 검증(`verify_pin`)도 필수.

**승인 흐름**

`approve_request()` → 권한+PIN 검증 → `_execute_all_lines()` (재고 반영) → `sync_batch_from_stock_request()` (IoCompose 동기화) → status=COMPLETED

**FailedApprovalError**

시스템 검증 실패 시 발생. 라우터가 catch해서 별도 트랜잭션으로 `status=failed_approval`을 기록합니다. pending 예약이 0이 된 상태에서 승인하면 이 오류가 납니다 (고아 pending 문제).

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/routers/stock_requests.py]] — 이 서비스를 호출하는 라우터
- [[ERP/backend/app/services/sr_execution.py]] — `_execute_all_lines`·`release_reservation`
- [[ERP/backend/app/services/dept_hierarchy.py]] — `can_approve_department`

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/services/io_persist.py]] — `sync_batch_from_stock_request`
> - [[ERP/backend/app/services/pin_auth.py]] — PIN 검증

## 조심할 점

## 위험도

🔴 높음

승인 함수는 재고 수량, 승인 상태, 거래 로그 세 가지를 한 트랜잭션에서 처리합니다. 부분 실패 시 pending 상태가 고아가 될 수 있습니다. 수정 전 반드시 테스트를 확인하세요.
