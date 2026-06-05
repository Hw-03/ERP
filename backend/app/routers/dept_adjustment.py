"""부서 재고 조정 API — 생산/조립·분해/회수·수량 보정.

엔드포인트:
  GET  /api/dept-adjustment/bom-template     BOM 기반 초기 라인 생성
  POST /api/dept-adjustment/expand-component 중간공정품 선택 전개
  POST /api/dept-adjustment/submit           배치 제출 (즉시 처리)
"""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal
from typing import Literal, List, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DepartmentEnum, DeptAdjSubTypeEnum, Item
from app.routers._errors import ErrorCode, http_error
from app.services import dept_adjustment as svc
from app._evt import emit as _evt_emit

router = APIRouter()

logger = logging.getLogger("mes")


# ──────────────────────────── Schemas ────────────────────────────

class AdjLineResponse(BaseModel):
    item_id: uuid.UUID
    item_name: str
    mes_code: Optional[str]
    process_type_code: Optional[str]
    unit: str
    direction: str
    quantity: Decimal
    bom_expected: Optional[Decimal]
    has_children: bool
    department: str
    reason: Optional[str]

    model_config = {"from_attributes": True}


class BomTemplateResponse(BaseModel):
    sub_type: str
    lines: List[AdjLineResponse]


class ExpandComponentRequest(BaseModel):
    item_id: uuid.UUID
    quantity: Decimal = Field(..., gt=0)
    department: str
    direction: Literal["in", "out"] = "out"


class AdjLineInput(BaseModel):
    item_id: uuid.UUID
    direction: Literal["in", "out", "defective", "scrap"]
    quantity: Decimal = Field(..., gt=0)
    department: str
    reason: Optional[str] = None
    bom_expected: Optional[Decimal] = None


class DeptAdjSubmitRequest(BaseModel):
    sub_type: Literal["production", "disassembly", "correction"]
    lines: List[AdjLineInput] = Field(..., min_length=1)
    operator_name: Optional[str] = None
    reference_no: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class DeptAdjResult(BaseModel):
    success: bool
    message: str
    processed_count: int
    transaction_ids: List[uuid.UUID]


# ──────────────────────────── 변환 헬퍼 ────────────────────────────

def _to_dept_enum(value: str) -> DepartmentEnum:
    try:
        return DepartmentEnum(value)
    except ValueError:
        raise ValueError(f"유효하지 않은 부서: {value}")


def _line_to_response(ln: svc.AdjLine) -> AdjLineResponse:
    return AdjLineResponse(
        item_id=ln.item_id,
        item_name=ln.item_name,
        mes_code=ln.mes_code,
        process_type_code=ln.process_type_code,
        unit=ln.unit,
        direction=ln.direction,
        quantity=ln.quantity,
        bom_expected=ln.bom_expected,
        has_children=ln.has_children,
        department=ln.department.value,
        reason=ln.reason,
    )


# ──────────────────────────── Endpoints ────────────────────────────

@router.get("/bom-template", response_model=BomTemplateResponse)
def get_bom_template(
    item_id: uuid.UUID = Query(...),
    sub_type: str = Query(...),
    quantity: Decimal = Query(Decimal("1"), gt=0),
    db: Session = Depends(get_db),
):
    """BOM 기반 초기 라인 세트 반환."""
    item = db.query(Item).filter(Item.item_id == item_id).first()
    if item is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    if sub_type not in ("production", "disassembly"):
        raise http_error(400, ErrorCode.BAD_REQUEST, "sub_type은 production 또는 disassembly만 가능합니다.")

    try:
        if sub_type == "production":
            lines = svc.build_production_template(db, item_id, quantity)
        else:
            lines = svc.build_disassembly_template(db, item_id, quantity)
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    return BomTemplateResponse(
        sub_type=sub_type,
        lines=[_line_to_response(ln) for ln in lines],
    )


@router.post("/expand-component", response_model=List[AdjLineResponse])
def expand_component(
    payload: ExpandComponentRequest,
    db: Session = Depends(get_db),
):
    """중간공정품 1단계 선택 전개."""
    try:
        dept_enum = _to_dept_enum(payload.department)
        lines = svc.expand_component(db, payload.item_id, payload.quantity, dept_enum, payload.direction)
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    return [_line_to_response(ln) for ln in lines]


@router.post("/submit", response_model=DeptAdjResult, status_code=201)
def submit_adjustment(
    payload: DeptAdjSubmitRequest,
    http_request: Request,
    db: Session = Depends(get_db),
):
    """부서 재고 조정 배치 원자 처리."""
    sub_type_enum = DeptAdjSubTypeEnum(payload.sub_type)

    adj_lines: list[svc.AdjLine] = []
    for ln in payload.lines:
        try:
            dept_enum = _to_dept_enum(ln.department)
        except ValueError as exc:
            raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
        adj_lines.append(svc.AdjLine(
            item_id=ln.item_id,
            direction=ln.direction,
            quantity=ln.quantity,
            department=dept_enum,
            reason=ln.reason,
            bom_expected=ln.bom_expected,
        ))

    try:
        log_ids = svc.submit_adjustment(
            db,
            sub_type_enum,
            adj_lines,
            operator_name=payload.operator_name,
            reference_no=payload.reference_no,
            notes=payload.notes,
        )
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    except Exception as exc:
        # WS8: 재던지기 전 풀스택 보존(기존엔 str(exc) 만 남고 트레이스 소실).
        logger.exception("부서 조정 처리 중 예기치 못한 오류")
        db.rollback()
        raise http_error(500, ErrorCode.INTERNAL, f"처리 중 오류: {exc}")

    db.commit()
    _evt_emit(
        "dept_adj",
        request=http_request,
        sub_type=payload.sub_type,
        lines=len(log_ids),
        operator=payload.operator_name or "-",
    )

    sub_label = {"production": "생산/조립", "disassembly": "분해/회수", "correction": "수량 보정"}
    return DeptAdjResult(
        success=True,
        message=f"{sub_label.get(payload.sub_type, payload.sub_type)} 완료 ({len(log_ids)}건)",
        processed_count=len(log_ids),
        transaction_ids=log_ids,
    )
