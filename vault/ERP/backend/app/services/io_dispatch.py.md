# io_dispatch.py

## 이 파일은 뭐예요?

입출고 배치 제출 시 **세 가지 경로** 중 하나를 선택해 실재고를 반영하는 서비스입니다.

| 경로 | 조건 | 동작 |
|------|------|------|
| 창고 결재 | `warehouse_to_dept` / `dept_to_warehouse` | StockRequest 생성 → reserved 상태 대기 |
| 부서 결재 | `defect_quarantine` | StockRequest 생성 → 결재 후 실행 |
| 즉시 반영 | 나머지 sub_type | 바로 TransactionLog + 재고 변경 |

`io_preview`, `io_persist`, `inventory`, `stock_requests` 서비스를 모두 조합합니다.

## 언제 보나요?

- 제출 후 재고가 즉시 반영되지 않거나 결재 큐에 쌓이지 않을 때
- 결재 분기가 예상과 다를 때

## 위험도

🔴 높음

실재고 반영·결재 큐 생성을 담당합니다. `approval_rules.py`의 분기 규칙과 항상 일치해야 합니다.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/approval_rules.py]] — 결재 분기 규칙 원천
- [[ERP/backend/app/services/io_preview.py]] — 미리보기 헬퍼
- [[ERP/backend/app/services/io_persist.py]] — 배치 영속화
- [[ERP/backend/app/routers/io.py]] — 제출 API 진입점

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/services/inventory.py]]
> - [[ERP/backend/app/services/stock_requests.py]]
