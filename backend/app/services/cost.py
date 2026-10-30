"""Read-only standard cost calculation with path-specific BOM quantities."""

from __future__ import annotations

import uuid
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal, localcontext
from typing import Any

from sqlalchemy.orm import Session

from app.models import BOM, Item
from app.services.bom import MAX_DEPTH


MAX_NODES = 2000
ITEM_QUERY_BATCH_SIZE = 500
CENT = Decimal("0.01")
ZERO = Decimal("0")


def _money(value: Decimal | None) -> str | None:
    """Keep unknown costs distinct from a registered zero in JSON."""
    return None if value is None else str(value.quantize(CENT, rounding=ROUND_HALF_UP))


def _sum_known(values: list[Decimal | None]) -> Decimal | None:
    """Sum available components without inventing a zero for absent inputs."""
    known = [value for value in values if value is not None]
    return sum(known, ZERO) if known else None


def _decimal(value: str | None) -> Decimal | None:
    """Recover exact node subtotals without a float conversion."""
    return None if value is None else Decimal(value)


def _load_cost_graph(
    db: Session, item_ids: list[uuid.UUID]
) -> tuple[dict[uuid.UUID, Item], dict[uuid.UUID, list[BOM]]]:
    """Batch-load reachable items so path expansion performs no database reads."""
    children: dict[uuid.UUID, list[BOM]] = defaultdict(list)
    for edge in db.query(BOM).all():
        children[edge.parent_item_id].append(edge)

    reachable = set(item_ids)
    frontier = set(item_ids)
    for _ in range(MAX_DEPTH + 1):
        next_frontier = {
            edge.child_item_id
            for parent_id in frontier
            for edge in children.get(parent_id, [])
        } - reachable
        reachable.update(next_frontier)
        frontier = next_frontier
        if not frontier:
            break

    ids = list(reachable)
    items: dict[uuid.UUID, Item] = {}
    for offset in range(0, len(ids), ITEM_QUERY_BATCH_SIZE):
        batch = ids[offset : offset + ITEM_QUERY_BATCH_SIZE]
        rows = db.query(Item).filter(Item.item_id.in_(batch)).all()
        items.update((item.item_id, item) for item in rows)
    for edges in children.values():
        edges.sort(key=lambda edge: (
            items[edge.child_item_id].mes_code if edge.child_item_id in items else "",
            str(edge.child_item_id),
        ))
    return items, children


def get_item_cost(
    db: Session, item_id: uuid.UUID, hourly_rate: Decimal | None
) -> dict[str, Any]:
    """Return known standard-cost components and all causes of incompleteness.

    Each labor step is rounded per item before applying its direct BOM quantity.
    Tree amounts use the cumulative quantity needed for one root item; callers
    must use the root total instead of summing every tree row.
    """
    items, children = _load_cost_graph(db, [item_id])
    root = items.get(item_id)
    if root is None or root.deleted_at is not None:
        raise ValueError("Item not found")
    tree = _calculate_tree(items, children, item_id, hourly_rate)
    return {
        "yield_adjusted_unit_cost": tree["_yield_cost"],
        "yield_cost_difference": tree.pop("_yield_difference"),
        "yield_stages": tree.pop("_yield_stages"),
        "material_cost": tree["material_cost"],
        "labor_cost": tree["labor_cost"],
        "unit_cost": tree["unit_cost"],
        "status": tree["status"],
        "issues": tree["issues"],
        "tree": tree,
    }


def get_item_cost_summaries(
    db: Session, item_ids: list[uuid.UUID], hourly_rate: Decimal | None
) -> list[dict[str, Any]]:
    """Reuse one loaded graph for a catalogue page; omit deleted/missing roots."""
    items, children = _load_cost_graph(db, item_ids)
    summaries = []
    for item_id in dict.fromkeys(item_ids):
        item = items.get(item_id)
        if item is None or item.deleted_at is not None:
            continue
        tree = _calculate_tree(items, children, item_id, hourly_rate)
        summaries.append({key: tree[key] for key in (
            "item_id", "unit_cost", "own_labor_cost", "amount", "status",
        )})
    return summaries


