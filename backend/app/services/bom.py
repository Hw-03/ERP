"""BOM expansion utilities shared by production and queue services."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Dict, List, Tuple

from sqlalchemy.orm import Session

from app.models import BOM


MAX_DEPTH = 10


def explode_bom(
    db: Session,
    parent_item_id: uuid.UUID,
    qty_to_produce: Decimal,
    depth: int = 0,
    visited: frozenset = frozenset(),
) -> List[Tuple[uuid.UUID, Decimal]]:
    """Expand a BOM recursively into flat leaf component requirements.

    Returns list of (component_item_id, required_qty) tuples. Items that
    themselves have a BOM are expanded further; leaves are returned as-is.
    """
    if depth > MAX_DEPTH or parent_item_id in visited:
        return []

    visited = visited | {parent_item_id}
    bom_entries = db.query(BOM).filter(BOM.parent_item_id == parent_item_id).all()
    result: List[Tuple[uuid.UUID, Decimal]] = []

    for entry in bom_entries:
        required_qty = entry.quantity * qty_to_produce
        child_has_bom = (
            db.query(BOM).filter(BOM.parent_item_id == entry.child_item_id).first() is not None
        )
        if child_has_bom:
            result.extend(explode_bom(db, entry.child_item_id, required_qty, depth + 1, visited))
        else:
            result.append((entry.child_item_id, required_qty))

    return result


def merge_requirements(
    pairs: List[Tuple[uuid.UUID, Decimal]],
) -> Dict[uuid.UUID, Decimal]:
    """Aggregate requirements from explode_bom into {item_id: total_qty}."""
    merged: Dict[uuid.UUID, Decimal] = {}
    for item_id, qty in pairs:
        merged[item_id] = merged.get(item_id, Decimal("0")) + qty
    return merged


def direct_children(db: Session, parent_item_id: uuid.UUID) -> List[Tuple[uuid.UUID, Decimal]]:
    """Return only the first level of BOM children (for disassembly/return
    where we want to present the immediate components rather than leaves)."""
    return [
        (entry.child_item_id, entry.quantity)
        for entry in db.query(BOM).filter(BOM.parent_item_id == parent_item_id).all()
    ]
