---
type: file-explanation
source_path: "backend/app/routers/models.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# models.py — models.py 설명

## 이 파일은 무엇을 책임지나

`models.py`는 `models` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ProductModelResponse`
- `ProductModelCreate`
- `list_models`
- `create_model`
- `delete_model`
- `API GET ""`
- `API POST ""`
- `API PATCH "/reorder"`
- `API PUT "/{slot}"`
- `API DELETE "/{slot}"`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/schemas/📁_schemas]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
"""Product model (ProductSymbol) CRUD router."""

from typing import Annotated, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin import require_admin_pin
from app.models import Item, ProductSymbol
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    ProductModelCreate,
    ProductModelDeleteRequest,
    ProductModelReorderItem,
    ProductModelReorderPayload,
    ProductModelResponse,
    ProductModelUpdate,
)
from app.services._tx import commit_and_refresh, commit_only
from app.services.reorder import reorder_by_display_order
from app.utils.mes_code import refresh_symbol_cache

router = APIRouter()


@router.get("", response_model=List[ProductModelResponse], summary="제품 모델 목록 (예약 제외)")
def list_models(db: Session = Depends(get_db)):
    """등록된 제품 모델 목록 반환 (is_reserved=False인 실제 모델만)."""
    return (
        db.query(ProductSymbol)
        .filter(ProductSymbol.model_name.isnot(None))
        .filter(ProductSymbol.is_reserved == False)  # noqa: E712
        .order_by(ProductSymbol.display_order.asc(), ProductSymbol.slot.asc())
        .all()
    )


@router.post(
    "",
    response_model=ProductModelResponse,
    status_code=status.HTTP_201_CREATED,
    summary="제품 모델 신규 등록 (slot 자동 배정)",
)
def create_model(payload: ProductModelCreate, db: Session = Depends(get_db)):
    """새 제품 모델 추가 — 예약(reserved) 슬롯 1개를 승격(promote)한다."""
    # 이름 중복 확인
    existing_name = db.query(ProductSymbol).filter(ProductSymbol.model_name == payload.model_name).first()
    if existing_name:
        raise http_error(409, ErrorCode.CONFLICT, "같은 이름의 모델이 이미 존재합니다.")
```