def _calculate_tree(
    items: dict[uuid.UUID, Item],
    edges_by_parent: dict[uuid.UUID, list[BOM]],
    item_id: uuid.UUID,
    hourly_rate: Decimal | None,
) -> dict[str, Any]:
    """Expand a loaded graph per path, retaining shared intermediates and limits."""
    node_count = 0
    yield_stages: list[dict[str, Any]] = []

    def visit(
        current_id: uuid.UUID,
        quantity: int,
        required_quantity: int,
        ancestors: tuple[uuid.UUID, ...],
        edge_unit: str | None,
    ) -> dict[str, Any]:
        """Compute one item unit; only its parent applies the direct quantity."""
        nonlocal node_count
        node_count += 1
        path = ancestors + (current_id,)
        item = items.get(current_id)
        node: dict[str, Any] = {
            "item_id": str(current_id),
            "mes_code": item.mes_code if item else "",
            "item_name": item.item_name if item else "찾을 수 없는 품목",
            "quantity_per_parent": quantity,
            "required_quantity": required_quantity,
            "material_cost": None,
            "own_labor_cost": None,
            "labor_cost": None,
            "unit_cost": None,
            "amount": None,
            "status": "unavailable",
            "issues": [],
            "children": [],
        }

        def add_issue(code: str) -> None:
            """Attach the exact path where missing data or truncation occurred."""
            node["issues"].append({
                "item_id": str(current_id),
                "path": [str(part) for part in path],
                "code": code,
            })

        if item is None or item.deleted_at is not None:
            add_issue("missing_child")
            return node
        if current_id in ancestors:
            add_issue("cycle")
            return node
        if edge_unit is not None and edge_unit != item.unit:
            add_issue("unit_mismatch")
            return node

        edges = edges_by_parent.get(current_id, [])
        is_raw_leaf = item.process_type_code[1:2] == "R" and not edges
        minutes = item.standard_work_minutes
        own_labor = None
        if minutes is not None:
            if minutes == 0:
                own_labor = ZERO
            elif hourly_rate is None:
                add_issue("missing_hourly_rate")
            else:
                own_labor = (minutes * hourly_rate / Decimal(60)).quantize(
                    CENT, rounding=ROUND_HALF_UP
                )
        elif is_raw_leaf:
            own_labor = ZERO
        else:
            add_issue("missing_work_minutes")
        has_basis = minutes is not None and own_labor is not None

        material = None
        if is_raw_leaf:
            material = item.standard_purchase_price
            if material is None:
                add_issue("missing_price")
            else:
                has_basis = True
        elif not edges:
            add_issue("missing_bom")

        if edges and item.bom_completed_at is None:
            add_issue("incomplete_child_bom")
        if edges and len(ancestors) >= MAX_DEPTH:
            add_issue("max_depth_exceeded")
        else:
            for edge in edges:
                if node_count >= MAX_NODES:
                    add_issue("max_nodes_exceeded")
                    break
                direct_quantity = int(edge.quantity)
                child = visit(
                    edge.child_item_id,
                    direct_quantity,
                    required_quantity * direct_quantity,
                    path,
                    edge.unit,
                )
                node["children"].append(child)
                node["issues"].extend(child["issues"])
                has_basis = has_basis or child["unit_cost"] is not None
            if edges:
                material = _sum_known([
                    _decimal(child["material_cost"]) * child["quantity_per_parent"]
                    if child["material_cost"] is not None else None
                    for child in node["children"]
                ])

        labor = _sum_known([own_labor] + [
            _decimal(child["labor_cost"]) * child["quantity_per_parent"]
            if child["labor_cost"] is not None else None
            for child in node["children"]
        ])
        unit_cost = _sum_known([material, labor]) if has_basis else None
        node.update({
            "material_cost": _money(material),
            "own_labor_cost": _money(own_labor),
            "labor_cost": _money(labor),
            "unit_cost": _money(unit_cost),
            "amount": _money(unit_cost * required_quantity) if unit_cost is not None else None,
            "status": "unavailable" if unit_cost is None else (
                "partial" if node["issues"] else "complete"
            ),
        })
        projected = unit_cost if is_raw_leaf else (_sum_known([own_labor] + [
            _decimal(child.get("_yield_cost")) * child["quantity_per_parent"]
            if child.get("_yield_cost") is not None else None for child in node["children"]
        ]) if has_basis else None)
        if item.process_type_code in {"TF", "NF"}:
            rate = item.standard_yield_percent
            before = projected
            if projected is not None:
                projected = (projected * Decimal(100) / (rate if rate is not None else Decimal(100))).quantize(CENT, rounding=ROUND_HALF_UP)
            yield_stages.append({
                "item_id": str(current_id), "path": [str(part) for part in path],
                "item_name": item.item_name, "mes_code": item.mes_code,
                "process_type_code": item.process_type_code,
                "standard_yield_percent": _money(rate), "effective_yield_percent": _money(rate if rate is not None else Decimal(100)),
                "input_unit_cost": _money(before), "output_unit_cost": _money(projected),
            })
        node["_yield_cost"] = _money(projected)
        return node

    quantity_digits = max((
        len(str(abs(int(edge.quantity))))
        for edges in edges_by_parent.values()
        for edge in edges
    ), default=1)
    price_digits = max([1] + [
        item.standard_purchase_price.adjusted() + 1
        for item in items.values()
        if item.standard_purchase_price is not None
    ])
    minute_digits = max([1] + [
        item.standard_work_minutes.adjusted() + 1
        for item in items.values()
        if item.standard_work_minutes is not None
    ])
    rate_digits = max(1, hourly_rate.adjusted() + 1) if hourly_rate is not None else 1
    # A path contributes at most MAX_DEPTH quantity factors. Keep room for
    # all rendered paths, two money decimals, and the division-by-60 rounding.
    precision = (
        quantity_digits * MAX_DEPTH
        + max(price_digits, minute_digits + rate_digits)
        + len(str(MAX_NODES))
        + 8 + MAX_DEPTH * 4
    )
    with localcontext() as context:
        context.prec = max(context.prec, precision)
        result = visit(item_id, 1, 1, (), None)
        result.setdefault("_yield_cost", None)
        result["_yield_difference"] = (
            _money(_decimal(result["_yield_cost"]) - _decimal(result["unit_cost"]))
            if result["_yield_cost"] is not None and result["unit_cost"] is not None else None
        )
        result["_yield_stages"] = yield_stages
        return result
