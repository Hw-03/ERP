---
type: file-explanation
source_path: "backend/seed_bom_complete.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# seed_bom_complete.py — seed_bom_complete.py 설명

## 이 파일은 무엇을 책임지나

`seed_bom_complete.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/seed_bom_complete.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `symbols_overlap`
- `load_existing`
- `add_bom`
- `main`

## 연결되는 파일

- [[ERP/backend/📁_backend]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""BOM 완성 스크립트.

기존 BOM(130개)은 유지하고, ?F 타입(AF, TF) 품목을 대응하는
상위 어셈블리에 연결하여 제품별 BOM 트리를 완성한다.

연결 규칙:
  AA → AF  (조립 반제품 → 조립 고정형)
  TA → TF  (튜브 반제품 → 튜브 고정형)
  AA → HA, VA, TA  (이미 seed_bom.py에서 일부 생성됨, 보완)

model_symbol 중복 여부로 같은 제품군인지 판별한다.
예) AA model_symbol="346", AF model_symbol="34" → 공통 기호 "3","4" 있으므로 연결.
"""

import os
import sys
import uuid
from decimal import Decimal

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models import BOM, Item


R_TYPE_CODES = ["TR", "HR", "VR", "NR", "AR", "PR"]  # 원자재 R 시리즈 6종


def symbols_overlap(s1: str | None, s2: str | None) -> bool:
    if not s1 or not s2:
        return False
    return bool(set(s1) & set(s2))


def load_existing(db) -> set:
    rows = db.query(BOM.parent_item_id, BOM.child_item_id).all()
    return {(str(p), str(c)) for p, c in rows}


def add_bom(db, existing: set, parent: Item, child: Item, qty: int) -> bool:
    if parent.item_id == child.item_id:
        return False
    key = (str(parent.item_id), str(child.item_id))
    if key in existing:
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
```
