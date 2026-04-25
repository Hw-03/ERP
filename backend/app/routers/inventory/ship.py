"""출하: /ship, /ship-package."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    DepartmentEnum,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    ShipPackage,
    TransactionLog,
    TransactionTypeEnum,
)
from app.schemas import InventoryResponse, InventoryShip, PackageShipRequest
from app.services import inventory as inventory_svc
from app.services._tx import commit_and_refresh, commit_only
from app.routers._errors import ErrorCode, http_error

from ._shared import to_response


router = APIRouter()


@router.post("/ship", response_model=InventoryResponse, status_code=status.HTTP_200_OK)
def ship_inventory(payload: InventoryShip, db: Session = Depends(get_db)):
    """출고: 출하부 PRODUCTION 에서만 차감."""
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    inventory = db.query(Inventory).filter(Inventory.item_id == payload.item_id).first()
    if not inventory:
        raise HTTPException(status_code=404, detail="출고할 재고가 존재하지 않습니다.")

    qty_before = inventory.quantity or Decimal("0")
    try:
        inventory_svc.consume_from_department(
            db, payload.item_id, payload.quantity, DepartmentEnum.SHIPPING
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{exc} 다른 부서에서 출하부로 먼저 이동해 주세요.",
        )

    if payload.location is not None:
        inventory.location = payload.location

    db.add(
        TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.SHIP,
            quantity_change=-payload.quantity,
            quantity_before=qty_before,
            quantity_after=inventory.quantity,
            reference_no=payload.reference_no,
            produced_by=payload.produced_by,
            notes=payload.notes,
        )
    )
    commit_and_refresh(db, inventory)
    return to_response(db, inventory)


@router.post("/ship-package", status_code=status.HTTP_200_OK)
def ship_package(payload: PackageShipRequest, db: Session = Depends(get_db)):
    """패키지 출고: 모든 구성품을 출하부 PRODUCTION 에서 차감."""
    package = db.query(ShipPackage).filter(ShipPackage.package_id == payload.package_id).first()
    if not package:
        raise HTTPException(status_code=404, detail="출하 패키지를 찾을 수 없습니다.")

    if not package.items:
        raise HTTPException(status_code=400, detail="패키지에 등록된 품목이 없습니다.")

    shortages: list[str] = []
    for package_item in package.items:
        loc = (
            db.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == package_item.item_id,
                InventoryLocation.department == DepartmentEnum.SHIPPING,
                InventoryLocation.status == LocationStatusEnum.PRODUCTION,
            )
            .first()
        )
        current = (loc.quantity if loc else None) or Decimal("0")
        required_qty = package_item.quantity * payload.quantity
        if current < required_qty:
            shortages.append(
                f"[{package_item.item.erp_code}] {package_item.item.item_name}: "
                f"필요 {required_qty}, 출하부 보유 {current}"
            )

    if shortages:
        raise http_error(
            status_code=422,
            code=ErrorCode.STOCK_SHORTAGE,
            message="출하부 재고가 부족합니다. 다른 부서에서 출하부로 먼저 이동하세요.",
            shortages=shortages,
        )

    shipped_items = []
    for package_item in package.items:
        required_qty = package_item.quantity * payload.quantity
        inventory = db.query(Inventory).filter(
            Inventory.item_id == package_item.item_id
        ).with_for_update().first()
        before_qty = inventory.quantity if inventory else Decimal("0")
        inventory_svc.consume_from_department(
            db, package_item.item_id, required_qty, DepartmentEnum.SHIPPING
        )

        db.add(
            TransactionLog(
                item_id=package_item.item_id,
                transaction_type=TransactionTypeEnum.SHIP,
                quantity_change=-required_qty,
                quantity_before=before_qty,
                quantity_after=inventory.quantity if inventory else Decimal("0"),
                reference_no=payload.reference_no,
                produced_by=payload.produced_by,
                notes=payload.notes or f"[출하 패키지] {package.name} x {payload.quantity}",
            )
        )
        shipped_items.append(
            {
                "item_id": str(package_item.item_id),
                "erp_code": package_item.item.erp_code,
                "item_name": package_item.item.item_name,
                "quantity": float(required_qty),
                "stock_after": float(inventory.quantity if inventory else 0),
            }
        )

    commit_only(db)
    return {
        "message": f"{package.name} 패키지 {payload.quantity}건 출고 완료",
        "package_name": package.name,
        "quantity": float(payload.quantity),
        "items": shipped_items,
    }
