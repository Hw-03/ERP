---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/models.py
status: active
updated: 2026-04-27
source_sha: c4b79ac27796
tags:
  - erp
  - backend
  - router
  - py
---

# models.py

> [!summary] 역할
> FastAPI 라우터 계층의 `models` 영역 API 엔드포인트를 담당한다.

## 원본 위치

- Source: `backend/app/routers/models.py`
- Layer: `backend`
- Kind: `router`
- Size: `3994` bytes

## 연결

- Parent hub: [[backend/app/routers/routers|backend/app/routers]]
- Related: [[backend/backend]]

## 읽는 포인트

- 라우터는 API 표면이다. 요청/응답 계약은 `schemas.py`와 함께 확인한다.
- DB 변경은 서비스/모델/테스트까지 같이 본다.

## 원본 발췌

````python
"""Product model (ProductSymbol) CRUD router."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ItemModel, ProductSymbol
from app.routers._errors import ErrorCode, http_error
from app.services._tx import commit_and_refresh, commit_only

router = APIRouter()


class ProductModelResponse(BaseModel):
    model_config = {"protected_namespaces": (), "from_attributes": True}
    slot: int
    symbol: Optional[str]
    model_name: Optional[str]
    is_reserved: bool


class ProductModelCreate(BaseModel):
    model_config = {"protected_namespaces": ()}
    model_name: str = Field(..., min_length=1, max_length=50)
    symbol: Optional[str] = Field(None, max_length=5)


@router.get("", response_model=List[ProductModelResponse], summary="제품 모델 목록 (예약 제외)")
def list_models(db: Session = Depends(get_db)):
    """등록된 제품 모델 목록 반환 (is_reserved=False인 실제 모델만)."""
    return (
        db.query(ProductSymbol)
        .filter(ProductSymbol.model_name.isnot(None))
        .filter(ProductSymbol.is_reserved == False)  # noqa: E712
        .order_by(ProductSymbol.slot)
        .all()
    )


@router.post(
    "",
    response_model=ProductModelResponse,
    status_code=status.HTTP_201_CREATED,
    summary="제품 모델 신규 등록 (slot 자동 배정)",
)
def create_model(payload: ProductModelCreate, db: Session = Depends(get_db)):
    """새 제품 모델 추가."""
    # 이름 중복 확인
    existing_name = db.query(ProductSymbol).filter(ProductSymbol.model_name == payload.model_name).first()
    if existing_name:
        raise http_error(409, ErrorCode.CONFLICT, "같은 이름의 모델이 이미 존재합니다.")

    # 다음 빈 slot 찾기 (1~100)
    used_slots = {ps.slot for ps in db.query(ProductSymbol).all()}
    next_slot = next((s for s in range(1, 101) if s not in used_slots), None)
    if next_slot is None:
        raise http_error(400, ErrorCode.BAD_REQUEST, "슬롯이 모두 사용 중입니다.")

    # symbol 처리: 제공 안 하면 slot 번호를 문자로 사용
    symbol = payload.symbol
    if not symbol:
        # 숫자 기반 symbol 자동 생성 (단일 문자)
        for candidate in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789":
            if not db.query(ProductSymbol).filter(ProductSymbol.symbol == candidate).first():
                symbol = candidate
                break
    else:
        dup = db.query(ProductSymbol).filter(ProductSymbol.symbol == symbol).first()
        if dup:
            raise http_error(409, ErrorCode.CONFLICT, "같은 기호(symbol)의 모델이 이미 존재합니다.")

    ps = ProductSymbol(slot=next_slot, symbol=symbol, model_name=payload.model_name, is_reserved=False)
    db.add(ps)
    commit_and_refresh(db, ps)
    return ps


@router.delete(
    "/{slot}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="제품 모델 삭제 (연결 품목 있으면 409)",
)
def delete_model(slot: int, db: Session = Depends(get_db)) -> None:
    """제품 모델 삭제 (해당 슬롯을 사용하는 품목이 있으면 거부)."""
    ps = db.query(ProductSymbol).filter(ProductSymbol.slot == slot).first()
    if not ps:
        raise http_error(404, ErrorCode.NOT_FOUND, "모델을 찾을 수 없습니다.")

    # 해당 slot을 사용하는 품목 확인
    linked_items = db.query(ItemModel).filter(ItemModel.slot == slot).count()
    if linked_items > 0:
        raise http_error(
            409,
            ErrorCode.CONFLICT,
            f"이 모델을 사용하는 품목이 {linked_items}개 있습니다. 먼저 품목 연결을 해제하세요.",
        )

    db.delete(ps)
    commit_only(db)
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
