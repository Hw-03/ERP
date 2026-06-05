---
type: file-explanation
source_path: "backend/app/models/stock_request.py"
importance: critical
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# stock_request.py — 입출고 결재 요청 표

## 이 파일은 무엇을 책임지나

창고 재고가 실제로 움직이려면 승인이 필요한 작업들의 "결재 요청서"를 저장합니다. 요청서 1건(StockRequest)과 그 안의 품목별 줄(StockRequestLine)로 나뉩니다. 요청의 종류, 진행 상태, 누가 언제 승인/반려했는지를 모두 담습니다.

## 업무 흐름에서의 의미

현장 담당자가 입출고를 제출하면 곧장 재고가 바뀌는 게 아니라, 먼저 이 요청서가 만들어지고 창고(및 필요 시 부서) 승인을 기다립니다. 승인되어야 실제 재고에 반영됩니다. 즉 "재고가 함부로 바뀌지 않게 막는 관문" 의 데이터가 여기 있습니다.

## 언제 보면 좋나

- 결재 대기/예약/완료/반려가 어떤 상태값으로 관리되는지 확인할 때
- 요청 종류(입고·출고·부서이동·불량격리·분해·반품 등)가 무엇무엇인지 볼 때
- 창고 승인과 부서 승인이 따로 도는 구조를 이해할 때

## 중요한 내용

- `StockRequestStatusEnum` — 요청 상태: `draft`(임시저장) / `submitted`(제출·대기) / `reserved`(예약) / `rejected`(반려) / `cancelled`(취소) / `completed`(완료) / `failed_approval`(승인 실패).
- `StockRequestTypeEnum` — 요청 종류. 입고(raw_receive)·출고(raw_ship)·창고↔부서 이동·부서 내 이동·불량 격리(창고/생산)·공급처 반품·패키지 출고·낱개 보정(manual_adjustment)·불량 후속 처리(폐기/반품/분해) 등.
- `RequestBucketEnum` — 재고가 어느 "통" 에서 어느 "통" 으로 가는지: `warehouse`(창고) / `production`(생산) / `defective`(불량) / `none`.
- `StockRequest` — 요청서 머리. 주요 칸:
  - `requires_warehouse_approval` / `requires_department_approval` : 창고 승인·부서 승인이 각각 필요한지. 둘은 독립적입니다.
  - 승인/반려/부서승인/취소/완료별로 담당자·이름·시각 칸이 따로 있습니다.
  - `operation_batch_id` : 입출고 2.0 배치와 연결.
- `StockRequestLine` — 요청 속 품목 줄. `from_bucket`→`to_bucket`(+부서) 로 이동 방향을 적고, `item_name_snapshot`·`mes_code_snapshot` 으로 당시 품목 정보를 박제합니다. 수량은 > 0 만 허용.

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/transaction.py]] — 승인 후 실제 재고 변동이 거래 로그로 남습니다.
- [[ERP/backend/app/models/io_batch.py]] — 입출고 2.0 배치(operation_batch_id)와 짝을 이룹니다.
- [[ERP/backend/app/models/notification.py]] — 요청 도착/승인/반려 시 알림이 생성됩니다.
- [[ERP/backend/app/models/inventory.py]] — 승인 결과가 반영되는 실재고.

## 조심할 점

창고 승인과 부서 승인은 서로 별개로 돕니다. 낱개(manual/adjust) 라인이 섞이면 부서 결재가 추가로 요구되며, 실제 재고 변동은 `io.py` 의 처리 단계에서 승인 후 실행됩니다. 상태값(Enum)을 새로 추가할 때는 화면·서비스가 함께 알도록 신중히 다뤄야 합니다.

## 핵심 발췌

```python
class StockRequestStatusEnum(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    RESERVED = "reserved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    FAILED_APPROVAL = "failed_approval"
```
