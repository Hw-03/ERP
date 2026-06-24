"""Item 조회 repository — 산재한 db.query(Item).filter(Item.item_id == X).first() 통합.

순수 단건 조회만 담당한다. 404/ValueError 변환·트랜잭션은 호출자 책임.
잠금·생성이 필요한 경로(inventory.get_or_create_inventory 등)는 기존 전용 헬퍼를 그대로 쓴다.
soft-delete 무시(.first() 기존 동작 보존) — 삭제 필터가 필요한 호출부는 통합 대상이 아니다.
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Item


def get(db: Session, item_id: uuid.UUID) -> Optional[Item]:
    return db.query(Item).filter(Item.item_id == item_id).first()
