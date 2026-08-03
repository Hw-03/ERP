"""창고 박스 배치 수량과 창고 재고의 차이를 읽기 전용으로 집계한다."""

from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import func


BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal  # noqa: E402
from app.models import Inventory, Item, WarehouseBox, WarehouseBoxItem  # noqa: E402


with SessionLocal() as db:
    box_count = db.query(func.count(WarehouseBox.box_id)).scalar()
    item_count = db.query(func.count(WarehouseBoxItem.id)).scalar()
    print(f"BOX_COUNT: {box_count}, ITEM_ALLOCATION_ROWS: {item_count}")

    rows = (
        db.query(
            Item.item_name,
            Item.mes_code,
            func.sum(WarehouseBoxItem.quantity).label("placed"),
            Inventory.warehouse_qty,
        )
        .join(WarehouseBoxItem, WarehouseBoxItem.item_id == Item.item_id)
        .join(Inventory, Inventory.item_id == Item.item_id, isouter=True)
        .group_by(Item.item_id)
        .all()
    )

    print(f"TOTAL_ITEMS_IN_BOX: {len(rows)}")
    print("\n=== OVER_ALLOCATED_ITEMS ===")
    over_count = 0
    for row in rows:
        warehouse_quantity = float(row.warehouse_qty or 0)
        placed_quantity = float(row.placed)
        if placed_quantity > warehouse_quantity:
            over_count += 1
            difference = placed_quantity - warehouse_quantity
            print(
                f"OVER: {row.mes_code} | placed={placed_quantity} "
                f"warehouse_qty={warehouse_quantity} diff={difference}"
            )

    if over_count == 0:
        print("(None)")

    normal_count = sum(1 for row in rows if float(row.placed) == float(row.warehouse_qty or 0))
    under_count = sum(1 for row in rows if float(row.placed) < float(row.warehouse_qty or 0))
    print("\n=== SUMMARY ===")
    print(f"Normal (placed == warehouse_qty): {normal_count}")
    print(f"Under-allocated (placed < warehouse_qty): {under_count}")
    print(f"Over-allocated (placed > warehouse_qty): {over_count}")
