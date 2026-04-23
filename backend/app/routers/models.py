"""Product model (ProductSymbol) CRUD router."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ItemModel, ProductSymbol

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


@router.get("", response_model=List[ProductModelResponse])
def list_models(db: Session = Depends(get_db)):
    """등록된 제품 모델 목록 반환 (is_reserved=False인 실제 모델만)."""
    return (
        db.query(ProductSymbol)
        .filter(ProductSymbol.model_name.isnot(None))
        .filter(ProductSymbol.is_reserved == False)  # noqa: E712
        .order_by(ProductSymbol.slot)
        .all()
    )


@router.post("", response_model=ProductModelResponse, status_code=status.HTTP_201_CREATED)
def create_model(payload: ProductModelCreate, db: Session = Depends(get_db)):
    """새 제품 모델 추가."""
    # 이름 중복 확인
    existing_name = db.query(ProductSymbol).filter(ProductSymbol.model_name == payload.model_name).first()
    if existing_name:
        raise HTTPException(status_code=409, detail="같은 이름의 모델이 이미 존재합니다.")

    # 다음 빈 slot 찾기 (1~100)
    used_slots = {ps.slot for ps in db.query(ProductSymbol).all()}
    next_slot = next((s for s in range(1, 101) if s not in used_slots), None)
    if next_slot is None:
        raise HTTPException(status_code=400, detail="슬롯이 모두 사용 중입니다.")

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
            raise HTTPException(status_code=409, detail="같은 기호(symbol)의 모델이 이미 존재합니다.")

    ps = ProductSymbol(slot=next_slot, symbol=symbol, model_name=payload.model_name, is_reserved=False)
    db.add(ps)
    db.commit()
    db.refresh(ps)
    return ps


@router.delete("/{slot}", status_code=status.HTTP_204_NO_CONTENT)
def delete_model(slot: int, db: Session = Depends(get_db)):
    """제품 모델 삭제 (해당 슬롯을 사용하는 품목이 있으면 거부)."""
    ps = db.query(ProductSymbol).filter(ProductSymbol.slot == slot).first()
    if not ps:
        raise HTTPException(status_code=404, detail="모델을 찾을 수 없습니다.")

    # 해당 slot을 사용하는 품목 확인
    linked_items = db.query(ItemModel).filter(ItemModel.slot == slot).count()
    if linked_items > 0:
        raise HTTPException(
            status_code=409,
            detail=f"이 모델을 사용하는 품목이 {linked_items}개 있습니다. 먼저 품목 연결을 해제하세요.",
        )

    db.delete(ps)
    db.commit()
