---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/routers/inventory/query.py
tags: [vault, code-note, backend, router]
aliases: [inventory 요약·위치 조회]
---

# 📦 query.py — 재고 요약·위치 조회 (읽기 전용)

> [!summary] 역할
> `GET /inventory/summary` 와 `GET /inventory/locations/{item_id}` 두 개의 읽기 전용 엔드포인트.  
> `/summary` 는 18개 공정코드 단위로 재고를 집계해 대시보드 KPI 카드를 채운다.  
> `/locations/{item_id}` 는 품목 한 건의 부서×상태 분포를 반환한다.

#layer/backend #topic/router #topic/inventory

---

## 1. 역할

- `GET /inventory/summary`: 공정코드 18개 단위 재고 요약 (창고/생산/불량 합계)
- `GET /inventory/locations/{item_id}`: 품목 위치 분포 (수량 0인 행 포함)
- 쓰기 없는 순수 조회 모듈

## 2. 원본 위치

```
erp/backend/app/routers/inventory/query.py
```

## 3. import

| 모듈 | 용도 |
|------|------|
| `sqlalchemy.func` | SQL 집계 함수 |
| `app.models.Inventory, InventoryLocation, Item, LocationStatusEnum` | ORM 모델 |
| `app.schemas.InventorySummaryResponse, ProcessTypeSummary, InventoryLocationResponse` | 응답 스키마 |
| `._shared.PROCESS_TYPE_LABELS, PROCESS_TYPE_ORDER` | 18개 공정코드 라벨·순서 |

## 4. export (endpoint 목록)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/inventory/summary` | 공정코드 18개 집계 요약 |
| GET | `/inventory/locations/{item_id}` | 품목 부서×상태 위치 분포 |

## 5. 참조처

- 프론트엔드 대시보드 KPI 카드: `/inventory/summary`
- 품목 상세 팝업 위치 탭: `/inventory/locations/{item_id}`

## 6. 업무 흐름

```mermaid
flowchart LR
    FE[프론트엔드 대시보드] -->|GET /inventory/summary| SUM[get_inventory_summary]
    SUM --> Q1[Item + Inventory outerjoin 집계]
    SUM --> Q2[InventoryLocation status 집계]
    Q1 --> MERGE[summary_map 합산]
    Q2 --> MERGE
    MERGE --> ORDER[PROCESS_TYPE_ORDER 정렬]
    ORDER --> RESP[InventorySummaryResponse]

    FE2[품목 상세 팝업] -->|GET /inventory/locations/{id}| LOC[get_item_locations]
    LOC --> Q3[InventoryLocation WHERE item_id=?]
    Q3 --> RESP2[List InventoryLocationResponse]
```

## 7. 핵심 함수

### `get_inventory_summary` — 2쿼리 집계

```python
@router.get("/summary", response_model=InventorySummaryResponse)
def get_inventory_summary(db: Session = Depends(get_db)):
    rows = (
        db.query(
            Item.process_type_code,
            func.count(Item.item_id).label("item_count"),
            func.coalesce(func.sum(Inventory.quantity), 0).label("total_quantity"),
            func.coalesce(func.sum(Inventory.warehouse_qty), 0).label("warehouse_sum"),
        )
        .outerjoin(Inventory, Item.item_id == Inventory.item_id)
        .group_by(Item.process_type_code)
        .all()
    )

    loc_rows = (
        db.query(
            Item.process_type_code,
            InventoryLocation.status,
            func.coalesce(func.sum(InventoryLocation.quantity), 0).label("loc_sum"),
        )
        .join(InventoryLocation, InventoryLocation.item_id == Item.item_id)
        .group_by(Item.process_type_code, InventoryLocation.status)
        .all()
    )
    # production/defective 분리 후 PROCESS_TYPE_ORDER 순서로 조립
```

- 쿼리 1: Item.process_type_code 별 item_count + total_quantity + warehouse_sum
- 쿼리 2: InventoryLocation status 별 production/defective 합계
- 두 결과를 `PROCESS_TYPE_ORDER` 순서로 조립 → 18개 항목 보장 (없는 코드는 0)

### `get_item_locations` — 위치 분포

```python
@router.get("/locations/{item_id}", response_model=List[InventoryLocationResponse])
def get_item_locations(item_id: uuid.UUID, db: Session = Depends(get_db)):
    rows = (
        db.query(InventoryLocation)
        .filter(InventoryLocation.item_id == item_id)
        .all()
    )
    return [
        InventoryLocationResponse(
            department=row.department,
            status=row.status,
            quantity=row.quantity or Decimal("0"),
        )
        for row in rows
    ]
```

> [!note] 수량 0 포함
> `_shared.list_locations` 와 달리 `quantity > 0` 필터 없음. 모든 분포 행을 노출.

## 8. 위험 포인트

> [!warning] category 컬럼 제거 후 단일 원천
> 과거에는 `Item.category` 컬럼으로 그룹핑했다.  
> 현재는 `process_type_code` 단일 원천이다.  
> `category` 기반 코드가 남아 있으면 즉시 제거.

> [!danger] `PROCESS_TYPE_ORDER` 와 실제 DB 데이터 미스매치
> `summary_map` 에 없는 코드는 `data.get(code, {0, 0, 0})` 으로 0 채움.  
> 새 공정코드가 DB 에 생겼는데 `PROCESS_TYPE_ORDER` 에 없으면 집계에서 누락된다.

## 9. 죽은 코드 의심

- `from app.models import LocationStatusEnum` 임포트 후 `PRODUCTION` / `DEFECTIVE` 에만 사용.  
  `LocationStatusEnum` 값이 추가되어도 summary 는 2종만 분리하므로 나머지는 합산 무시.

## 10. 수정 전 체크

- [ ] 새 공정코드 추가 시 `_shared.PROCESS_TYPE_LABELS` 와 `PROCESS_TYPE_ORDER` 동시 갱신
- [ ] `/summary` 응답 필드 추가 시 `InventorySummaryResponse` 스키마 동기화
- [ ] `/locations/{item_id}` 는 수량 0 행도 반환한다 — 프론트 처리 확인

## 11. 코드 발췌

```python
for code in PROCESS_TYPE_ORDER:
    data = summary_map.get(
        code,
        {"item_count": 0, "total_quantity": Decimal("0"), "warehouse_sum": Decimal("0")},
    )
    process_types.append(
        ProcessTypeSummary(
            process_type_code=code,
            label=PROCESS_TYPE_LABELS[code],
            item_count=data["item_count"],
            total_quantity=data["total_quantity"],
            warehouse_qty_sum=data["warehouse_sum"],
            production_qty_sum=prod_map.get(code, Decimal("0")),
            defective_qty_sum=defect_map.get(code, Decimal("0")),
        )
    )

return InventorySummaryResponse(
    process_types=process_types,
    total_items=total_items,
    total_quantity=total_quantity,
)
```

---

## 관련 노트

- [[_inventory]] — inventory 패키지 허브
- [[_shared.py]] — PROCESS_TYPE_LABELS / ORDER 정의처
- [[__init__.py]] — 패키지 진입점

Up: [[_inventory]]
