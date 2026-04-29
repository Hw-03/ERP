"""Code master router: 제품기호 / 옵션 / 공정 / 흐름 + 4-파트 코드 파싱·생성."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import OptionCode, ProcessFlowRule, ProcessType, ProductSymbol
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    ErpCodeGenerateRequest,
    ErpCodeParseRequest,
    ErpCodeResponse,
    OptionCodeResponse,
    ProcessFlowRuleResponse,
    ProcessTypeResponse,
    ProductSymbolResponse,
    ProductSymbolUpdate,
)
from app.services import audit
from app.services import codes as code_svc
from app.services._tx import commit_and_refresh

router = APIRouter()


# ---- Product Symbols (100 slots) -------------------------------------------


@router.get("/symbols", response_model=List[ProductSymbolResponse], summary="제품기호 100슬롯 조회")
def list_symbols(db: Session = Depends(get_db)):
    return db.query(ProductSymbol).order_by(ProductSymbol.slot).all()


@router.put("/symbols/{slot}", response_model=ProductSymbolResponse, summary="제품기호 슬롯 수정")
def update_symbol(slot: int, payload: ProductSymbolUpdate, request: Request, db: Session = Depends(get_db)):
    row = db.query(ProductSymbol).filter(ProductSymbol.slot == slot).one_or_none()
    if row is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "해당 슬롯이 없습니다.")

    if payload.symbol is not None:
        # Enforce uniqueness when assigning a symbol
        dup = (
            db.query(ProductSymbol)
            .filter(ProductSymbol.symbol == payload.symbol, ProductSymbol.slot != slot)
            .one_or_none()
        )
        if dup is not None:
            raise http_error(
                status.HTTP_409_CONFLICT,
                ErrorCode.CONFLICT,
                f"기호 '{payload.symbol}' 는 이미 슬롯 {dup.slot}에 사용 중입니다.",
            )
        row.symbol = payload.symbol
    if payload.model_name is not None:
        row.model_name = payload.model_name
    if payload.is_finished_good is not None:
        row.is_finished_good = payload.is_finished_good
    if payload.is_reserved is not None:
        row.is_reserved = payload.is_reserved
    if payload.notes is not None:
        row.notes = payload.notes

    # If symbol or model assigned, unlock reservation flag
    if row.symbol and row.model_name:
        row.is_reserved = False

    audit.record(
        db,
        request=request,
        action="codes.symbol_update",
        target_type="product_symbol",
        target_id=str(slot),
        payload_summary=f"slot={slot} symbol={row.symbol} model={row.model_name}",
    )

    commit_and_refresh(db, row)
    return row


# ---- Option Codes -----------------------------------------------------------


@router.get("/options", response_model=List[OptionCodeResponse], summary="옵션 코드 목록")
def list_options(db: Session = Depends(get_db)):
    return db.query(OptionCode).order_by(OptionCode.code).all()


# ---- Process Types ----------------------------------------------------------


@router.get("/process-types", response_model=List[ProcessTypeResponse], summary="공정 코드 목록")
def list_process_types(db: Session = Depends(get_db)):
    return db.query(ProcessType).order_by(ProcessType.stage_order, ProcessType.code).all()


@router.get("/process-flows", response_model=List[ProcessFlowRuleResponse], summary="공정 흐름 규칙 목록")
def list_process_flows(db: Session = Depends(get_db)):
    return db.query(ProcessFlowRule).order_by(ProcessFlowRule.rule_id).all()


# ---- 4-part code operations ------------------------------------------------


@router.post("/parse", response_model=ErpCodeResponse, summary="4-파트 품목 코드 파싱")
def parse_code(payload: ErpCodeParseRequest, db: Session = Depends(get_db)):
    try:
        code = code_svc.parse_erp_code(payload.code)
        code_svc.validate_code(db, code)
    except ValueError as exc:
        raise http_error(status.HTTP_400_BAD_REQUEST, ErrorCode.BAD_REQUEST, str(exc))
    return ErpCodeResponse(
        symbol=code.symbol,
        process_type=code.process_type,
        serial=code.serial,
        option=code.option,
        symbol_slots=code.symbol_slots,
        formatted_full=code.format(compact=False),
        formatted_compact=code.format(compact=True),
    )


@router.post(
    "/generate",
    response_model=ErpCodeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="4-파트 품목 코드 자동 생성",
)
def generate_code(payload: ErpCodeGenerateRequest, db: Session = Depends(get_db)):
    try:
        code = code_svc.generate_code(
            db,
            symbol=payload.symbol,
            process_type=payload.process_type,
            option=payload.option,
        )
    except ValueError as exc:
        raise http_error(status.HTTP_400_BAD_REQUEST, ErrorCode.BAD_REQUEST, str(exc))
    return ErpCodeResponse(
        symbol=code.symbol,
        process_type=code.process_type,
        serial=code.serial,
        option=code.option,
        symbol_slots=code.symbol_slots,
        formatted_full=code.format(compact=False),
        formatted_compact=code.format(compact=True),
    )
