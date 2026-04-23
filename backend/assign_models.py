"""일회성 스크립트: 미배정 품목에 ProductSymbol slot 연결."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models import Item, ItemModel

db = SessionLocal()

SLOT_KEYWORDS = [
    (1, ["DX3000"]),
    (2, ["COCOON"]),
    (3, ["SOLO"]),
    (4, ["ADX4000W"]),
    (5, ["ADX6000FB", "ADX6000S"]),
]
ALL_SLOTS = [1, 2, 3, 4, 5]

existing = set(
    (str(r.item_id), r.slot)
    for r in db.query(ItemModel.item_id, ItemModel.slot).all()
)

items = db.query(Item).all()
added = 0
skipped = 0

for item in items:
    lm = (item.legacy_model or "").strip()

    matched_slots = []
    for slot, keywords in SLOT_KEYWORDS:
        if any(kw in lm for kw in keywords):
            matched_slots.append(slot)

    # 매칭 없거나 "공용" 포함 → 전체 슬롯
    if not matched_slots or "공용" in lm:
        matched_slots = ALL_SLOTS

    for slot in matched_slots:
        key = (str(item.item_id), slot)
        if key in existing:
            skipped += 1
            continue
        db.add(ItemModel(item_id=item.item_id, slot=slot))
        existing.add(key)
        added += 1

db.commit()

# 검증
unlinked = (
    db.query(Item)
    .filter(~Item.item_id.in_(db.query(ItemModel.item_id).distinct()))
    .count()
)
total = db.query(Item).count()

print(f"추가된 연결: {added}개")
print(f"이미 존재(스킵): {skipped}개")
print(f"전체 품목: {total}개 / 미연결: {unlinked}개")

db.close()
