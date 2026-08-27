"""Item 활성 명령 조회와 삭제 포함 이력 조회의 명시적 경계."""
from __future__ import annotations

import uuid
from collections.abc import Iterable
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Item


def get_active(
    db: Session,
    item_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> Optional[Item]:
    """새 command/preview에 사용할 활성 품목만 반환한다."""
    query = db.query(Item).filter(
        Item.item_id == item_id,
        Item.deleted_at.is_(None),
    )
    if for_update:
        query = query.with_for_update()
    return query.first()


def get_including_deleted(
    db: Session,
    item_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> Optional[Item]:
    """이력·감사·복구와 삭제 선점에 사용할 품목을 반환한다."""
    query = db.query(Item).filter(Item.item_id == item_id)
    if for_update:
        query = query.with_for_update()
    return query.first()


def lock_active_many(
    db: Session,
    item_ids: Iterable[uuid.UUID],
) -> dict[uuid.UUID, Item]:
    """새 참조를 쓰기 전에 활성 품목 행을 UUID 순서로 잠근다."""
    ordered_ids = sorted(set(item_ids), key=str)
    if not ordered_ids:
        return {}
    rows = (
        db.query(Item)
        .filter(
            Item.item_id.in_(ordered_ids),
            Item.deleted_at.is_(None),
        )
        .order_by(Item.item_id.asc())
        .with_for_update()
        .all()
    )
    return {row.item_id: row for row in rows}
