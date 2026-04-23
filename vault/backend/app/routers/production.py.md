---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/production.py
status: active
tags:
  - erp
  - backend
  - router
  - production
aliases:
  - 생산 라우터
  - 생산 입고 API
---

# production.py

> [!summary] 역할
> 생산 입고와 BOM 기반 Backflush(자재 자동 차감)를 처리하는 API.
> 제품을 생산 완료했을 때 재고에 반영하고, 사용된 자재를 자동으로 차감한다.

> [!info] 주요 책임
> - `POST /api/production/receipt` — 생산 입고 처리 + BOM Backflush 자동 실행
> - `GET /api/production/bom-check/{item_id}` — 생산 가능 여부 사전 체크 (부족 자재 목록 반환)

> [!warning] 주의
> - `receipt` 호출 시 BOM에 등록된 자재들이 자동 차감됨 — 되돌리기 불가
> - BOM이 없는 품목도 생산 입고는 가능하지만 Backflush는 발생하지 않음

---

## 쉬운 말로 설명

이 라우터는 **"BOM 기반 단발 생산 입고"** 전용. Queue 없이 바로 "완제품 N개 생산 완료 → 자재 자동 차감 + 완제품 입고" 한 방에 처리한다.

간단·빠르지만 pending 예약 단계가 없어 **중간 확인·수정 불가**. 복잡한 작업엔 `queue.py` 사용 권장.

---

## 엔드포인트

### `POST /api/production/receipt`

요청:
```json
{
  "item_id": "uuid-of-ADX6000",
  "quantity": 2,
  "reference_no": "WO-20260422-01",
  "produced_by": "김현우",
  "notes": "정기 생산"
}
```

처리 순서 (의사코드):
```
1. _explode_bom(item_id, 2)
   → [(튜브, 2), (보드, 2), (케이블, 4)] (재귀 평탄화)
2. merged dict로 통합 (같은 자재 중복 합산)
3. 사전 검사: 각 자재 warehouse_qty − pending_quantity >= 필요?
   - 부족 시 422 반환 (부족분 리스트)
4. 각 자재 Backflush:
   - warehouse_qty -= 필요수량
   - TransactionLog(BACKFLUSH, -qty)
5. 완제품 생산 입고:
   - 카테고리 매핑 부서 찾기 (dept_for_category)
   - 있으면 해당 부서 PRODUCTION +quantity
   - 없으면 창고 +quantity
   - TransactionLog(PRODUCE, +quantity)
6. db.commit (전체 원자)
```

### `GET /api/production/bom-check/{item_id}?quantity=N`

생산 가능 여부 사전 검증. 응답:
```json
{
  "item_id": "...",
  "item_name": "ADX6000",
  "quantity_to_produce": 2,
  "can_produce": false,
  "components": [
    {"erp_code":"3-AR-0012", "required":2, "current_stock":5, "pending":1, "available":4, "shortage":0, "ok":true},
    {"erp_code":"...보드", "required":2, "available":1, "shortage":1, "ok":false}
  ]
}
```

---

## FAQ

**Q. `receipt`와 `queue PRODUCE 확정` 차이?**
`receipt` = 즉시 1회성, pending 없이 창고에서만 차감. `queue` = 예약(pending) 단계 + 수량·라인 조정 + 확정. 현장에서 작업 시간이 긴 경우 `queue` 사용.

**Q. Backflush 대상은 항상 창고?**
`receipt` 기준으로는 YES. 창고 `warehouse_qty`에서만 차감. 부서에 있는 재고는 보지 않는다. 부서 자재까지 쓰려면 먼저 `transfer-to-warehouse`.

**Q. BOM 없는 완제품을 `receipt`로 찍으면?**
400 `등록된 BOM이 없습니다.` 에러. 이 경우 `inventory/adjust`나 수동 `receive`로 처리.

**Q. 카테고리 매핑 부서는 어떻게 결정?**
`inventory_svc.dept_for_category()`. 예: TF/HF/VF/BF는 조립부, FG는 출하부 등. 매핑 없으면 창고로 입고.

**Q. 재귀 BOM (부품 안에 서브BOM) 처리?**
`_explode_bom`이 재귀 순회하며 모든 하위 자재를 평탄화. 깊이 10까지.

---

## 관련 문서

- [[backend/app/routers/bom.py.md]] — BOM CRUD
- [[backend/app/routers/queue.py.md]] — 2단계 배치 워크플로
- [[backend/app/routers/inventory.py.md]]
- [[backend/app/services/bom.py.md]] — `explode_bom` 원본
- [[backend/app/services/inventory.py.md]] — `dept_for_category`, `receive_confirmed`
- 생산 배치 시나리오
- 용어 사전 — 백플러시

Up: [[backend/app/routers/routers]]
