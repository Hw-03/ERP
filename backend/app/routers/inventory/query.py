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
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
)
from app.schemas import (
    InventoryLocationResponse,
    InventorySummaryResponse,
    ProcessTypeSummary,
)

from ._shared import PROCESS_TYPE_LABELS, PROCESS_TYPE_ORDER


router = APIRouter()


@router.get("/summary", response_model=InventorySummaryResponse)
def get_inventory_summary(db: Session = Depends(get_db)):
    """process_type_code 18개 단일 기준 요약. category 컬럼 제거 후 단일 원천."""
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
    prod_map: dict[str | None, Decimal] = {}
    defect_map: dict[str | None, Decimal] = {}
    for code, st, val in loc_rows:
        v = Decimal(str(val or 0))
        if st == LocationStatusEnum.PRODUCTION:
            prod_map[code] = prod_map.get(code, Decimal("0")) + v
        elif st == LocationStatusEnum.DEFECTIVE:
            defect_map[code] = defect_map.get(code, Decimal("0")) + v

    summary_map = {
        row.process_type_code: {
            "item_count": row.item_count,
            "total_quantity": Decimal(str(row.total_quantity)),
            "warehouse_sum": Decimal(str(row.warehouse_sum)),
        }
        for row in rows
    }

    total_items = sum(value["item_count"] for value in summary_map.values())
    total_quantity = sum(value["total_quantity"] for value in summary_map.values())

    process_types: list[ProcessTypeSummary] = []
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
