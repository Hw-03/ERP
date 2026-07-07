"""Data helpers for BOM graph/report scripts.

The scripts in this folder are read-only analysis tools.  Keep the data loading
root-scoped so a representative PF graph does not pull every Item row into
memory.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable

from sqlalchemy.orm import Session

from app.models import BOM, Item, ProcessType, ProductSymbol
from app.services import stock_math
from app.services.bom import MAX_DEPTH, BomCache


@dataclass(frozen=True)
class BomGraphMaps:
    items: dict[uuid.UUID, Item]
    figures: dict[uuid.UUID, stock_math.StockFigures]


def build_limited_bom_cache(
    db: Session,
    root_ids: Iterable[uuid.UUID],
    *,
    max_depth: int = MAX_DEPTH,
) -> BomCache:
    """Return parent -> children BOM rows reachable from the given roots."""
    cache: BomCache = {}
    visited: set[uuid.UUID] = set()
    frontier = {uuid.UUID(str(root_id)) for root_id in root_ids}
    depth = 0

    while frontier and depth <= max_depth:
        rows = (
            db.query(BOM.parent_item_id, BOM.child_item_id, BOM.quantity)
            .filter(BOM.parent_item_id.in_(list(frontier)))
            .all()
        )
        next_frontier: set[uuid.UUID] = set()
        for parent_id, child_id, quantity in rows:
            cache.setdefault(parent_id, []).append((child_id, quantity))
            if child_id not in visited:
                next_frontier.add(child_id)

        visited.update(frontier)
        frontier = next_frontier - visited
        depth += 1

    return cache


def collect_item_ids(root_ids: Iterable[uuid.UUID], cache: BomCache) -> set[uuid.UUID]:
    """Collect root, parent, and child ids represented by a BOM cache."""
    ids = {uuid.UUID(str(root_id)) for root_id in root_ids}
    for parent_id, children in cache.items():
        ids.add(parent_id)
        ids.update(child_id for child_id, _quantity in children)
    return ids


def load_item_maps(db: Session, item_ids: Iterable[uuid.UUID]) -> BomGraphMaps:
    """Bulk-load Items and stock figures for graph nodes."""
    ids = list({uuid.UUID(str(item_id)) for item_id in item_ids})
    items = {
        item.item_id: item
        for item in db.query(Item).filter(Item.item_id.in_(ids)).all()
    }
    return BomGraphMaps(items=items, figures=stock_math.bulk_compute(db, ids))


def load_model_labels(db: Session) -> dict[str, str]:
    """Return product symbol -> model label from ProductSymbol master."""
    rows = (
        db.query(ProductSymbol.symbol, ProductSymbol.model_name)
        .filter(ProductSymbol.symbol.isnot(None), ProductSymbol.model_name.isnot(None))
        .order_by(ProductSymbol.slot)
        .all()
    )
    return {str(symbol): str(model_name) for symbol, model_name in rows}


def load_process_levels(db: Session) -> list[dict[str, object]]:
    """Return process levels ordered by ProcessType stage_order."""
    rows = (
        db.query(ProcessType)
        .order_by(ProcessType.stage_order, ProcessType.code)
        .all()
    )
    return [
        {
            "code": row.code,
            "label": row.description or row.code,
            "stage_order": int(row.stage_order or 0),
            "prefix": row.prefix,
            "suffix": row.suffix,
        }
        for row in rows
    ]


def build_graph_tree(
    item_id: uuid.UUID,
    cache: BomCache,
    maps: BomGraphMaps,
    *,
    edge_quantity: Decimal = Decimal("1"),
    required_quantity: Decimal = Decimal("1"),
    visiting: frozenset[uuid.UUID] = frozenset(),
    depth: int = 0,
    max_depth: int = MAX_DEPTH,
) -> dict[str, object]:
    """Build a JSON-ready BOM tree with quantity and stock analysis fields."""
    item_uuid = uuid.UUID(str(item_id))
    item = maps.items.get(item_uuid)
    figures = maps.figures.get(item_uuid, stock_math.StockFigures())
    min_stock = _item_decimal(item.min_stock) if item and item.min_stock is not None else None

    available = max(figures.available, Decimal("0"))
    warehouse_available = max(figures.warehouse_available, Decimal("0"))
    shortage = max(required_quantity - available, Decimal("0"))
    warehouse_shortage = max(required_quantity - warehouse_available, Decimal("0"))
    below_min_stock = min_stock is not None and available < min_stock

    node: dict[str, object] = {
        "item_id": str(item_uuid),
        "code": item.mes_code if item else None,
        "name": item.item_name if item else "(missing item)",
        "type": item.process_type_code if item else None,
        "unit": item.unit if item else "EA",
        "edge_quantity": _number(edge_quantity),
        "required_quantity": _number(required_quantity),
        "available_quantity": _number(available),
        "warehouse_available": _number(warehouse_available),
        "min_stock": _number(min_stock) if min_stock is not None else None,
        "shortage_to_required": _number(shortage),
        "warehouse_shortage_to_required": _number(warehouse_shortage),
        "below_min_stock": below_min_stock,
        "stock_tone": _stock_tone(shortage, warehouse_shortage, below_min_stock),
        "children": [],
    }

    if depth >= max_depth or item_uuid in visiting:
        node["truncated"] = True
        return node

    next_visiting = visiting | frozenset([item_uuid])
    children = []
    for child_id, child_per_unit in cache.get(item_uuid, []):
        child_required = required_quantity * child_per_unit
        children.append(
            build_graph_tree(
                child_id,
                cache,
                maps,
                edge_quantity=child_per_unit,
                required_quantity=child_required,
                visiting=next_visiting,
                depth=depth + 1,
                max_depth=max_depth,
            )
        )
    node["children"] = children
    return node


def count_nodes(node: dict[str, object]) -> int:
    children = node.get("children")
    if not isinstance(children, list):
        return 1
    return 1 + sum(count_nodes(child) for child in children if isinstance(child, dict))


def _item_decimal(value) -> Decimal:
    return Decimal(str(value or 0))


def _number(value):
    decimal_value = Decimal(str(value or 0))
    if decimal_value == decimal_value.to_integral_value():
        return int(decimal_value)
    return float(decimal_value)


def _stock_tone(
    shortage: Decimal,
    warehouse_shortage: Decimal,
    below_min_stock: bool,
) -> str:
    if shortage > 0 or warehouse_shortage > 0:
        return "danger"
    if below_min_stock:
        return "warning"
    return "normal"
