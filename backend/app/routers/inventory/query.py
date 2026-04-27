"""inventory 조회: /summary, /locations/{item_id}.

GET "" (목록) 은 빈 경로 + include_router 제약 때문에 패키지 __init__.py 에 직접 정의.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    CategoryEnum,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
)
from app.schemas import (
    CategorySummary,
    InventoryLocationResponse,
    InventorySummaryResponse,
)

from ._shared import CATEGORY_LABELS, CATEGORY_ORDER


router = APIRouter()


@router.get("/summary", response_model=InventorySummaryResponse)
def get_inventory_summary(db: Session = Depends(get_db)):
    rows = (
        db.query(
            Item.category,
            func.count(Item.item_id).label("item_count"),
            func.coalesce(func.sum(Inventory.quantity), 0).label("total_quantity"),
            func.coalesce(func.sum(Inventory.warehouse_qty), 0).label("warehouse_sum"),
        )
        .outerjoin(Inventory, Item.item_id == Inventory.item_id)
        .group_by(Item.category)
        .all()
    )

    loc_rows = (
        db.query(
            Item.category,
            InventoryLocation.status,
            func.coalesce(func.sum(InventoryLocation.quantity), 0).label("loc_sum"),
        )
        .join(InventoryLocation, InventoryLocation.item_id == Item.item_id)
        .group_by(Item.category, InventoryLocation.status)
        .all()
    )
    prod_map: dict = {}
    defect_map: dict = {}
    for cat, st, val in loc_rows:
        v = Decimal(str(val or 0))
        if st == LocationStatusEnum.PRODUCTION:
            prod_map[cat] = prod_map.get(cat, Decimal("0")) + v
        elif st == LocationStatusEnum.DEFECTIVE:
            defect_map[cat] = defect_map.get(cat, Decimal("0")) + v

    summary_map = {
        row.category: {
            "item_count": row.item_count,
            "total_quantity": Decimal(str(row.total_quantity)),
            "warehouse_sum": Decimal(str(row.warehouse_sum)),
        }
        for row in rows
    }

    total_items = sum(value["item_count"] for value in summary_map.values())
    total_quantity = sum(value["total_quantity"] for value in summary_map.values())
    uk_count = summary_map.get(CategoryEnum.UK, {}).get("item_count", 0)

    categories = []
    for category in CATEGORY_ORDER:
        data = summary_map.get(
            category,
            {"item_count": 0, "total_quantity": Decimal("0"), "warehouse_sum": Decimal("0")},
        )
        categories.append(
            CategorySummary(
                category=category,
                category_label=CATEGORY_LABELS[category],
                item_count=data["item_count"],
                total_quantity=data["total_quantity"],
                warehouse_qty_sum=data["warehouse_sum"],
                production_qty_sum=prod_map.get(category, Decimal("0")),
                defective_qty_sum=defect_map.get(category, Decimal("0")),
            )
        )

    return InventorySummaryResponse(
        categories=categories,
        total_items=total_items,
        total_quantity=total_quantity,
        uk_item_count=uk_count,
    )


@router.get("/locations/{item_id}", response_model=List[InventoryLocationResponse])
def get_item_locations(item_id: uuid.UUID, db: Session = Depends(get_db)):
    """품목의 부서×상태 분포 조회 (수량 0 인 행 포함, 모든 분포 노출)."""
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
