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


@router.patch("/reorder", summary="제품 모델 표시 순서 재배치")
def reorder_models(
    payload: ProductModelReorderPayload,
    _admin: Annotated[None, Depends(require_admin_pin)],
    db: Session = Depends(get_db),
):
    """드래그 reorder 결과를 영구 저장. 부서 reorder 와 동일 패턴.

    - PIN 검증 후 payload.items 의 (slot, display_order) 쌍을 일괄 갱신.
    - 존재하지 않는 slot 은 조용히 스킵 (부분 갱신 허용).
    """
    reorder_by_display_order(
        db, ProductSymbol, "slot",
        [(item.slot, item.display_order) for item in payload.items],
    )
    db.commit()
    return {"ok": True}


@router.post(
    "",
    response_model=ProductModelResponse,
    status_code=status.HTTP_201_CREATED,
    summary="제품 모델 신규 등록 (slot 자동 배정)",
)
def create_model(payload: ProductModelCreate, db: Session = Depends(get_db)):
    """새 제품 모델 추가 — 예약(reserved) 슬롯 1개를 승격(promote)한다.

    슬롯 행은 시드에서 1~100 전부 미리 생성됨(예약분 symbol/model_name=NULL,
    is_reserved=True). 신규 등록 = 가장 낮은 예약 슬롯을 골라 symbol/model_name 채우고
    is_reserved=False 로 전환. (구버전은 '행이 없는 빈 slot 번호'를 찾으려다
    시드가 1~100 을 모두 채워 항상 None → 400 버그였음.)
    """
    # 이름 중복 확인
    existing_name = db.query(ProductSymbol).filter(ProductSymbol.model_name == payload.model_name).first()
    if existing_name:
        raise http_error(409, ErrorCode.CONFLICT, "같은 이름의 모델이 이미 존재합니다.")

    # 가장 낮은 예약 슬롯(symbol IS NULL, is_reserved=True) 선택
    target = (
        db.query(ProductSymbol)
        .filter(ProductSymbol.is_reserved == True, ProductSymbol.symbol.is_(None))  # noqa: E712
        .order_by(ProductSymbol.slot.asc())
        .first()
    )
    if target is None:
        raise http_error(400, ErrorCode.BAD_REQUEST, "등록 가능한 예약 슬롯이 없습니다.")

    # symbol 처리: 제공 안 하면 미사용 단일 문자 자동 배정
    symbol = payload.symbol
    if not symbol:
        for candidate in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789":
            if not db.query(ProductSymbol).filter(ProductSymbol.symbol == candidate).first():
                symbol = candidate
                break
    else:
        dup = db.query(ProductSymbol).filter(ProductSymbol.symbol == symbol).first()
        if dup:
            raise http_error(409, ErrorCode.CONFLICT, "같은 기호(symbol)의 모델이 이미 존재합니다.")

    target.symbol = symbol
    target.model_name = payload.model_name
    target.is_reserved = False
    commit_and_refresh(db, target)
    refresh_symbol_cache(db)
    return target


@router.put(
    "/{slot}",
    response_model=ProductModelResponse,
    summary="제품 모델 수정 (model_name, symbol)",
)
def update_model(
    slot: int,
    payload: ProductModelUpdate,
    _admin: Annotated[None, Depends(require_admin_pin)],
    db: Session = Depends(get_db),
):
    """제품 모델 이름·기호 수정. 관리자 PIN 필요."""
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
    refresh_symbol_cache(db)
    return ps


@router.delete(
    "/{slot}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="제품 모델 삭제 (연결 품목 있으면 409)",
)
def delete_model(
    slot: int,
    _admin: Annotated[None, Depends(require_admin_pin)],
    pin: Optional[str] = Query(None, description="관리자 PIN (deprecated — body 사용 권장)"),
    body: Optional[ProductModelDeleteRequest] = Body(None),
    db: Session = Depends(get_db),
) -> None:
    """제품 모델 삭제 (해당 슬롯을 사용하는 품목이 있으면 거부). 관리자 PIN 필요."""
    ps = db.query(ProductSymbol).filter(ProductSymbol.slot == slot).first()
    if not ps:
        raise http_error(404, ErrorCode.NOT_FOUND, "모델을 찾을 수 없습니다.")

    # 해당 slot을 사용하는 품목 확인 — mes_code prefix(첫 '-' 앞)에 symbol 글자 포함이면 사용 중.
    # transactions._model_filter 와 동일한 substr/instr 패턴 (SQLite 운영 전제).
    if ps.symbol:
        from sqlalchemy import func as _f
        sym = ps.symbol.replace("%", "\\%").replace("_", "\\_")
        dash_pos = _f.instr(Item.mes_code, "-")
        prefix_expr = _f.substr(Item.mes_code, 1, dash_pos - 1)
        linked_items = (
            db.query(Item)
            .filter(
                Item.mes_code.isnot(None),
                dash_pos > 0,
                prefix_expr.like(f"%{sym}%", escape="\\"),
            )
            .count()
        )
        if linked_items > 0:
            raise http_error(
                409,
                ErrorCode.CONFLICT,
                f"이 모델을 사용하는 품목이 {linked_items}개 있습니다. 먼저 품목 연결을 해제하세요.",
            )

    db.delete(ps)
    commit_only(db)
    refresh_symbol_cache(db)
