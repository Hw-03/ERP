"""품목코드 기반 공통 표시 순서."""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import case
from sqlalchemy.orm import Session

from app.models import Item


PROCESS_CODE_ORDER: tuple[str, ...] = (
    "TR", "TA", "TF",
    "HR", "HA", "HF",
    "VR", "VA", "VF",
    "NR", "NA", "NF",
    "AR", "AA", "AF",
    "PR", "PA", "PF",
)
_PROCESS_CODE_RANK = {code: rank for rank, code in enumerate(PROCESS_CODE_ORDER)}
_UNKNOWN_PROCESS_CODE_RANK = len(PROCESS_CODE_ORDER)


def _process_rank(process_type_code: str | None) -> int:
    """Return the fixed display rank, placing future unknown codes last."""
    return _PROCESS_CODE_RANK.get(process_type_code, _UNKNOWN_PROCESS_CODE_RANK)


def _active_items_in_current_order(db: Session, *, exclude_item_id: object | None = None) -> list[Item]:
    """Return active items in saved display order with a deterministic null fallback."""
    query = db.query(Item).filter(Item.deleted_at.is_(None))
    if exclude_item_id is not None:
        query = query.filter(Item.item_id != exclude_item_id)
    return query.order_by(
        case((Item.sort_order.is_(None), 1), else_=0),
        Item.sort_order,
        Item.mes_code,
    ).all()


def _assign_contiguous_order(items: list[Item]) -> None:
    """Persist one contiguous display sequence without changing item membership."""
    for sort_order, item in enumerate(items):
        item.sort_order = sort_order


def default_item_display_order(items: Iterable[Item]) -> list[Item]:
    """Return active items in the baseline process-code and serial-number order."""
    return sorted(
        items,
        key=lambda item: (_process_rank(item.process_type_code), item.serial_no, item.mes_code or ""),
    )


def apply_default_item_display_order(db: Session) -> list[Item]:
    """Reset active items to process-code rank then serial-number order."""
    items = _active_items_in_current_order(db)
    items = default_item_display_order(items)
    _assign_contiguous_order(items)
    return items


def insert_item_at_process_end(db: Session, item: Item) -> list[Item]:
    """Insert a new item after its process-code group while retaining custom order."""
    existing = _active_items_in_current_order(db, exclude_item_id=item.item_id)
    matching_indexes = [
        index for index, existing_item in enumerate(existing)
        if existing_item.process_type_code == item.process_type_code
    ]
    if matching_indexes:
        insert_at = matching_indexes[-1] + 1
    else:
        item_rank = _process_rank(item.process_type_code)
        insert_at = next(
            (
                index
                for index, existing_item in enumerate(existing)
                if _process_rank(existing_item.process_type_code) > item_rank
            ),
            len(existing),
        )

    ordered = [*existing[:insert_at], item, *existing[insert_at:]]
    _assign_contiguous_order(ordered)
    return ordered
