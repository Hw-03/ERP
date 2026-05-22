---
type: file-explanation
source_path: "backend/seed_bom.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# seed_bom.py — seed_bom.py 설명

## 이 파일은 무엇을 책임지나

`seed_bom.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/seed_bom.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `add_bom`
- `main`

## 연결되는 파일

- [[ERP/backend/📁_backend]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""BOM 계층적 생성 스크립트.
구조:
  Level 1: AA 품목 상위 10개 → TA/HA/VA/RM 자식 10개씩
  Level 2: TA/HA/VA 중 6개 → RM 자식 5개씩
"""
import sys
import os
import random
import uuid
from decimal import Decimal

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models import Item, BOM

random.seed(42)

R_TYPE_CODES = ["TR", "HR", "VR", "NR", "AR", "PR"]  # 원자재 R 시리즈 6종


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
        ba_items = db.query(Item).filter(Item.process_type_code == "AA").all()
        ta_items = db.query(Item).filter(Item.process_type_code == "TA").all()
        ha_items = db.query(Item).filter(Item.process_type_code == "HA").all()
        va_items = db.query(Item).filter(Item.process_type_code == "VA").all()
        rm_items = db.query(Item).filter(Item.process_type_code.in_(R_TYPE_CODES)).all()

        if not ba_items:
            print("AA 공정코드 품목이 없습니다.")
            return

        existing: set = set()
        created = 0

        # Level 1: AA 상위 10개를 부모로, TA/HA/VA/RM 섞어서 각 10개씩
        l1_parents = ba_items[:10]
        child_pool = ta_items + ha_items + va_items + rm_items
```
