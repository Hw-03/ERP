"""Product model (ProductSymbol) CRUD router."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ItemModel, ProductSymbol
from app.routers._errors import ErrorCode, http_error
from app.routers.settings import require_admin
from app.services._tx import commit_and_refresh, commit_only

router = APIRouter()


class ProductModelResponse(BaseModel):
    model_config = {"protected_namespaces": (), "from_attributes": True}
    slot: int
    symbol: Optional[str]
    model_name: Optional[str]
    is_reserved: bool
    display_order: int = 0


class ProductModelCreate(BaseModel):
    model_config = {"protected_namespaces": ()}
    model_name: str = Field(..., min_length=1, max_length=50)
    symbol: Optional[str] = Field(None, max_length=5)


class ProductModelUpdate(BaseModel):
    model_config = {"protected_namespaces": ()}
    model_name: Optional[str] = Field(None, min_length=1, max_length=50)
    symbol: Optional[str] = Field(None, max_length=5)
    pin: str


class ProductModelReorderItem(BaseModel):
    model_config = {"protected_namespaces": ()}
    slot: int
    display_order: int


class ProductModelReorderPayload(BaseModel):
    model_config = {"protected_namespaces": ()}
    items: List[ProductModelReorderItem]
    pin: str


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


@router.patch("/reorder", summary="제품 모델 표시 순서 재배치")
def reorder_models(payload: ProductModelReorderPayload, db: Session = Depends(get_db)):
    """드래그 reorder 결과를 영구 저장. 부서 reorder 와 동일 패턴.

    - PIN 검증 후 payload.items 의 (slot, display_order) 쌍을 일괄 갱신.
    - 존재하지 않는 slot 은 조용히 스킵 (부분 갱신 허용).
    """
    require_admin(db, payload.pin)
    for item in payload.items:
        ps = db.query(ProductSymbol).filter(ProductSymbol.slot == item.slot).first()
        if ps:
            ps.display_order = item.display_order
    db.commit()
    return {"ok": True}


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


@router.put(
    "/{slot}",
    response_model=ProductModelResponse,
    summary="제품 모델 수정 (model_name, symbol)",
)
def update_model(slot: int, payload: ProductModelUpdate, db: Session = Depends(get_db)):
    """제품 모델 이름·기호 수정. 관리자 PIN 필요."""
    require_admin(db, payload.pin)
    ps = db.query(ProductSymbol).filter(ProductSymbol.slot == slot).first()
    if not ps:
        raise http_error(404, ErrorCode.NOT_FOUND, "모델을 찾을 수 없습니다.")

    if payload.model_name is not None:
        dup = (
            db.query(ProductSymbol)
            .filter(ProductSymbol.model_name == payload.model_name, ProductSymbol.slot != slot)
            .first()
        )
        if dup:
            raise http_error(409, ErrorCode.CONFLICT, "같은 이름의 모델이 이미 존재합니다.")
        ps.model_name = payload.model_name

    if payload.symbol is not None:
        dup_sym = (
            db.query(ProductSymbol)
            .filter(ProductSymbol.symbol == payload.symbol, ProductSymbol.slot != slot)
            .first()
        )
        if dup_sym:
            raise http_error(409, ErrorCode.CONFLICT, "같은 기호(symbol)의 모델이 이미 존재합니다.")
        ps.symbol = payload.symbol

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
