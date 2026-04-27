---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/inventory/_shared.py
status: active
updated: 2026-04-27
source_sha: 28d11cfe41ac
tags:
  - erp
  - backend
  - router
  - py
---

# _shared.py

> [!summary] 역할
> FastAPI 라우터 계층의 `_shared` 영역 API 엔드포인트를 담당한다.

## 원본 위치

- Source: `backend/app/routers/inventory/_shared.py`
- Layer: `backend`
- Kind: `router`
- Size: `3924` bytes

## 연결

- Parent hub: [[backend/app/routers/inventory/inventory|backend/app/routers/inventory]]
- Related: [[backend/backend]]

## 읽는 포인트

- 라우터는 API 표면이다. 요청/응답 계약은 `schemas.py`와 함께 확인한다.
- DB 변경은 서비스/모델/테스트까지 같이 본다.

## 원본 발췌

````python
"""inventory 패키지 공용 헬퍼.

- to_response: Inventory ORM → InventoryResponse (stock_math 통일 계산 + locations 포함)
- list_locations: item_id 의 InventoryLocation 행 (수량 > 0) 을 응답 모델로
- CATEGORY_LABELS / CATEGORY_ORDER: /summary 에서 사용
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import List

from sqlalchemy.orm import Session

from app.models import CategoryEnum, Inventory, InventoryLocation
from app.schemas import InventoryLocationResponse, InventoryResponse
from app.services import stock_math


CATEGORY_LABELS = {
    CategoryEnum.RM: "원자재",
    CategoryEnum.TA: "튜브 반제품",
    CategoryEnum.TF: "튜브 완제품",
    CategoryEnum.HA: "고압 반제품",
    CategoryEnum.HF: "고압 완제품",
    CategoryEnum.VA: "진공 반제품",
    CategoryEnum.VF: "진공 완제품",
    CategoryEnum.AA: "조립 반제품",
    CategoryEnum.AF: "조립 완제품",
    CategoryEnum.FG: "완제품",
    CategoryEnum.UK: "미분류 품목",
}

CATEGORY_ORDER = [
    CategoryEnum.RM,
    CategoryEnum.TA,
    CategoryEnum.TF,
    CategoryEnum.HA,
    CategoryEnum.HF,
    CategoryEnum.VA,
    CategoryEnum.VF,
    CategoryEnum.AA,
    CategoryEnum.AF,
    CategoryEnum.FG,
    CategoryEnum.UK,
]


def list_locations(db: Session, item_id: uuid.UUID) -> List[InventoryLocationResponse]:
    rows = (
        db.query(InventoryLocation)
        .filter(InventoryLocation.item_id == item_id, InventoryLocation.quantity > 0)
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


def _build_response(
    inv: Inventory,
    fig: stock_math.StockFigures,
    locations: List[InventoryLocationResponse],
) -> InventoryResponse:
    return InventoryResponse(
        inventory_id=inv.inventory_id,
        item_id=inv.item_id,
        quantity=fig.total,
        warehouse_qty=fig.warehouse_qty,
        production_total=fig.production_total,
        defective_total=fig.defective_total,
        pending_quantity=fig.pending,
        available_quantity=fig.available,
        last_reserver_name=inv.last_reserver_name,
        location=inv.location,
        updated_at=inv.updated_at,
        locations=locations,
    )


def to_response(db: Session, inv: Inventory) -> InventoryResponse:
    """단건 응답 조립. bulk_compute([id]) 로 list 경로와 동일한 코드 경로 사용."""
    figures_map = stock_math.bulk_compute(db, [inv.item_id])
    fig = figures_map.get(inv.item_id) or stock_math.StockFigures()
    return _build_response(inv, fig, list_locations(db, inv.item_id))


def to_response_bulk(
    db: Session, invs: List[Inventory]
) -> List[InventoryResponse]:
    """다건 응답 조립. bulk_compute + InventoryLocation IN(...) prefetch 로 N+1 제거."""
    if not invs:
        return []
    item_ids = [inv.item_id for inv in invs]
    figures_map = stock_math.bulk_compute(db, item_ids)

    loc_rows = (
        db.query(InventoryLocation)
        .filter(InventoryLocation.item_id.in_(item_ids), InventoryLocation.quantity > 0)
        .all()
    )
    locations_by_item: dict = {}
    for row in loc_rows:
        locations_by_item.setdefault(row.item_id, []).append(
            InventoryLocationResponse(
                department=row.department,
                status=row.status,
                quantity=row.quantity or Decimal("0"),
            )
        )

    return [
        _build_response(
            inv,
            figures_map.get(inv.item_id) or stock_math.StockFigures(),
            locations_by_item.get(inv.item_id, []),
        )
        for inv in invs
    ]
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
