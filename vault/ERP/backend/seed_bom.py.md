---
type: code-note
project: ERP
layer: backend
source_path: erp/backend/seed_bom.py
status: active
updated: 2026-04-27
source_sha: 5e07b2436d54
tags:
  - erp
  - backend
  - source-file
  - py
---

# seed_bom.py

> [!summary] 역할
> 원본 프로젝트의 `seed_bom.py` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `backend/seed_bom.py`
- Layer: `backend`
- Kind: `source-file`
- Size: `2646` bytes

## 연결

- Parent hub: [[backend/backend|backend]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````python
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
# ... (이하 43줄 생략. 원본 참조)

````
