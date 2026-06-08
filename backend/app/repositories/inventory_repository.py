"""Inventory 조회 repository — 산재한 db.query(Inventory).filter(Inventory.item_id == X).first() 통합.

순수 단건 조회만 담당한다. 트랜잭션·잠금은 호출자 책임.
잠금/생성이 필요한 경로(get_or_create_inventory, _lock_inventory)는 inv_base 전용 헬퍼를 그대로 쓴다.
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Inventory


def get(db: Session, item_id: uuid.UUID) -> Optional[Inventory]:
    return db.query(Inventory).filter(Inventory.item_id == item_id).first()
