---
type: file-explanation
source_path: "backend/app/schemas/inventory.py"
importance: critical
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# inventory.py — 재고·이동·불량·재고대조 API 형식

## 이 파일은 뭐예요?

재고 화면이 서버와 주고받는 데이터 모양을 정의합니다. 입고, 창고↔부서 이동, 부서간 이동, 불량 등록, 공급사 반품, 재고 조정, 그리고 창고 지도와 실제 재고를 맞춰 보는 재고대조의 요청·응답 형식이 여기 모여 있습니다.

## 언제 보나요?

- 재고 화면에 보이는 수량(창고/생산/불량/예약/가용)이 어느 응답 필드에서 오는지 확인할 때
- 이동·불량·반품 요청을 보낼 때 어떤 항목이 필수인지 따질 때
- 재고대조(앵글 박스 vs 실제 재고) 결과가 어떻게 내려오는지 볼 때

## 중요한 내용 (주요 클래스)

- `InventoryResponse` / `ItemWithInventory` 가 쓰는 수량 칸 — 수량이 한 덩어리가 아니라 나뉩니다:
  - `quantity` 총량 = `warehouse_qty`(창고) + `production_total`(생산) + `defective_total`(불량)
  - `available_quantity` 가용 = 창고 + 생산 − 예약(`pending_quantity`). 불량은 제외.
- `InventoryLocationResponse` — 부서×상태(PRODUCTION 정상 / DEFECTIVE 불량) 단위 분포.
- 이동 요청: `TransferRequest`(창고↔부서 공용), `DeptTransferRequest`(부서간).
- `MarkDefectiveRequest` — 불량 등록. `source` 가 'production' 이면 어느 부서에서 나왔는지(`source_department`) 필수, `target_department` 로 격리.
- `SupplierReturnRequest` — 부서별 불량(DEFECTIVE) 차감해 공급사로 반품.
- `ReconcileRow` / `ReconcileResponse` — 재고대조. `placed_total`(박스에 놓인 수량) vs `warehouse_qty` 비교, `diff` 와 `status`(ok/over/under).
- 처리자 식별: 여러 요청이 `producer_employee_code` 를 받으면 직원 DB 를 조회·검증해 `produced_by` 를 자동 설정합니다.

## 연결되는 파일

- [[ERP/backend/app/models/inventory.py]] — 이 형식이 비추는 실제 재고 표(Inventory · InventoryLocation).
- [[ERP/backend/app/services/inventory.py]] — 이 요청을 받아 실제 재고 숫자를 바꾸는 업무 규칙.
- [[ERP/backend/app/schemas/item.py]] — `InventoryLocationResponse` 를 가져다 `ItemWithInventory` 에 끼웁니다.
- [[ERP/backend/app/schemas/📁_schemas]] — 같은 패키지 형제들.

## 조심할 점

🔴 수량 필드(quantity / warehouse_qty / production_total / defective_total / available_quantity)는 서로 합이 맞아야 하는 관계입니다. 응답 형식만 보고 합 규칙을 깨는 변경을 하면 화면 숫자가 어긋납니다. 필드를 바꾸면 OpenAPI baseline 재생성과 프론트 타입 갱신이 함께 필요합니다.

## 핵심 발췌

```python
class InventoryResponse(BaseModel):
    quantity: int          # 총합 = warehouse + production_total + defective_total
    warehouse_qty: int = 0
    production_total: int = 0
    defective_total: int = 0
    pending_quantity: int = 0
    available_quantity: int = 0  # warehouse + production - pending (defective 제외)
```
