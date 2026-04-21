"""Physical count router: 실사 등록 + 강제 조정.

제출 시 system_qty(현재 재고)와 diff를 자동 계산하고, diff ≠ 0이면 재고를
counted_qty로 강제 맞추고 ADJUST TransactionLog + COUNT_VARIANCE 알림을 생성.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    AlertKindEnum,
    Inventory,
    Item,
    PhysicalCount,
    StockAlert,
    TransactionLog,
    TransactionTypeEnum,
)
from app.schemas import (
    PhysicalCountCreateRequest,
    PhysicalCountResponse,
)
from app.services import inventory as inv_svc

router = APIRouter()


def _to_response(db: Session, count: PhysicalCount) -> PhysicalCountResponse:
    item = db.query(Item).filter(Item.item_id == count.item_id).first()
    return PhysicalCountResponse(
        count_id=count.count_id,
        item_id=count.item_id,
        item_code=item.item_code if item else None,
        item_name=item.item_name if item else None,
        counted_qty=count.counted_qty,
        system_qty=count.system_qty,
        diff=count.diff,
        reason=count.reason,
        operator=count.operator,
        created_at=count.created_at,
    )


@router.post(
    "/",
    response_model=PhysicalCountResponse,
    status_code=status.HTTP_201_CREATED,
    summary="실사 등록 + 강제 조정",
)
def submit_count(
    payload: PhysicalCountCreateRequest,
    db: Session = Depends(get_db),
):
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    inv = inv_svc.get_or_create_inventory(db, payload.item_id)
    system_qty = inv.quantity or Decimal("0")
    pending = inv.pending_quantity or Decimal("0")
    diff = payload.counted_qty - system_qty

    # Enforce physical can't go below pending (someone has reserved it)
    if payload.counted_qty < pending:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"실사량이 예약 수량보다 적습니다 (counted {payload.counted_qty}, "
                f"pending {pending}). 예약 해제 후 다시 실사하세요."
            ),
        )

    count = PhysicalCount(
        item_id=payload.item_id,
        counted_qty=payload.counted_qty,
        system_qty=system_qty,
        diff=diff,
        reason=payload.reason,
        operator=payload.operator,
    )
    db.add(count)
    db.flush()

    if diff != 0:
        inv.quantity = payload.counted_qty
        db.add(
            TransactionLog(
                item_id=payload.item_id,
                transaction_type=TransactionTypeEnum.ADJUST,
                quantity_change=diff,
                quantity_before=system_qty,
                quantity_after=payload.counted_qty,
                produced_by=payload.operator,
                notes=f"실사 편차 조정: {payload.reason or '(사유 없음)'} (count_id={count.count_id})",
            )
        )
        db.add(
            StockAlert(
                item_id=payload.item_id,
                kind=AlertKindEnum.COUNT_VARIANCE,
                threshold=None,
                observed_value=diff,
                message=(
                    f"{item.item_name}: 실사 {payload.counted_qty} vs 시스템 "
                    f"{system_qty} (diff {diff})"
                ),
            )
        )
    db.commit()
    db.refresh(count)
    return _to_response(db, count)


@router.get("/", response_model=List[PhysicalCountResponse], summary="실사 이력")
def list_counts(
    item_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(PhysicalCount)
    if item_id:
        q = q.filter(PhysicalCount.item_id == item_id)
    rows = q.order_by(PhysicalCount.created_at.desc()).offset(skip).limit(limit).all()
    return [_to_response(db, r) for r in rows]
