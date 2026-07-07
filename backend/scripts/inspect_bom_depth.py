"""Inspect representative PF BOM depth, stages, and stock constraints.

Read-only script.  It uses bulk-loaded graph data so the BFS loop does not run
per-node SQL queries.

Run:
    cd backend
    python scripts/inspect_bom_depth.py
"""

from __future__ import annotations

import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models import Item, ProcessType
from app.services import stock_math
from scripts.bom_graph_data import (
    build_limited_bom_cache,
    collect_item_ids,
    load_item_maps,
)


NF_STAGE_ORDER = 60


def main() -> None:
    db = SessionLocal()
    try:
        roots = _representative_pf_items(db)
        print(f"== representative PF BOM analysis: {len(roots)} models ==\n")
        if not roots:
            return

        root_ids = [item.item_id for item in roots]
        bom_cache = build_limited_bom_cache(db, root_ids)
        maps = load_item_maps(db, collect_item_ids(root_ids, bom_cache))
        stage_by_code = {
            row.code: int(row.stage_order or 0)
            for row in db.query(ProcessType).all()
        }

        for item in roots:
            print(f"== model {item.model_symbol} - {item.mes_code} {item.item_name[:60]}")
            analyze_tree(item.item_id, bom_cache, maps, stage_by_code)
            print()
    finally:
        db.close()


def _representative_pf_items(db) -> list[Item]:
    rows = (
        db.query(Item)
        .filter(Item.process_type_code == "PF", Item.model_symbol.isnot(None))
        .order_by(Item.model_symbol, Item.mes_code, Item.item_name)
        .all()
    )
    reps: dict[str, Item] = {}
    for item in rows:
        if item.model_symbol not in reps:
            reps[item.model_symbol] = item
    return [reps[key] for key in sorted(reps)]


def analyze_tree(root_id, bom_cache, maps, stage_by_code: dict[str, int]) -> None:
    visited: set = set()
    queue: list[tuple[object, int, Decimal, str]] = [(root_id, 0, Decimal("1"), "")]
    max_depth = 0
    leaf_count = 0
    stage_distribution: dict[int, int] = {}
    below_nf_depth1: list[dict[str, object]] = []
    shortage_rows: list[dict[str, object]] = []

    while queue:
        item_id, depth, required_qty, parent_code = queue.pop(0)
        if item_id in visited:
            continue
        visited.add(item_id)
        max_depth = max(max_depth, depth)

        item = maps.items.get(item_id)
        if not item:
            continue

        fig = maps.figures.get(item_id, stock_math.StockFigures())
        stage = stage_by_code.get(item.process_type_code or "", 0)
        stage_distribution[stage] = stage_distribution.get(stage, 0) + 1

        available = max(fig.available, Decimal("0"))
        warehouse_available = max(fig.warehouse_available, Decimal("0"))
        min_stock = Decimal(str(item.min_stock)) if item.min_stock is not None else None
        shortage = max(required_qty - available, Decimal("0"))
        warehouse_shortage = max(required_qty - warehouse_available, Decimal("0"))
        below_min_stock = min_stock is not None and available < min_stock

        if shortage > 0 or warehouse_shortage > 0 or below_min_stock:
            shortage_rows.append({
                "code": item.mes_code,
                "name": item.item_name[:36],
                "depth": depth,
                "stage": stage,
                "required": required_qty,
                "available": available,
                "warehouse_available": warehouse_available,
                "min_stock": min_stock,
                "shortage": shortage,
                "warehouse_shortage": warehouse_shortage,
                "below_min_stock": below_min_stock,
                "parent": parent_code,
            })

        if depth == 1 and stage < NF_STAGE_ORDER:
            below_nf_depth1.append({
                "code": item.mes_code,
                "name": item.item_name[:36],
                "stage": stage,
                "required": required_qty,
                "available": available,
                "warehouse_available": warehouse_available,
            })

        children = bom_cache.get(item_id, [])
        if not children:
            leaf_count += 1
        for child_id, per_unit_qty in children:
            queue.append((child_id, depth + 1, required_qty * per_unit_qty, item.mes_code or ""))

    print(f"  max_depth = {max_depth}")
    print(f"  leaf_count = {leaf_count}")
    print(f"  unique items visited = {len(visited)}")
    print(f"  stage_distribution = {dict(sorted(stage_distribution.items()))}")

    if below_nf_depth1:
        print(
            f"  ! depth=1 children below NF stage ({len(below_nf_depth1)} rows) "
            "- immediate expansion stops here"
        )
        for row in below_nf_depth1[:5]:
            print(
                "    - "
                f"stage={row['stage']} {row['code']} {row['name']} "
                f"required={_fmt(row['required'])} "
                f"available={_fmt(row['available'])} "
                f"warehouse={_fmt(row['warehouse_available'])}"
            )
    else:
        print("  + all depth=1 children are stage >= NF for immediate expansion")

    if shortage_rows:
        print(f"  ! stock warnings / shortages ({len(shortage_rows)} rows, first 8)")
        for row in shortage_rows[:8]:
            flags = []
            if row["shortage"] > 0:
                flags.append(f"plan_short={_fmt(row['shortage'])}")
            if row["warehouse_shortage"] > 0:
                flags.append(f"warehouse_short={_fmt(row['warehouse_shortage'])}")
            if row["below_min_stock"]:
                flags.append("below_min_stock")
            print(
                "    - "
                f"d={row['depth']} stage={row['stage']} {row['code']} {row['name']} "
                f"required={_fmt(row['required'])} "
                f"available={_fmt(row['available'])} "
                f"warehouse={_fmt(row['warehouse_available'])} "
                f"min={_fmt(row['min_stock']) if row['min_stock'] is not None else '-'} "
                f"[{', '.join(flags)}]"
            )
    else:
        print("  + no required-vs-stock shortage or min_stock warning in this tree")


def _fmt(value: Decimal) -> str:
    if value == value.to_integral_value():
        return str(int(value))
    return f"{value:.4f}".rstrip("0").rstrip(".")


if __name__ == "__main__":
    main()
