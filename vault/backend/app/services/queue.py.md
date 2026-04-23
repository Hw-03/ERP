---
type: code-note
project: ERP
layer: backend
source_path: backend/app/services/queue.py
status: active
tags:
  - erp
  - backend
  - service
  - queue
aliases:
  - 큐 서비스
---

# services/queue.py

> [!summary] 역할
> 생산 대기열 배치의 확정·취소 시 실재고 반영과 관련 로그 생성을 처리하는 서비스.

> [!info] 주요 책임
> - 배치 확정 시 IN/OUT/SCRAP/LOSS 라인별 재고 반영
> - Variance(차이) 자동 계산 및 기록
> - Scrap/Loss 로그 자동 생성

---

## 쉬운 말로 설명

**생산 대기열(Queue) 배치의 모든 라이프사이클** 관리. 배치 생성 → 수정 → 확정 → 취소까지.

가장 중요한 함수는 `confirm_batch()`. 배치를 확정하면 이 한 함수가 **모든 재고 이동·TransactionLog·ScrapLog/LossLog/VarianceLog 기록**을 한 원자(atomic) 트랜잭션으로 실행.

---

## 핵심 함수

### `create_batch(db, payload)`
- 신규 배치(PRODUCE/DISASSEMBLE/RETURN) 생성 + BOM 기반 OUT 라인 자동 채움.
- 내부에서 `_seed_lines_from_bom()` 호출.
- OUT 라인마다 해당 부서의 `InventoryLocation.pending_quantity += qty` (예약 잠금).

### `_seed_lines_from_bom(db, batch, product_item, qty)`
- 배치 타입별 다른 동작:
  - **PRODUCE**: `explode_bom()` 결과로 OUT 라인 채우고, 결과 완제품 IN 라인 1개 추가.
  - **DISASSEMBLE**: `direct_children()` 결과로 IN 라인 채우고(자식 부품 생김), 부모 OUT 라인 1개(부모 소멸).
  - **RETURN**: DISASSEMBLE 과 유사하나 `is_return=True` 표시.

### `override_line_quantity(db, line_id, new_qty, operator)`
- OPEN 배치의 특정 라인 수량 수동 덮어쓰기.
- `bom_expected` 는 그대로 유지, `quantity` 만 변경 → 확정 시 Variance 기록 트리거.
- pending 재계산(old_pending 해제 후 new_pending 재예약).

### `toggle_line(db, line_id)`
- OUT/SCRAP/LOSS 라인을 번갈아 전환 (사용자가 "이건 버릴 거"로 바꾸는 동작).
- `direction` 만 변경.

### `add_line(db, batch_id, item_id, direction, qty, ...)` / `remove_line(db, line_id)`
- 수동 라인 추가/삭제. BOM 없이 현장 판단으로 자재 추가.

### `confirm_batch(db, batch_id, operator)` ⭐⭐⭐
- **가장 중요한 함수**. 배치 전체를 실재고에 반영.
- 라인 처리 순서 고정: **OUT → SCRAP → LOSS → IN** (자재 먼저 빼고 결과물 입고).
- 각 라인에서:
  - OUT: 부서 재고(`InventoryLocation`) 차감. `bom_expected != quantity` 면 `VarianceLog` 자동 생성.
  - SCRAP: 창고 `warehouse_qty` 차감 + `ScrapLog` 생성.
  - LOSS: 창고 차감(`deduct=True`인 경우) + `LossLog` 생성.
  - IN: 창고 `warehouse_qty` += qty (DISASSEMBLE의 자식 부품 입고 or PRODUCE의 완제품 입고).
- 모든 OUT 라인의 pending 예약을 `consume_pending` 으로 실수량 전환.
- `TransactionLog` 각 라인별 기록.
- 배치 상태 `OPEN → CONFIRMED`.

### `cancel_batch(db, batch_id, operator)`
- OPEN 배치를 취소. OUT 라인 pending 전부 `release`.
- 상태 `OPEN → CANCELLED`.
- 이미 CONFIRMED 는 취소 불가(되돌리려면 반대 배치 필요).

---

## 의사코드 (confirm_batch)

```
confirm_batch(batch_id):
  batch = query(Batch, id=batch_id)
  if batch.status != OPEN: 409

  lines_ordered = sort_by_direction(batch.lines, [OUT, SCRAP, LOSS, IN])

  for line in lines_ordered:
    match line.direction:
      OUT:
        loc = InventoryLocation(item, dept, PRODUCTION)
        if loc.quantity < line.quantity: 422
        consume_pending(inv, line.quantity)  # wh 창고에서 실제 차감은 여기
        loc.quantity -= line.quantity
        TransactionLog(BACKFLUSH, -qty, batch_id)
        if line.bom_expected and line.bom_expected != line.quantity:
          VarianceLog(item, batch, bom_expected, actual=quantity, diff)

      SCRAP:
        wh_available = warehouse_qty - pending
        if wh_available < qty: 422
        warehouse_qty -= qty
        ScrapLog + TransactionLog(SCRAP, -qty)

      LOSS:
        if line.deduct:
          warehouse_qty -= qty
        LossLog + TransactionLog(LOSS, change)

      IN:
        warehouse_qty += line.quantity
        TransactionLog(PRODUCE or DISASSEMBLE, +qty)

  batch.status = CONFIRMED
  batch.confirmed_at = now()
  commit
```

---

## 핵심 불변식

- 라인 처리 순서 고정(OUT→SCRAP→LOSS→IN). 바꾸면 재고 일관성 깨짐.
- OUT 라인의 pending 예약은 CONFIRM 또는 CANCEL 에서만 해소.
- 한 배치의 라인은 전부 성공하거나 전부 롤백. 부분 확정 없음.
- Variance는 OUT 라인만 대상 (IN 라인은 Variance 없음).

---

## FAQ

**Q. 확정했는데 재고가 부족하면?**
첫 라인부터 차례로 검사하다 부족하면 422 반환 + 롤백. 배치는 OPEN 유지.

**Q. 확정 후 실수 발견?**
취소 불가. 반대 방향 배치(예: PRODUCE → DISASSEMBLE)를 새로 만들어 수동 보정.

**Q. 라인 처리 순서가 왜 OUT → IN?**
자재(OUT)를 먼저 빼고 완제품(IN)을 받는다. 반대로 하면 "완제품은 생겼는데 자재가 없어서 차감 실패" 같은 중간 이상 상태.

**Q. BOM 없이 현장에서 라인 추가하면?**
`add_line()` 으로 `bom_expected=None` 인 라인 생성. 확정 시 Variance는 기록 안 함(bom_expected 없으므로).

**Q. Variance는 언제 기록?**
OUT 라인에 `bom_expected` 값이 있고 실제 `quantity` 와 다를 때만. `bom_expected` NULL이면 건너뜀.

---

## 관련 문서

- [[backend/app/routers/queue.py.md]]
- [[backend/app/routers/variance.py.md]]
- [[backend/app/services/inventory.py.md]] — 버킷 이동 헬퍼
- [[backend/app/services/bom.py.md]] — `explode_bom`, `direct_children`
- [[backend/app/models.py.md]] — `Batch`, `BatchLine`, `VarianceLog`
- 생산 배치 시나리오
- 분해 반품 시나리오

Up: [[backend/app/services/services]]
