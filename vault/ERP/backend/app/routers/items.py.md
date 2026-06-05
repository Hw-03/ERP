---
type: file-explanation
source_path: "backend/app/routers/items.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# items.py — items.py 설명

## 이 파일은 무엇을 책임지나

`items.py`는 `items` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_build_item_query`
- `_to_item_with_inventory`
- `create_item`
- `list_items`
- `export_items_csv`
- `_row_color_for`
- `export_items_xlsx`
- `get_item`
- `update_item`
- `update_bom_completion`
- 그 외 7개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/frontend/lib/api/items.ts]] — `items.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
"""Items router for item master CRUD operations."""

from datetime import UTC, datetime
import csv
from io import StringIO
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from sqlalchemy import func

from app.database import get_db
from app.models import Inventory, InventoryLocation, Item, ItemModel, LocationStatusEnum
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    BomCompletionUpdate,
    InventoryLocationResponse,
    ItemCreate,
    ItemResponse,
    ItemUpdate,
    ItemWithInventory,
)
from app.utils.item_code import make_item_code, next_serial_no, slots_to_model_symbol
from app.models import ProductSymbol
from app.services import audit
from app.services import inventory as inventory_svc
from app.services import stock_math
from app.services._tx import commit_and_refresh
from app.services.export_helpers import csv_streaming_response

router = APIRouter()


def _build_item_query(db: Session):
    return db.query(Item, Inventory).outerjoin(Inventory, Item.item_id == Inventory.item_id)


def _to_item_with_inventory(
    db: Session,
    item: Item,
    inventory: Optional[Inventory],
    *,
    figures: Optional[stock_math.StockFigures] = None,
    locations: Optional[list[InventoryLocationResponse]] = None,
    model_slots: Optional[list[int]] = None,
) -> ItemWithInventory:
    """ItemWithInventory DTO 조립.

    성능 모드 (Phase C bulk prefetch 용): 호출측이 figures / locations / model_slots 를
    미리 채워 넣으면 DB 쿼리를 추가로 발생시키지 않는다. 인자를 생략하면 기존처럼
    단건 쿼리를 수행한다 (단건 상세 조회용).
```
