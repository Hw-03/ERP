---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/inventory/__init__.py
status: active
updated: 2026-04-27
source_sha: 8cf7f4ca9c8a
tags:
  - erp
  - backend
  - router
  - py
---

# __init__.py

> [!summary] 역할
> FastAPI 라우터 계층의 `__init__` 영역 API 엔드포인트를 담당한다.

## 원본 위치

- Source: `backend/app/routers/inventory/__init__.py`
- Layer: `backend`
- Kind: `router`
- Size: `2119` bytes

## 연결

- Parent hub: [[backend/app/routers/inventory/inventory|backend/app/routers/inventory]]
- Related: [[backend/backend]]

## 읽는 포인트

- 라우터는 API 표면이다. 요청/응답 계약은 `schemas.py`와 함께 확인한다.
- DB 변경은 서비스/모델/테스트까지 같이 본다.

## 원본 발췌

````python
"""inventory 라우터 패키지.

Phase 4 에서 단일 파일(routers/inventory.py 807줄)을 책임 단위로 분할.
`from app.routers import inventory` + `app.include_router(inventory.router, ...)` 호환.

서브 모듈:
- query        — /summary, /locations/{item_id}
- receive      — /receive, /adjust
- ship         — /ship, /ship-package
- transfer     — /transfer-to-production, /transfer-to-warehouse, /transfer-between-depts
- defective    — /mark-defective
- supplier     — /return-to-supplier
- transactions — /transactions, /transactions/export.csv|.xlsx, PUT /transactions/{log_id}

GET "" (목록) 은 FastAPI include_router 가 빈 prefix + 빈 path 를 거부하므로
이 파일에 직접 정의한다.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CategoryEnum, Inventory, Item
from app.schemas import InventoryResponse

from . import (
    defective,
    query,
    receive,
    ship,
    supplier,
    transactions,
    transfer,
)
from ._shared import to_response_bulk


router = APIRouter()

# 정적 경로(/transactions/*, /summary, /locations/...)를 동적 catch-all("") 보다 먼저 등록.
router.include_router(transactions.router)
router.include_router(query.router)
router.include_router(receive.router)
router.include_router(ship.router)
router.include_router(transfer.router)
router.include_router(defective.router)
router.include_router(supplier.router)


@router.get("", response_model=List[InventoryResponse])
def list_inventory(
    category: Optional[CategoryEnum] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    q = db.query(Inventory).join(Item, Inventory.item_id == Item.item_id)
    if category:
        q = q.filter(Item.category == category)

    rows = q.order_by(Item.erp_code).offset(skip).limit(limit).all()
    return to_response_bulk(db, rows)


__all__ = ["router"]
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
