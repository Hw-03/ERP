---
type: file-explanation
source_path: "backend/app/routers/bom.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# bom.py — bom.py 설명

## 이 파일은 무엇을 책임지나

`bom.py`는 `bom` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `get_all_bom`
- `create_bom`
- `update_bom`
- `get_bom_flat`
- `get_bom_tree`
- `delete_bom`
- `get_where_used`
- `_collect_descendants`
- `_build_tree_cached`
- `_is_circular`
- 그 외 7개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/services/bom.py]] — `bom.py`는 `bom` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.
- [[ERP/backend/app/schemas/📁_schemas]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
"""BOM router for Bill of Materials CRUD and tree queries."""

import uuid
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import BOM, Inventory, Item
from app.routers._errors import ErrorCode, http_error
from app.schemas import BOMCreate, BOMDetailResponse, BOMResponse, BOMTreeNode, BOMUpdate
from app.services import audit
from app.services._tx import commit_and_refresh, commit_only
from app.services.bom import BomCache, build_bom_cache

router = APIRouter()


@router.get("", response_model=List[BOMDetailResponse])
def get_all_bom(db: Session = Depends(get_db)):
    """Return all BOM relationships with parent and child item names."""
    entries = db.query(BOM).all()
    if not entries:
        return []

    needed_ids = {e.parent_item_id for e in entries} | {e.child_item_id for e in entries}
    items_map = {
        i.item_id: i
        for i in db.query(Item).filter(Item.item_id.in_(list(needed_ids))).all()
    }

    result = []
    for entry in entries:
        parent = items_map.get(entry.parent_item_id)
        child = items_map.get(entry.child_item_id)
        if not parent or not child:
            continue
        result.append(BOMDetailResponse(
            bom_id=entry.bom_id,
            parent_item_id=entry.parent_item_id,
            parent_item_name=parent.item_name,
            parent_item_code=parent.item_code,
            child_item_id=entry.child_item_id,
            child_item_name=child.item_name,
            child_item_code=child.item_code,
            quantity=entry.quantity,
            unit=entry.unit,
        ))
    return result


@router.post("", response_model=BOMResponse, status_code=status.HTTP_201_CREATED)
def create_bom(payload: BOMCreate, request: Request, db: Session = Depends(get_db)):
```
