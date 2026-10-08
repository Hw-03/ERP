"""Validate live items at new-work boundaries; history and reversal bypass this guard."""
from collections.abc import Iterable
import uuid

from sqlalchemy.orm import Session

from app.models import Item


def validate_active_items(
    db: Session, item_ids: Iterable[uuid.UUID], *, raw_receive: bool = False,
) -> dict[uuid.UUID, Item]:
    """Reject a whole batch before mutation, using the canonical process code only."""
    ids = sorted(set(item_ids), key=str)
    if not ids:
        return {}
    with db.no_autoflush:
        items = {item.item_id: item for item in db.query(Item).filter(Item.item_id.in_(ids)).all()}
    for item_id in ids:
        item = items.get(item_id)
        if item is None:
            raise ValueError(f"품목을 찾을 수 없습니다: {item_id}")
        if item.deleted_at is not None:
            raise ValueError(f"삭제된 품목은 새 재고 작업에 사용할 수 없습니다: {item.item_name}")
        if raw_receive and not (item.process_type_code or "").endswith("R"):
            raise ValueError(f"원자재 입고는 공정코드가 R로 끝나는 품목만 가능합니다: {item.item_name}")
    return items


def validate_io_items(db: Session, bundles: Iterable, *, sub_type: str) -> None:
    """Check selected parents and effective inventory children before saving/executing."""
    item_ids = set()
    for bundle in bundles:
        source_id = getattr(bundle, "source_item_id", None)
        if source_id is not None:
            item_ids.add(source_id)
        item_ids.update(line.item_id for line in bundle.lines
                        if line.included and not getattr(line, "bom_stock_exempt", False))
    validate_active_items(db, item_ids, raw_receive=sub_type == "receive_supplier")
    if sub_type in {"tube_receive_supplier", "tube_outbound_supplier"}:
        for item_id in item_ids:
            if db.get(Item, item_id).process_type_code != "TR":
                raise ValueError("튜브 원자재 입출고는 TR 품목만 처리할 수 있습니다.")
