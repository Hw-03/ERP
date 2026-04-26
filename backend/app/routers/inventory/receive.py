"""수취/조정: /receive, /adjust."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, TransactionLog, TransactionTypeEnum
from app.routers._errors import ErrorCode, http_error
from app.schemas import InventoryAdjust, InventoryReceive, InventoryResponse
from app.services import inventory as inventory_svc
from app.services._tx import commit_and_refresh

from ._shared import to_response


router = APIRouter()


@router.post("/receive", response_model=InventoryResponse, status_code=status.HTTP_201_CREATED)
def receive_inventory(payload: InventoryReceive, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    inventory = inventory_svc.get_or_create_inventory(db, payload.item_id)
    qty_before = inventory.quantity or Decimal("0")
    inventory_svc.receive_confirmed(db, payload.item_id, payload.quantity, bucket="warehouse")
    if payload.location:
        inventory.location = payload.location

    db.add(
        TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=payload.quantity,
            quantity_before=qty_before,
            quantity_after=inventory.quantity,
            reference_no=payload.reference_no,
            produced_by=payload.produced_by,
            notes=payload.notes,
        )
    )
    commit_and_refresh(db, inventory)
    return to_response(db, inventory)


@router.post("/adjust", response_model=InventoryResponse, status_code=status.HTTP_200_OK)
def adjust_inventory(payload: InventoryAdjust, db: Session = Depends(get_db)):
    """재고 조정: warehouse_qty 를 직접 설정.

    payload.quantity 는 조정 후 창고 수량. production / defective 는 건드리지 않음.
    """
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    try:
        inventory, qty_before, delta = inventory_svc.adjust_warehouse(
            db, payload.item_id, payload.quantity, location=payload.location
        )
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    db.add(
        TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.ADJUST,
            quantity_change=delta,
            quantity_before=qty_before,
            quantity_after=inventory.quantity,
            reference_no=payload.reference_no,
            produced_by=payload.produced_by,
            notes=payload.reason,
        )
    )
    commit_and_refresh(db, inventory)
    return to_response(db, inventory)
