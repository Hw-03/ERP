---
type: file-explanation
source_path: "backend/app/routers/inventory/query.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# query.py — query.py 설명

## 이 파일은 무엇을 책임지나

`query.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `get_inventory_summary`
- `get_item_locations`
- `API GET "/summary"`
- `API GET "/locations/{item_id}"`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/services/inventory.py]] — 입고, 출고, 부서 이동, 불량 처리처럼 실제 재고 숫자를 바꾸는 업무 규칙을 담은 핵심 파일입니다.
- [[ERP/backend/app/services/stock_math.py]] — 여러 재고 숫자를 일관된 방식으로 계산하고 검증하기 위한 보조 함수입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
"""inventory 조회: /summary, /locations/{item_id}.

GET "" (목록) 은 빈 경로 + include_router 제약 때문에 패키지 __init__.py 에 직접 정의.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
)
from app.schemas import (
    InventoryLocationResponse,
    InventorySummaryResponse,
    ProcessTypeSummary,
)

from ._shared import PROCESS_TYPE_LABELS, PROCESS_TYPE_ORDER


router = APIRouter()


@router.get("/summary", response_model=InventorySummaryResponse)
def get_inventory_summary(db: Session = Depends(get_db)):
    """process_type_code 18개 단일 기준 요약. category 컬럼 제거 후 단일 원천."""
    rows = (
        db.query(
            Item.process_type_code,
            func.count(Item.item_id).label("item_count"),
            func.coalesce(func.sum(Inventory.quantity), 0).label("total_quantity"),
            func.coalesce(func.sum(Inventory.warehouse_qty), 0).label("warehouse_sum"),
        )
        .outerjoin(Inventory, Item.item_id == Inventory.item_id)
        .group_by(Item.process_type_code)
        .all()
    )

    loc_rows = (
        db.query(
            Item.process_type_code,
            InventoryLocation.status,
            func.coalesce(func.sum(InventoryLocation.quantity), 0).label("loc_sum"),
        )
```
