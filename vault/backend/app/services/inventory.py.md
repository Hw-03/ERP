---
type: code-note
project: ERP
layer: backend
source_path: backend/app/services/inventory.py
status: active
tags:
  - erp
  - backend
  - service
  - inventory
aliases:
  - 재고 서비스
---

# services/inventory.py

> [!summary] 역할
> 재고 요약 계산, 입출고 처리의 공통 로직을 제공하는 서비스.

> [!info] 주요 책임
> - 카테고리별 재고 요약 집계
> - 창고/생산/불량 수량 분리 계산
> - TransactionLog 생성 공통 함수

---

## 쉬운 말로 설명

**3버킷 모델의 심장**. 재고가 "창고 / 부서(PRODUCTION) / 불량(DEFECTIVE)" 세 곳에 나눠져 있는데, 이 서비스 파일이 **버킷 간 이동·차감·복귀 로직**을 전부 책임진다.

라우터는 입력 검증만 하고, 실제 수량 조정은 여기 함수들을 호출해서 처리한다. 예약(pending) 처리·TransactionLog 기록까지 한 자리에서 책임지므로 일관성이 보장됨.

---

## 핵심 함수 (그룹별)

### 🔒 예약(pending) 처리
- **`reserve(inv, qty)`** — `pending_quantity += qty`. 사전 잠금. 실수량 차감 없음.
- **`release(inv, qty)`** — `pending_quantity -= qty`. 취소 시 잠금 해제.
- **`consume_pending(inv, qty)`** — 예약을 실수량으로 전환. `pending -= qty`, `warehouse_qty -= qty`. 배치 확정 시 호출.

### 📦 입고·출고·확정
- **`receive_confirmed(db, item, qty, tx_type, ...)`** — 창고 `warehouse_qty += qty`, `TransactionLog` 기록. PRODUCE/RECEIVE 공용.
- **`ship_to_external(db, item, qty, ...)`** — 창고에서 차감(출고/반품/폐기). 가용 검사 포함.

### 🚛 부서 이동 (창고 ↔ PRODUCTION)
- **`transfer_to_production(db, item, dept, qty, operator)`** — 창고에서 빼서 해당 부서 `InventoryLocation`으로 이동. `TRANSFER_TO_PROD` 로그.
- **`transfer_to_warehouse(db, item, dept, qty, operator)`** — 반대 방향. `TRANSFER_TO_WH`.
- **`transfer_between_departments(db, item, from, to, qty, operator)`** — 부서 간 직접 이동. `TRANSFER_DEPT`.

### ⚠️ 불량 처리
- **`mark_defective(db, item, qty, reason, operator, source_location=None)`** — 창고/부서의 정상 수량에서 → DEFECTIVE 버킷으로 이동. `location_type=DEFECTIVE` 레코드 사용.
- **`return_to_supplier(db, item, qty, operator)`** — DEFECTIVE에서 차감. 공급사 반품 완료 처리. `SUPPLIER_RETURN`.

### 🏭 부서에서 직접 소비
- **`consume_from_department(db, item, dept, qty, operator, ...)`** — 생산 공정 중 부서 재고 → 실사용 차감. 배치 확정에서 호출.

### 🔧 공통 유틸
- **`get_or_create_inventory(db, item_id)`** — `Inventory` 행 조회/자동 생성.
- **`get_or_create_location(db, inv_id, dept, loc_type)`** — `InventoryLocation` 조회/생성.

---

## 의사코드 (transfer_to_production)

```
transfer_to_production(item, dept, qty):
  inv = get_or_create_inventory(item.id)
  available = inv.warehouse_qty - inv.pending_quantity
  if available < qty:
    raise 422 "창고 가용 부족"

  inv.warehouse_qty -= qty
  loc = get_or_create_location(inv.id, dept, PRODUCTION)
  loc.quantity += qty

  TransactionLog(TRANSFER_TO_PROD, -qty on wh, +qty on loc)
  return
```

---

## 핵심 불변식

- 모든 함수가 **원자적**(동일 `db` 세션 내). 라우터가 `commit` 할 때까지 롤백 가능.
- `TransactionLog` 는 함수 내부에서 항상 생성 → 이력 누락 없음.
- `pending_quantity` 는 `warehouse_qty` 에만 존재(부서 재고에는 예약 개념 없음).
- 가용 수량 = `warehouse_qty - pending_quantity` (부서 이동 계산 시).

---

## FAQ

**Q. 왜 라우터에서 직접 SQL 치지 않고 서비스를 거치나?**
3버킷 이동은 항상 2곳(출발 버킷 -, 도착 버킷 +) + 로그(TransactionLog) 3개 작업이 세트. 서비스에 몰아넣지 않으면 라우터별로 빠뜨릴 위험.

**Q. `pending_quantity`는 언제 증가?**
OPEN 배치의 OUT 라인 생성 시(`reserve`). CONFIRM 시 `consume_pending` 으로 실수량 전환. CANCEL 시 `release`.

**Q. DEFECTIVE 버킷에서 부서 이동 가능?**
NO. DEFECTIVE에서는 오직 → `return_to_supplier`(공급사 반품) 경로만.

**Q. 부서가 없는 상태(단일 창고)로 쓸 수 있나?**
가능. `PRODUCTION` 위치 없이 창고만 쓰면 `transfer_*` 호출 생략. 다만 배치 기반 생산은 부서 모델을 전제로 함.

**Q. 배치 확정 시 OUT 라인은 어디서 차감?**
`queue.py::confirm_batch` 내부에서 `consume_from_department` 호출(부서 재고에서 차감). 창고가 아님에 주의.

---

## 관련 문서

- [[backend/app/routers/inventory.py.md]]
- [[backend/app/services/queue.py.md]] — confirm/cancel에서 이 서비스 대거 사용
- [[backend/app/models.py.md]] — `Inventory`, `InventoryLocation`, `TransactionLog`
- 재고 입출고 시나리오
- 생산 배치 시나리오

Up: [[backend/app/services/services]]
