"""공급업체 반품: /return-to-supplier."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, TransactionLog, TransactionTypeEnum
from app.routers._errors import ErrorCode, http_error
from app.schemas import InventoryResponse, SupplierReturnRequest
from app.services import inventory as inventory_svc
from app.services._tx import commit_and_refresh

from ._shared import to_response


router = APIRouter()


@router.post("/return-to-supplier", response_model=InventoryResponse)
def return_to_supplier(payload: SupplierReturnRequest, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")
    inventory = inventory_svc.get_or_create_inventory(db, payload.item_id)
    qty_before = inventory.quantity or Decimal("0")
    try:
        inventory_svc.return_to_supplier(
            db, payload.item_id, payload.quantity, payload.from_department
        )
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    db.add(
        TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.SUPPLIER_RETURN,
            quantity_change=-payload.quantity,
            quantity_before=qty_before,
            quantity_after=inventory.quantity,
            reference_no=payload.reference_no,
            produced_by=payload.operator,
            notes=payload.notes or f"공급업체 반품 ({payload.from_department.value} 불량 {payload.quantity})",
        )
    )
    commit_and_refresh(db, inventory)
    return to_response(db, inventory)
