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
