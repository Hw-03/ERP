"""불량 등록: /mark-defective."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, TransactionLog, TransactionTypeEnum
from app.routers._errors import ErrorCode, http_error
from app.schemas import InventoryResponse, MarkDefectiveRequest
from app.services import inventory as inventory_svc
from app.services._tx import commit_and_refresh

from ._shared import to_response


router = APIRouter()


@router.post("/mark-defective", response_model=InventoryResponse)
def mark_defective(payload: MarkDefectiveRequest, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")
    inventory = inventory_svc.get_or_create_inventory(db, payload.item_id)
    qty_before = inventory.quantity or Decimal("0")
    try:
        inventory_svc.mark_defective(
            db, payload.item_id, payload.quantity,
            source=payload.source,
            target_dept=payload.target_department,
            source_dept=payload.source_department,
        )
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    note = (
        f"불량 등록 [{payload.source}"
        + (f"/{payload.source_department.value}" if payload.source_department else "")
        + f"] → {payload.target_department.value} 격리 ({payload.quantity})"
        + (f" — {payload.reason}" if payload.reason else "")
    )
    db.add(
        TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
            quantity_change=Decimal("0"),
            quantity_before=qty_before,
            quantity_after=inventory.quantity,
            reference_no=None,
            produced_by=payload.operator,
            notes=note,
        )
    )
    commit_and_refresh(db, inventory)
    return to_response(db, inventory)
