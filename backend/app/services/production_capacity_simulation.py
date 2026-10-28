"""Request-local BOM exclusions; persisted BOM and normal capacity stay unchanged."""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Item
from app.services import stock_math
from app.services.bom import BomCache, build_bom_cache
from app.services.production_capacity import (
    _BUILDABLE_MAX_DEPTH, _fast_packaging_requirements, _fast_production_variant,
    _max_buildable, _own_available, _ship_ready, build_af_capacity_bom_cache,
    compute_additional_producible_capacity,
)


class SimulationItemNotFound(ValueError):
    """The selected item does not exist."""


def _reachable(root_id: uuid.UUID, bom_cache: BomCache) -> set[uuid.UUID]:
    """Collect raw descendants once, including shared nodes and cycles."""
    reached: set[uuid.UUID] = set()
    pending = [root_id]
    while pending:
        node = pending.pop()
        if node in reached:
            continue
        reached.add(node)
        pending.extend(child for child, _ in bom_cache.get(node, []))
    return reached


def _total_preview_bom(baseline: BomCache, excluded: set[uuid.UUID]) -> tuple[BomCache, set[uuid.UUID]]:
    """Propagate only user-removed constraints; original leaves remain stock-limited."""
    free = set(excluded)
    while True:
        newly_free = {parent for parent, children in baseline.items()
                      if children and parent not in free and all(child in free for child, _ in children)}
        if not newly_free:
            break
        free.update(newly_free)
    return {parent: [(child, qty) for child, qty in children if child not in free]
            for parent, children in baseline.items()}, free


def _fast_preview(
    pf_id: uuid.UUID, af_id: uuid.UUID | None, *, baseline: BomCache,
    excluded: set[uuid.UUID], figures: dict, items_map: dict[uuid.UUID, Item],
) -> tuple[int | None, uuid.UUID | None]:
    """Stop at AF stock, removing only explicitly excluded packaging requirements."""
    if af_id is None:
        return 0, None
    if not excluded:
        return _fast_production_variant(pf_id, af_id, bom_cache=baseline, fig_by_id=figures, items_map=items_map)
    req: dict[uuid.UUID, Decimal] = {}
    unresolved: uuid.UUID | None = None

    def visit(node: uuid.UUID, mult: Decimal, visiting: frozenset[uuid.UUID], depth: int) -> None:
        nonlocal unresolved
        if node in excluded:
            return
        if depth > _BUILDABLE_MAX_DEPTH or node in visiting:
            unresolved = unresolved or node
            return
        item = items_map.get(node)
        if item is not None and item.process_type_code == "PA":
            children = baseline.get(node, [])
            if not children:
                unresolved = unresolved or node
            for child, qty in children:
                visit(child, mult * qty, visiting | {node}, depth + 1)
        else:
            req[node] = req.get(node, Decimal("0")) + mult

    for child, qty in baseline.get(pf_id, []):
        visit(child, qty, frozenset({pf_id}), 1)
    if unresolved:
        return 0, unresolved
    original_req, _ = _fast_packaging_requirements(pf_id, bom_cache=baseline, items_map=items_map)
    if af_id not in original_req and af_id not in excluded:
        return 0, None
    limits = [(int(Decimal(_own_available(node, figures)) / qty), node)
              for node, qty in sorted(req.items(), key=lambda entry: entry[0] != af_id) if qty > 0]
    return min(limits, key=lambda entry: entry[0]) if limits else (None, None)


def simulate_capacity(db: Session, pf_id: uuid.UUID, excluded_ids: list[uuid.UUID]) -> dict:
    """Calculate one PF in a read snapshot without writes or shared-cache mutation."""
    raw_bom = build_bom_cache(db)
    reachable = _reachable(pf_id, raw_bom)
    items = db.query(Item).filter(Item.item_id.in_(reachable), Item.deleted_at.is_(None)).all()
    items_map = {item.item_id: item for item in items}
    pf = items_map.get(pf_id)
    if pf is None:
        raise SimulationItemNotFound("출하 완제품을 찾을 수 없습니다.")
    if pf.process_type_code != "PF":
        raise ValueError("출하 완제품만 시뮬레이션할 수 있습니다.")
    excluded = set(excluded_ids)
    protected = {pf_id} | {child for child, _ in raw_bom.get(pf_id, [])}
    if excluded & protected or not excluded <= reachable:
        raise ValueError("최상위 품목 또는 현재 BOM에 없는 품목은 제외할 수 없습니다.")
    figures = stock_math.bulk_compute(db, reachable)
    baseline = build_af_capacity_bom_cache(raw_bom, items_map)
    baseline_reachable = _reachable(pf_id, baseline)
    afs = sorted((item for item in items if item.process_type_code == "AF" and item.item_id in baseline_reachable),
                 key=lambda item: (item.model_symbol or "", item.mes_code or "", item.item_name or ""))
    fast, fast_btl = _fast_preview(pf_id, afs[0].item_id if afs else None, baseline=baseline,
                         excluded=excluded, figures=figures, items_map=items_map)
    preview_bom, free = _total_preview_bom(baseline, excluded)
    total, total_btl = (None, None) if pf_id in free else _max_buildable(pf_id, bom_cache=preview_bom, fig_by_id=figures)
    return {"pf_item_id": str(pf_id), "ship_ready": _ship_ready(pf_id, figures),
            "fast_production": fast, "fast_production_status": "no_constraints" if fast is None else "finite",
            "total_production": total, "total_production_status": "no_constraints" if total is None else "finite",
            "fast_production_limiting_item_id": str(fast_btl) if fast_btl else None,
            "total_production_limiting_item_id": str(total_btl) if total_btl else None}


