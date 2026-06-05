---
type: file-explanation
source_path: "backend/app/models/inventory.py"
importance: critical
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# inventory.py — 재고 수량 표 (창고 / 부서·상태별)

## 이 파일은 무엇을 책임지나

품목별 재고 수량을 저장하는 두 개의 표를 정의합니다. 하나는 품목당 1행인 총괄 재고(Inventory), 다른 하나는 "어느 부서의 정상/불량 재고가 몇 개냐"를 나누어 담는 위치별 재고(InventoryLocation) 입니다.

## 업무 흐름에서의 의미

현장에서 보는 "이 품목 지금 몇 개 있나"는 결국 이 표에서 나옵니다. 특히 수량이 한 덩어리가 아니라 여러 칸으로 나뉘어 있다는 점이 중요합니다 — 창고에 둔 양, 생산 부서에 나가 있는 양, 큐(대기열)에 예약된 양이 따로 관리됩니다.

## 언제 보면 좋나

- 재고 숫자가 안 맞을 때, 어느 칸이 어긋났는지 따질 때
- "가용 재고(쓸 수 있는 양)"가 어떻게 계산되는지 확인할 때
- 불량 재고가 부서·상태별로 어떻게 분리 저장되는지 볼 때

## 중요한 내용

- `Inventory` — 품목당 1행(item_id unique). 수량 칸이 셋으로 나뉩니다:
  - `quantity` : 총량. = `warehouse_qty` + 모든 위치재고(InventoryLocation) 합. 서비스 레이어가 항상 맞춰 줍니다.
  - `warehouse_qty` : 창고 보관량.
  - `pending_quantity` : 큐 배치로 예약된 양(창고분 중에서). 가용 = 창고 + 생산합계 − 예약.
  - DB 안전망: 모든 수량 ≥ 0, 그리고 `warehouse_qty ≥ pending_quantity`(예약이 창고 보관량을 넘을 수 없음).
- `InventoryLocation` — (품목 × 부서 × 상태) 당 1행. 상태는 `PRODUCTION`(정상) 또는 `DEFECTIVE`(불량). 부서별 정상/불량 재고를 여기서 쪼개 저장합니다.
  - `defective_at` : 불량으로 잡힌 시점.
  - Inventory 와는 관계 매핑 없이 item_id 로 직접 매칭해 조회합니다.

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/item.py]] — 재고는 품목 1건에 1행으로 붙습니다.
- [[ERP/backend/app/models/transaction.py]] — 재고를 바꾼 모든 동작은 거래 로그로 남습니다.
- [[ERP/backend/app/models/warehouse.py]] — 창고 지도의 박스 수량과 대조하는 기준이 `warehouse_qty` 입니다.

## 조심할 점

세 수량 칸(quantity / warehouse_qty / pending_quantity)은 서로 합이 맞아야 하는 관계입니다. 한 칸만 직접 고치면 합이 깨집니다 — 반드시 서비스 레이어를 통해 함께 갱신해야 합니다. DB 의 CheckConstraint 가 마지막 안전망 역할을 합니다.

## 핵심 발췌

```python
quantity = Column(IntQuantity, nullable=False, default=0)        # = warehouse + Σ위치재고
warehouse_qty = Column(IntQuantity, nullable=False, default=0)   # 창고 보관량
pending_quantity = Column(IntQuantity, nullable=False, default=0) # 큐 예약분
# CheckConstraint("warehouse_qty >= pending_quantity", ...)
```
