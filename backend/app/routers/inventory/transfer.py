"""부서 이동: /transfer-to-production, /transfer-to-warehouse, /transfer-between-depts."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, TransactionLog, TransactionTypeEnum
from app.routers._errors import ErrorCode, http_error
from app.schemas import DeptTransferRequest, InventoryResponse, TransferRequest
from app.services import inventory as inventory_svc
from app.services._tx import commit_and_refresh

from ._shared import to_response


router = APIRouter()


@router.post("/transfer-to-production", response_model=InventoryResponse)
def transfer_to_production(payload: TransferRequest, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")
    inventory = inventory_svc.get_or_create_inventory(db, payload.item_id)
    qty_before = inventory.quantity or Decimal("0")
    try:
        inventory_svc.transfer_to_production(
            db, payload.item_id, payload.quantity, payload.department
        )
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    db.add(
        TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.TRANSFER_TO_PROD,
            quantity_change=Decimal("0"),
            quantity_before=qty_before,
            quantity_after=inventory.quantity,
            reference_no=payload.reference_no,
            produced_by=payload.produced_by,
            notes=payload.notes or f"창고 → {payload.department.value} 이동 ({payload.quantity})",
        )
    )
    commit_and_refresh(db, inventory)
    return to_response(db, inventory)


@router.post("/transfer-to-warehouse", response_model=InventoryResponse)
def transfer_to_warehouse(payload: TransferRequest, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")
    inventory = inventory_svc.get_or_create_inventory(db, payload.item_id)
    qty_before = inventory.quantity or Decimal("0")
    try:
        inventory_svc.transfer_to_warehouse(
            db, payload.item_id, payload.quantity, payload.department
        )
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    db.add(
        TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.TRANSFER_TO_WH,
            quantity_change=Decimal("0"),
            quantity_before=qty_before,
            quantity_after=inventory.quantity,
            reference_no=payload.reference_no,
            produced_by=payload.produced_by,
            notes=payload.notes or f"{payload.department.value} → 창고 복귀 ({payload.quantity})",
        )
    )
    commit_and_refresh(db, inventory)
    return to_response(db, inventory)


@router.post("/transfer-between-depts", response_model=InventoryResponse)
def transfer_between_depts(payload: DeptTransferRequest, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")
    inventory = inventory_svc.get_or_create_inventory(db, payload.item_id)
    qty_before = inventory.quantity or Decimal("0")
    try:
        inventory_svc.transfer_between_departments(
            db, payload.item_id, payload.quantity,
            payload.from_department, payload.to_department,
        )
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    db.add(
        TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.TRANSFER_DEPT,
            quantity_change=Decimal("0"),
            quantity_before=qty_before,
            quantity_after=inventory.quantity,
            reference_no=payload.reference_no,
            produced_by=payload.produced_by,
            notes=payload.notes or f"{payload.from_department.value} → {payload.to_department.value} 이동 ({payload.quantity})",
        )
    )
    commit_and_refresh(db, inventory)
    return to_response(db, inventory)
