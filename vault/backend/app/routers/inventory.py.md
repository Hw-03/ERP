---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/inventory.py
status: active
tags:
  - erp
  - backend
  - router
  - inventory
aliases:
  - 재고 라우터
  - 입출고 API
---

# inventory.py

> [!summary] 역할
> 재고 관련 모든 API 엔드포인트를 담당한다.
> 입고·출고·조정·이동·이력 조회·창고↔생산 이관 등 재고 흐름 전체를 처리한다.

> [!info] 주요 책임
> - `GET /api/inventory/summary` — 카테고리별 재고 요약
> - `POST /api/inventory/receive` — 입고
> - `POST /api/inventory/ship` — 출고
> - `POST /api/inventory/adjust` — 재고 조정
> - `POST /api/inventory/transfer-to-production` — 창고→생산 이관
> - `POST /api/inventory/transfer-to-warehouse` — 생산→창고 이관
> - `POST /api/inventory/transfer-between-depts` — 부서 간 이관
> - `POST /api/inventory/mark-defective` — 불량 처리
> - `POST /api/inventory/return-to-supplier` — 공급업체 반품
> - `POST /api/inventory/ship-package` — 패키지 출하
> - `GET /api/inventory/transactions` — 거래 이력 조회
> - `GET /api/inventory/transactions/export.xlsx` — 이력 엑셀 다운로드
> - `GET /api/inventory/locations/{item_id}` — 품목별 위치(부서·상태)별 수량

> [!warning] 주의
> - 재고는 창고수량(`warehouse_qty`)과 생산수량(부서별 `inventory_locations`)으로 이원화됨
> - 모든 재고 변동은 `TransactionLog`에 기록됨

---

## 쉬운 말로 설명

이 라우터는 **"재고가 실제로 움직일 때"** 쓰이는 창구. 품목 자체의 정체(`items.py`)와는 분리되어 있다. 입고/출고/이동/조정/불량/반품/이력까지 재고 흐름 전반을 총괄.

**핵심 원칙 2가지**:
1. **창고는 공급원**. 부서로 이동해야 생산에 쓸 수 있다.
2. **출고는 출하부에서만**. 다른 부서 재고로는 출고 못 한다(먼저 출하부로 옮겨야 함).

---

## 엔드포인트별 상세

### 요약·조회
| 경로 | 용도 |
|------|------|
| `GET /api/inventory/summary` | 카테고리별 품목수·총수량·창고합·생산합·불량합 |
| `GET /api/inventory` | 재고 목록 (카테고리 필터) |
| `GET /api/inventory/locations/{item_id}` | 품목별 부서×상태 분포 전체 |
| `GET /api/inventory/transactions` | 거래 이력 (필터: item_id, type, reference_no, search) |
| `GET /api/inventory/transactions/export.csv` | 이력 CSV |
| `GET /api/inventory/transactions/export.xlsx` | 이력 엑셀 (유형별 색상 구분) |

### 재고 변동
| 경로 | 효과 | 거래유형 |
|------|------|---------|
| `POST /api/inventory/receive` | 창고 +quantity | `RECEIVE` |
| `POST /api/inventory/ship` | 출하부 PRODUCTION −quantity | `SHIP` |
| `POST /api/inventory/ship-package` | 패키지 구성품 전체 출고 | `SHIP` × N |
| `POST /api/inventory/adjust` | 창고수량 직접 설정 (delta 계산) | `ADJUST` |
| `POST /api/inventory/transfer-to-production` | 창고 → 부서 PRODUCTION | `TRANSFER_TO_PROD` |
| `POST /api/inventory/transfer-to-warehouse` | 부서 PRODUCTION → 창고 | `TRANSFER_TO_WH` |
| `POST /api/inventory/transfer-between-depts` | 부서 A → 부서 B | `TRANSFER_DEPT` |
| `POST /api/inventory/mark-defective` | PRODUCTION → DEFECTIVE 격리 | `MARK_DEFECTIVE` |
| `POST /api/inventory/return-to-supplier` | 부서 DEFECTIVE −quantity | `SUPPLIER_RETURN` |

### 이력 수정
| 경로 | 용도 |
|------|------|
| `PUT /api/inventory/transactions/{log_id}` | 이력 메모만 수정 (수량·시각 불변) |

---

## 요청/응답 예시

