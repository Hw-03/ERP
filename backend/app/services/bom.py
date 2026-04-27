"""BOM expansion utilities shared by production and queue services."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import BOM


MAX_DEPTH = 10

# parent_item_id -> List[(child_item_id, per-unit quantity)]
BomCache = Dict[uuid.UUID, List[Tuple[uuid.UUID, Decimal]]]


def build_bom_cache(db: Session) -> BomCache:
    """모든 BOM 행을 한 번에 읽어 parent → children 매핑을 반환.

    여러 품목을 연속으로 explode 해야 하는 호출자(/capacity 등)는
    이 캐시를 한 번만 만들고 explode_bom 의 cache 인자로 재사용한다.
    """
    cache: BomCache = {}
    for row in db.query(BOM).all():
        cache.setdefault(row.parent_item_id, []).append((row.child_item_id, row.quantity))
    return cache


def explode_bom(
    db: Session,
    parent_item_id: uuid.UUID,
    qty_to_produce: Decimal,
    depth: int = 0,
    visited: frozenset = frozenset(),
    *,
    cache: Optional[BomCache] = None,
) -> List[Tuple[uuid.UUID, Decimal]]:
    """Expand a BOM recursively into flat leaf component requirements.

    - cache 가 주어지면 추가 쿼리 없이 메모리에서 전개 (배치 호출 최적).
    - 없으면 진입 시 1회만 BOM 전체를 읽어 캐시로 사용 (재귀 내 N+1 제거).
    """
    if cache is None:
        cache = build_bom_cache(db)
    return _explode_with_cache(parent_item_id, qty_to_produce, depth, visited, cache)


def _explode_with_cache(
    parent_item_id: uuid.UUID,
    qty_to_produce: Decimal,
    depth: int,
    visited: frozenset,
    cache: BomCache,
) -> List[Tuple[uuid.UUID, Decimal]]:
    if depth > MAX_DEPTH or parent_item_id in visited:
        return []

    visited = visited | {parent_item_id}
    result: List[Tuple[uuid.UUID, Decimal]] = []

    for child_id, per_unit_qty in cache.get(parent_item_id, []):
        required_qty = per_unit_qty * qty_to_produce
        if child_id in cache:
            # child 가 자체 BOM 을 가지면 leaf 까지 더 내려간다
            result.extend(_explode_with_cache(child_id, required_qty, depth + 1, visited, cache))
        else:
            result.append((child_id, required_qty))

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
