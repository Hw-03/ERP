---
type: file-explanation
source_path: "backend/assign_models.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# assign_models.py — assign_models.py 설명

## 이 파일은 무엇을 책임지나

`assign_models.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/assign_models.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/backend/📁_backend]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

큰 위험은 낮지만, 연결된 파일과 실행 위치를 확인한 뒤 수정하는 편이 안전합니다.

## 핵심 발췌

```python
"""[DEPRECATED] legacy_model 기반 모델 할당 스크립트 — legacy_model 컬럼 제거로 폐기.

모델 연결은 품목 코드 파싱(parse_item_code → model_slots) 또는
관리자 UI(AdminItemsSection)에서 직접 model_slots 수정으로 관리.
"""
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
```