### 입고
```json
POST /api/inventory/receive
{
  "item_id": "550e8400-...",
  "quantity": 10,
  "location": "A-3-1",
  "reference_no": "PO-20260422-001",
  "produced_by": "김현우",
  "notes": "정기 입고"
}
```
→ `inventory.warehouse_qty += 10`, `TransactionLog(RECEIVE, +10)` 1행.

### 출고 (출하부에서만)
```json
POST /api/inventory/ship
{ "item_id": "550e8400-...", "quantity": 3 }
```
출하부 PRODUCTION 수량이 부족하면 **422**: `출하부 재고가 부족합니다. 다른 부서에서 출하부로 먼저 이동해 주세요.`

### 부서 간 이동
```json
POST /api/inventory/transfer-between-depts
{
  "item_id": "550e8400-...",
  "quantity": 5,
  "from_department": "고압",
  "to_department": "조립"
}
```
→ `inventory_locations` 2행 업데이트 (고압 −5, 조립 +5). `quantity_change=0` (총합 불변).

### 불량 등록
```json
POST /api/inventory/mark-defective
{
  "item_id": "550e8400-...",
  "quantity": 1,
  "source": "production",
  "source_department": "조립",
  "target_department": "조립",
  "reason": "용접 불량"
}
```
→ 조립부 PRODUCTION −1, 조립부 DEFECTIVE +1. 총합 불변.

---

## 요약 응답 형식 (`InventoryResponse`)

```json
{
  "inventory_id": "...",
  "item_id": "...",
  "quantity": 15,            // 총합 = warehouse + production + defective
  "warehouse_qty": 10,
  "production_total": 4,     // 모든 부서 PRODUCTION 합
  "defective_total": 1,      // 모든 부서 DEFECTIVE 합
  "pending_quantity": 2,     // 큐 배치 예약분
  "available_quantity": 12,  // warehouse + production - pending
  "location": "A-3-1",
  "last_reserver_name": "김현우",
  "locations": [
    {"department": "조립", "status": "PRODUCTION", "quantity": 3},
    {"department": "조립", "status": "DEFECTIVE", "quantity": 1},
    {"department": "출하", "status": "PRODUCTION", "quantity": 1}
  ]
}
```

---

## FAQ

**Q. 왜 출고가 출하부에서만 되나?**
실물 흐름을 반영한 설계. 조립부에서 바로 출고하면 이동 이력이 누락되어 추적 어려움. 반드시 `transfer-between-depts`로 출하부로 옮긴 뒤 `ship`.

**Q. `adjust`는 `receive`와 뭐가 다른가?**
`receive`는 +덧셈, `adjust`는 =설정. 실사 후 재고가 7개여야 하는데 시스템은 10개면 `adjust(quantity=7)` 로 맞춘다.

**Q. `mark-defective`에서 `source="warehouse"` 도 되나?**
된다. 그럼 창고 −, 지정 부서 DEFECTIVE +. 창고 불량은 관례상 품질부서(조립 등)로 격리.

**Q. 이력에서 수량 이전/이후값이 NULL이면?**
오래된(레거시 시드) 로그이거나 수동으로 넣은 기록. 신규 API로 생성된 로그는 항상 채워진다.

**Q. 엑셀 다운로드 시 색상 의미?**
입고=초록, 출고=빨강, 조정=노랑, 생산=파랑, 이동=연보라, 불량=분홍, 반품=짙은 분홍. 한눈에 유형 식별.

**Q. 같은 `reference_no`로 여러 번 입고?**
허용. 서버에서 유니크 검사 없음. 운영 시 클라이언트·관리자가 관리.

---

## 관련 문서

- [[backend/app/models.py.md]] — `Inventory`, `InventoryLocation`, `TransactionLog`
- [[backend/app/services/inventory.py.md]] — 실제 이동/차감 로직 (`consume_from_department`, `transfer_to_production` 등)
- [[backend/app/routers/production.py.md]] — PRODUCE 입고(Backflush 포함)
- [[backend/app/routers/queue.py.md]] — 배치 확정 시 연쇄 재고 변동
- [[backend/app/routers/items.py.md]]
- [[frontend/lib/api.ts.md]]
- 재고 입출고 시나리오 — 7가지 이동 흐름 통합 가이드
- FAQ 전체

Up: [[backend/app/routers/routers]]
