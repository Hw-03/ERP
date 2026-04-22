"""BOM 계층적 생성 스크립트.
구조:
  Level 1: BA 품목 상위 10개 → TA/HA/VA/RM 자식 10개씩
  Level 2: TA/HA/VA 중 6개 → RM 자식 5개씩
"""
import sys
import os
import random
import uuid
from decimal import Decimal

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models import Item, BOM, CategoryEnum

random.seed(42)


def add_bom(db, existing: set, parent: Item, child: Item, qty: int) -> bool:
    key = (str(parent.item_id), str(child.item_id))
    if key in existing or parent.item_id == child.item_id:
        return False
    db.add(BOM(
        bom_id=uuid.uuid4(),
        parent_item_id=parent.item_id,
        child_item_id=child.item_id,
        quantity=Decimal(str(qty)),
        unit="EA",
    ))
    existing.add(key)
    return True


def main() -> None:
    db = SessionLocal()
    try:
        ba_items = db.query(Item).filter(Item.category == CategoryEnum.BA).all()
        ta_items = db.query(Item).filter(Item.category == CategoryEnum.TA).all()
        ha_items = db.query(Item).filter(Item.category == CategoryEnum.HA).all()
        va_items = db.query(Item).filter(Item.category == CategoryEnum.VA).all()
        rm_items = db.query(Item).filter(Item.category == CategoryEnum.RM).all()

        if not ba_items:
            print("BA 카테고리 품목이 없습니다.")
            return

        existing: set = set()
        created = 0

        # Level 1: BA 상위 10개를 부모로, TA/HA/VA/RM 섞어서 각 10개씩
        l1_parents = ba_items[:10]
        child_pool = ta_items + ha_items + va_items + rm_items

        for parent in l1_parents:
            candidates = [c for c in child_pool if c.item_id != parent.item_id]
            targets = random.sample(candidates, min(10, len(candidates)))
            for child in targets:
                if add_bom(db, existing, parent, child, random.randint(1, 8)):
                    created += 1

        # Level 2: TA/HA/VA 각 2개씩(총 6개)를 부모로, RM 자식 5개씩
        l2_pool = ta_items[:2] + ha_items[:2] + va_items[:2]
        for parent in l2_pool:
            targets = random.sample(rm_items, min(5, len(rm_items)))
            for child in targets:
                if add_bom(db, existing, parent, child, random.randint(1, 5)):
                    created += 1

        db.commit()
        print(f"BOM {created}개 생성 완료.")
        print(f"  Level1 부모 (BA): {[p.item_name for p in l1_parents]}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
