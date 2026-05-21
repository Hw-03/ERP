---
type: code-note
project: ERP
layer: backend
source_path: erp/backend/seed_bom_complete.py
status: active
updated: 2026-04-27
source_sha: e5f9a61c661a
tags:
  - erp
  - backend
  - source-file
  - py
---

# seed_bom_complete.py

> [!summary] 역할
> 원본 프로젝트의 `seed_bom_complete.py` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `backend/seed_bom_complete.py`
- Layer: `backend`
- Kind: `source-file`
- Size: `6169` bytes

## 연결

- Parent hub: [[backend/backend|backend]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````python
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
from app.models import BOM, CategoryEnum, Item


def symbols_overlap(s1: str | None, s2: str | None) -> bool:
    if not s1 or not s2:
        return False
    return bool(set(s1) & set(s2))


def load_existing(db) -> set:
    rows = db.query(BOM.parent_item_id, BOM.child_item_id).all()
    return {(str(p), str(c)) for p, c in rows}

# ... (이하 126줄 생략. 원본 참조)

````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
