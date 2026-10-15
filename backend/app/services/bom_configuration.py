"""Validation and comparison for one complete BOM composition."""

from __future__ import annotations

from decimal import Decimal
from typing import Protocol, Sequence
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import BOM, Item
from app.schemas.item import BOMResponse


class CompositionLine(Protocol):
    child_item_id: UUID
    quantity: int | Decimal
    unit: str
    notes: str | None


def configuration_errors(
    db: Session, parent_id: UUID, rows: Sequence[CompositionLine], *, require_rows: bool = False,
) -> list[str]:
    """Validate all submitted rows against the graph they would create, without writes."""
    if require_rows and not rows:
        return ["구성품이 없는 BOM은 완료할 수 없습니다."]
    children = {item.item_id: item for item in db.query(Item).filter(
        Item.item_id.in_([row.child_item_id for row in rows]),
    )}
    graph: dict[UUID, list[UUID]] = {}
    for parent, child in db.query(BOM.parent_item_id, BOM.child_item_id).all():
        if parent != parent_id:
            graph.setdefault(parent, []).append(child)
    graph[parent_id] = [row.child_item_id for row in rows]
    errors: list[str] = []
    seen: set[UUID] = set()
    for row in rows:
        child = children.get(row.child_item_id)
        label = child.item_name if child else str(row.child_item_id)
        if row.child_item_id == parent_id:
            errors.append(f"{label}: 자기 참조는 허용하지 않습니다.")
        if row.child_item_id in seen:
            errors.append(f"{label}: 구성품이 중복되었습니다.")
        seen.add(row.child_item_id)
        if row.quantity <= 0 or row.quantity % 1 != 0:
            errors.append(f"{label}: 수량은 양의 정수여야 합니다.")
        if child is None or child.deleted_at is not None:
            errors.append(f"{label}: 삭제되었거나 존재하지 않는 구성품입니다.")
        pending = [(row.child_item_id, frozenset({parent_id}))]
        visited: set[UUID] = set()
        while pending:
            current, ancestors = pending.pop()
            if current in ancestors:
                errors.append(f"{label}: 순환 참조가 있습니다.")
                break
            if current in visited:
                continue
            visited.add(current)
            pending.extend((child_id, ancestors | {current}) for child_id in graph.get(current, []))
    return errors


def composition_snapshot(rows: Sequence[BOM | BOMResponse]) -> list[dict]:
    """Use stable identities and values for optimistic comparison and version audit."""
    return sorted([
        {"bom_id": str(row.bom_id), "child_item_id": str(row.child_item_id),
         "quantity": int(row.quantity), "unit": row.unit, "notes": row.notes}
        for row in rows
    ], key=lambda row: row["bom_id"])
