---
type: code-note
project: ERP
layer: backend
source_path: backend/assign_models.py
status: active
updated: 2026-04-27
source_sha: dc5309f9199c
tags:
  - erp
  - backend
  - source-file
  - py
---

# assign_models.py

> [!summary] 역할
> 원본 프로젝트의 `assign_models.py` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `backend/assign_models.py`
- Layer: `backend`
- Kind: `source-file`
- Size: `1570` bytes

## 연결

- Parent hub: [[backend/backend|backend]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````python
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
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