def simulate_bom_capacity(db: Session, item_id: uuid.UUID, excluded_ids: list[uuid.UUID]) -> dict:
    """Preview any BOM root without spending its existing stock or changing persisted data."""
    raw_bom = build_bom_cache(db)
    reachable = _reachable(item_id, raw_bom)
    items = db.query(Item).filter(Item.item_id.in_(reachable), Item.deleted_at.is_(None)).all()
    items_map = {item.item_id: item for item in items}
    if item_id not in items_map:
        raise SimulationItemNotFound("품목을 찾을 수 없습니다.")
    excluded = set(excluded_ids)
    if item_id in excluded or not excluded <= reachable:
        raise ValueError("상위 품목 또는 현재 BOM에 없는 품목은 제외할 수 없습니다.")
    baseline = build_af_capacity_bom_cache(raw_bom, items_map)
    figures = stock_math.bulk_compute(db, reachable)
    return compute_bom_capacity_values(
        item_id, baseline=baseline, excluded=excluded, figures=figures, items_map=items_map,
    )


def compute_bom_capacity_values(
    item_id: uuid.UUID, *, baseline: BomCache, excluded: set[uuid.UUID],
    figures: dict, items_map: dict[uuid.UUID, Item],
) -> dict:
    """Give any selected root its own stock, direct-stock fast units and recursive total."""
    quantity = None
    bottleneck = None
    total = None
    fast = None
    fast_bottleneck = None
    status = "unavailable"
    fast_status = "unavailable"
    if baseline.get(item_id):
        preview_bom, free = _total_preview_bom(baseline, excluded)
        if item_id in free:
            status = "no_constraints"
        else:
            quantity, bottleneck = compute_additional_producible_capacity(
                item_id, bom_cache=preview_bom, fig_by_id=figures,
            )
            total = quantity + _own_available(item_id, figures)
            status = "finite"
        if items_map[item_id].process_type_code == "PF":
            reachable = _reachable(item_id, baseline)
            afs = sorted((item for item in items_map.values()
                          if item.process_type_code == "AF" and item.item_id in reachable),
                         key=lambda item: (item.model_symbol or "", item.mes_code or "", item.item_name or ""))
            fast, fast_bottleneck = _fast_preview(
                item_id, afs[0].item_id if afs else None, baseline=baseline,
                excluded=excluded, figures=figures, items_map=items_map,
            )
        else:
            requirements: dict[uuid.UUID, Decimal] = {}
            for child_id, per_unit in baseline[item_id]:
                if child_id not in excluded:
                    requirements[child_id] = requirements.get(child_id, Decimal("0")) + per_unit
            limits = [(int(Decimal(_own_available(child_id, figures)) / per_unit), child_id)
                      for child_id, per_unit in requirements.items() if per_unit > 0]
            fast, fast_bottleneck = min(limits, key=lambda entry: entry[0]) if limits else (None, None)
        fast_status = "no_constraints" if fast is None else "finite"
    return {
        "item_id": str(item_id),
        "ship_ready": _ship_ready(item_id, figures),
        "fast_production": fast,
        "fast_production_status": fast_status,
        "fast_production_limiting_item_id": str(fast_bottleneck) if fast_bottleneck else None,
        "total_production": total,
        "total_production_status": status,
        "total_production_limiting_item_id": str(bottleneck) if bottleneck else None,
        "additional_producible_quantity": quantity,
        "additional_producible_status": status,
        "additional_producible_limiting_item_id": str(bottleneck) if bottleneck else None,
    }
