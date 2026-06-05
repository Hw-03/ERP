---
type: file-explanation
source_path: "backend/app/services/bom.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# bom.py — bom.py 설명

## 이 파일은 무엇을 책임지나

`bom.py`는 `bom` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `build_bom_cache`
- `explode_bom`
- `_explode_with_cache`
- `merge_requirements`
- `direct_children`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/routers/bom.py]] — `bom.py`는 `bom` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

서비스는 DB 변경을 포함할 수 있습니다. 같은 도메인의 라우터, 모델, 테스트를 함께 확인해야 합니다.

## 핵심 발췌

```python
"""BOM expansion utilities shared by production and queue services."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import BOM


MAX_DEPTH = 10

# parent_item_id -> List[(child_item_id, per-unit quantity)]
BomCache = Dict[uuid.UUID, List[Tuple[uuid.UUID, Decimal]]]


def build_bom_cache(db: Session) -> BomCache:
    """모든 BOM 행을 한 번에 읽어 parent → children 매핑을 반환.

    여러 품목을 연속으로 explode 해야 하는 호출자(/capacity 등)는
    이 캐시를 한 번만 만들고 explode_bom 의 cache 인자로 재사용한다.
    """
    cache: BomCache = {}
    for row in db.query(BOM).all():
        cache.setdefault(row.parent_item_id, []).append((row.child_item_id, row.quantity))
    return cache


def explode_bom(
    db: Session,
    parent_item_id: uuid.UUID,
    qty_to_produce: Decimal,
    depth: int = 0,
    visited: frozenset = frozenset(),
    *,
    cache: Optional[BomCache] = None,
) -> List[Tuple[uuid.UUID, Decimal]]:
    """Expand a BOM recursively into flat leaf component requirements.

    - cache 가 주어지면 추가 쿼리 없이 메모리에서 전개 (배치 호출 최적).
    - 없으면 진입 시 1회만 BOM 전체를 읽어 캐시로 사용 (재귀 내 N+1 제거).
    """
    if cache is None:
        cache = build_bom_cache(db)
    return _explode_with_cache(parent_item_id, qty_to_produce, depth, visited, cache)


def _explode_with_cache(
    parent_item_id: uuid.UUID,
    qty_to_produce: Decimal,
    depth: int,
    visited: frozenset,
```
