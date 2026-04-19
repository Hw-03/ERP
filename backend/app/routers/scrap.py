"""Scrap log router: 폐기(불량) 이력 기록 및 조회."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Inventory,
    Item,
    ScrapLog,
    TransactionLog,
    TransactionTypeEnum,
)
from app.schemas import ScrapLogCreateRequest, ScrapLogResponse
from app.services import inventory as inv_svc

router = APIRouter()


def _to_response(db: Session, log: ScrapLog) -> ScrapLogResponse:
    item = db.query(Item).filter(Item.item_id == log.item_id).first()
    return ScrapLogResponse(
        scrap_id=log.scrap_id,
        item_id=log.item_id,
        item_code=(item.erp_code or item.item_code) if item else None,
        item_name=item.item_name if item else None,
        quantity=log.quantity,
        process_stage=log.process_stage,
        reason=log.reason,
        batch_id=log.batch_id,
        operator=log.operator,
        created_at=log.created_at,
    )


@router.post(
    "/",
    response_model=ScrapLogResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Scrap(폐기) 기록 + 재고 차감",
)
def create_scrap(payload: ScrapLogCreateRequest, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    inv = inv_svc.get_or_create_inventory(db, payload.item_id)
    if inv_svc.available(inv) < payload.quantity:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"가용 재고 부족 (Available {inv_svc.available(inv)}, "
                f"요청 {payload.quantity})."
            ),
        )

    qty_before = inv.quantity or Decimal("0")
    inv.quantity = qty_before - payload.quantity

    log = ScrapLog(
        item_id=payload.item_id,
        quantity=payload.quantity,
        process_stage=payload.process_stage,
        reason=payload.reason,
        operator=payload.operator,
    )
    db.add(log)
    db.add(
        TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.SCRAP,
            quantity_change=-payload.quantity,
            quantity_before=qty_before,
            quantity_after=inv.quantity,
            produced_by=payload.operator,
            notes=payload.reason,
        )
    )
    db.commit()
    db.refresh(log)
    return _to_response(db, log)


@router.get("/", response_model=List[ScrapLogResponse], summary="Scrap 로그 조회")
def list_scrap(
    item_id: Optional[uuid.UUID] = Query(None),
    batch_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(ScrapLog)
    if item_id:
        q = q.filter(ScrapLog.item_id == item_id)
    if batch_id:
        q = q.filter(ScrapLog.batch_id == batch_id)
    rows = q.order_by(ScrapLog.created_at.desc()).offset(skip).limit(limit).all()
    return [_to_response(db, r) for r in rows]
