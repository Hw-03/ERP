"""Loss log router: 분실/누락 이력 기록 및 조회.

Loss는 원칙적으로 재고 변동 없이 기록만 남긴다(반품 시 누락된 부품처럼 원래
보유 중이 아니었던 경우). 보유 중인 품목 분실 시 ?deduct=true 쿼리로
available에서 차감.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, LossLog, TransactionLog, TransactionTypeEnum
from app.routers._errors import ErrorCode, http_error
from app.schemas import LossLogCreateRequest, LossLogResponse
from app.services import inventory as inv_svc

router = APIRouter()


def _to_response(db: Session, log: LossLog) -> LossLogResponse:
    item = db.query(Item).filter(Item.item_id == log.item_id).first()
    return LossLogResponse(
        loss_id=log.loss_id,
        item_id=log.item_id,
        erp_code=item.erp_code if item else None,
        item_name=item.item_name if item else None,
        quantity=log.quantity,
        batch_id=log.batch_id,
        reason=log.reason,
        operator=log.operator,
        created_at=log.created_at,
    )


@router.post(
    "",
    response_model=LossLogResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Loss(분실) 기록 + (옵션) 재고 차감",
)
def create_loss(
    payload: LossLogCreateRequest,
    deduct: bool = Query(False, description="True이면 available에서 동일 수량 차감."),
    db: Session = Depends(get_db),
):
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if item is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    qty_before: Optional[Decimal] = None
    qty_after: Optional[Decimal] = None
    if deduct:
        inv = inv_svc.get_or_create_inventory(db, payload.item_id)
        wh = inv.warehouse_qty or Decimal("0")
        pending = inv.pending_quantity or Decimal("0")
        if wh - pending < payload.quantity:
            raise http_error(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                ErrorCode.STOCK_SHORTAGE,
                (
                    f"창고 가용 재고 부족 (창고 {wh}, 예약중 {pending}, "
                    f"요청 {payload.quantity})."
                ),
            )
        inv, qty_before = inv_svc.consume_warehouse(db, payload.item_id, payload.quantity)
        qty_after = inv.quantity

    log = LossLog(
        item_id=payload.item_id,
        quantity=payload.quantity,
        reason=payload.reason,
        operator=payload.operator,
    )
    db.add(log)
    db.add(
        TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.LOSS,
            quantity_change=(-payload.quantity if deduct else Decimal("0")),
            quantity_before=qty_before,
            quantity_after=qty_after,
            produced_by=payload.operator,
            notes=payload.reason,
        )
    )
    db.commit()
    db.refresh(log)
    return _to_response(db, log)


@router.get("", response_model=List[LossLogResponse], summary="Loss 로그 조회")
def list_loss(
    item_id: Optional[uuid.UUID] = Query(None),
    batch_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(LossLog)
    if item_id:
        q = q.filter(LossLog.item_id == item_id)
    if batch_id:
        q = q.filter(LossLog.batch_id == batch_id)
    rows = q.order_by(LossLog.created_at.desc()).offset(skip).limit(limit).all()
    return [_to_response(db, r) for r in rows]
