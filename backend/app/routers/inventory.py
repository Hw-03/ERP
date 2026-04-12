"""Inventory router for summary, receipts, shipments, and transaction history."""

import uuid
import csv
from decimal import Decimal
from io import StringIO
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    CategoryEnum,
    Inventory,
    Item,
    ShipPackage,
    TransactionLog,
    TransactionTypeEnum,
)
from app.schemas import (
    CategorySummary,
    InventoryAdjust,
    InventoryReceive,
    InventoryResponse,
    InventoryShip,
    InventorySummaryResponse,
    PackageShipRequest,
    TransactionLogResponse,
    TransactionLogUpdate,
)

router = APIRouter()

CATEGORY_LABELS = {
    CategoryEnum.RM: "원자재",
    CategoryEnum.TA: "튜브 반제품",
    CategoryEnum.TF: "튜브 완제품",
    CategoryEnum.HA: "고압 반제품",
    CategoryEnum.HF: "고압 완제품",
    CategoryEnum.VA: "진공 반제품",
    CategoryEnum.VF: "진공 완제품",
    CategoryEnum.BA: "조립 반제품",
    CategoryEnum.BF: "조립 완제품",
    CategoryEnum.FG: "완제품",
    CategoryEnum.UK: "미분류 품목",
}

CATEGORY_ORDER = [
    CategoryEnum.RM,
    CategoryEnum.TA,
    CategoryEnum.TF,
    CategoryEnum.HA,
    CategoryEnum.HF,
    CategoryEnum.VA,
    CategoryEnum.VF,
    CategoryEnum.BA,
    CategoryEnum.BF,
    CategoryEnum.FG,
    CategoryEnum.UK,
]


@router.get("/summary", response_model=InventorySummaryResponse)
def get_inventory_summary(db: Session = Depends(get_db)):
    rows = (
        db.query(
            Item.category,
            func.count(Item.item_id).label("item_count"),
            func.coalesce(func.sum(Inventory.quantity), 0).label("total_quantity"),
        )
        .outerjoin(Inventory, Item.item_id == Inventory.item_id)
        .group_by(Item.category)
        .all()
    )

    summary_map = {
        row.category: {
            "item_count": row.item_count,
            "total_quantity": Decimal(str(row.total_quantity)),
        }
        for row in rows
    }

    total_items = sum(value["item_count"] for value in summary_map.values())
    total_quantity = sum(value["total_quantity"] for value in summary_map.values())
    uk_count = summary_map.get(CategoryEnum.UK, {}).get("item_count", 0)

    categories = []
    for category in CATEGORY_ORDER:
        data = summary_map.get(category, {"item_count": 0, "total_quantity": Decimal("0")})
        categories.append(
            CategorySummary(
                category=category,
                category_label=CATEGORY_LABELS[category],
                item_count=data["item_count"],
                total_quantity=data["total_quantity"],
            )
        )

    return InventorySummaryResponse(
        categories=categories,
        total_items=total_items,
        total_quantity=total_quantity,
        uk_item_count=uk_count,
    )


@router.post("/receive", response_model=InventoryResponse, status_code=status.HTTP_201_CREATED)
def receive_inventory(payload: InventoryReceive, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    inventory = db.query(Inventory).filter(Inventory.item_id == payload.item_id).first()
    if not inventory:
        inventory = Inventory(item_id=payload.item_id, quantity=Decimal("0"))
        db.add(inventory)
        db.flush()

    quantity_before = inventory.quantity
    inventory.quantity = quantity_before + payload.quantity
    if payload.location:
        inventory.location = payload.location

    db.add(
        TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=payload.quantity,
            quantity_before=quantity_before,
            quantity_after=inventory.quantity,
            reference_no=payload.reference_no,
            produced_by=payload.produced_by,
            notes=payload.notes,
        )
    )
    db.commit()
    db.refresh(inventory)
    return inventory


@router.post("/ship", response_model=InventoryResponse, status_code=status.HTTP_200_OK)
def ship_inventory(payload: InventoryShip, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    inventory = db.query(Inventory).filter(Inventory.item_id == payload.item_id).first()
    if not inventory:
        raise HTTPException(status_code=404, detail="출고할 재고가 존재하지 않습니다.")

    quantity_before = inventory.quantity
    if quantity_before < payload.quantity:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"재고가 부족합니다. 현재 {quantity_before} {item.unit}, 요청 {payload.quantity} {item.unit}",
        )

    inventory.quantity = quantity_before - payload.quantity
    if payload.location is not None:
        inventory.location = payload.location

    db.add(
        TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.SHIP,
            quantity_change=-payload.quantity,
            quantity_before=quantity_before,
            quantity_after=inventory.quantity,
            reference_no=payload.reference_no,
            produced_by=payload.produced_by,
            notes=payload.notes,
        )
    )
    db.commit()
    db.refresh(inventory)
    return inventory


@router.post("/ship-package", status_code=status.HTTP_200_OK)
def ship_package(payload: PackageShipRequest, db: Session = Depends(get_db)):
    package = db.query(ShipPackage).filter(ShipPackage.package_id == payload.package_id).first()
    if not package:
        raise HTTPException(status_code=404, detail="출하 패키지를 찾을 수 없습니다.")

    if not package.items:
        raise HTTPException(status_code=400, detail="패키지에 등록된 품목이 없습니다.")

    shortages: list[str] = []
    for package_item in package.items:
        inventory = db.query(Inventory).filter(Inventory.item_id == package_item.item_id).first()
        current_qty = inventory.quantity if inventory else Decimal("0")
        required_qty = package_item.quantity * payload.quantity
        if current_qty < required_qty:
            shortages.append(
                f"[{package_item.item.item_code}] {package_item.item.item_name}: 필요 {required_qty}, 현재 {current_qty}"
            )

    if shortages:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "패키지 출고에 필요한 재고가 부족합니다.",
                "shortages": shortages,
            },
        )

    shipped_items = []
    for package_item in package.items:
        inventory = db.query(Inventory).filter(Inventory.item_id == package_item.item_id).with_for_update().first()
        required_qty = package_item.quantity * payload.quantity
        before_qty = inventory.quantity
        inventory.quantity = before_qty - required_qty

        db.add(
            TransactionLog(
                item_id=package_item.item_id,
                transaction_type=TransactionTypeEnum.SHIP,
                quantity_change=-required_qty,
                quantity_before=before_qty,
                quantity_after=inventory.quantity,
                reference_no=payload.reference_no,
                produced_by=payload.produced_by,
                notes=payload.notes or f"[출하 패키지] {package.name} x {payload.quantity}",
            )
        )
        shipped_items.append(
            {
                "item_id": str(package_item.item_id),
                "item_code": package_item.item.item_code,
                "item_name": package_item.item.item_name,
                "quantity": float(required_qty),
                "stock_after": float(inventory.quantity),
            }
        )

    db.commit()
    return {
        "message": f"{package.name} 패키지 {payload.quantity}건 출고 완료",
        "package_name": package.name,
        "quantity": float(payload.quantity),
        "items": shipped_items,
    }


@router.post("/adjust", response_model=InventoryResponse, status_code=status.HTTP_200_OK)
def adjust_inventory(payload: InventoryAdjust, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    inventory = db.query(Inventory).filter(Inventory.item_id == payload.item_id).first()
    if not inventory:
        inventory = Inventory(item_id=payload.item_id, quantity=Decimal("0"))
        db.add(inventory)
        db.flush()

    quantity_before = inventory.quantity
    quantity_after = payload.quantity
    quantity_change = quantity_after - quantity_before

    inventory.quantity = quantity_after
    if payload.location is not None:
        inventory.location = payload.location

    db.add(
        TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.ADJUST,
            quantity_change=quantity_change,
            quantity_before=quantity_before,
            quantity_after=quantity_after,
            reference_no=payload.reference_no,
            produced_by=payload.produced_by,
            notes=payload.reason,
        )
    )
    db.commit()
    db.refresh(inventory)
    return inventory


@router.get("/", response_model=List[InventoryResponse])
def list_inventory(
    category: Optional[CategoryEnum] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    query = db.query(Inventory).join(Item, Inventory.item_id == Item.item_id)
    if category:
        query = query.filter(Item.category == category)

    return query.order_by(Item.item_code).offset(skip).limit(limit).all()


@router.get("/transactions", response_model=List[TransactionLogResponse])
def list_transactions(
    item_id: Optional[uuid.UUID] = Query(None),
    transaction_type: Optional[TransactionTypeEnum] = Query(None),
    reference_no: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    query = db.query(TransactionLog, Item).join(Item, TransactionLog.item_id == Item.item_id)

    if item_id:
        query = query.filter(TransactionLog.item_id == item_id)
    if transaction_type:
        query = query.filter(TransactionLog.transaction_type == transaction_type)
    if reference_no:
        query = query.filter(TransactionLog.reference_no == reference_no)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Item.item_name.ilike(pattern),
                Item.item_code.ilike(pattern),
                TransactionLog.reference_no.ilike(pattern),
                TransactionLog.notes.ilike(pattern),
                TransactionLog.produced_by.ilike(pattern),
            )
        )

    rows = query.order_by(TransactionLog.created_at.desc()).offset(skip).limit(limit).all()

    return [
        TransactionLogResponse(
            log_id=log.log_id,
            item_id=log.item_id,
            item_code=item.item_code,
            item_name=item.item_name,
            item_category=item.category,
            item_unit=item.unit,
            transaction_type=log.transaction_type,
            quantity_change=log.quantity_change,
            quantity_before=log.quantity_before,
            quantity_after=log.quantity_after,
            reference_no=log.reference_no,
            produced_by=log.produced_by,
            notes=log.notes,
            created_at=log.created_at,
        )
        for log, item in rows
    ]


@router.get("/transactions/export.csv")
def export_transactions_csv(
    transaction_type: Optional[TransactionTypeEnum] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(TransactionLog, Item).join(Item, TransactionLog.item_id == Item.item_id)

    if transaction_type:
        query = query.filter(TransactionLog.transaction_type == transaction_type)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Item.item_name.ilike(pattern),
                Item.item_code.ilike(pattern),
                TransactionLog.reference_no.ilike(pattern),
                TransactionLog.notes.ilike(pattern),
                TransactionLog.produced_by.ilike(pattern),
            )
        )

    rows = query.order_by(TransactionLog.created_at.desc()).all()

    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "created_at",
            "transaction_type",
            "item_code",
            "item_name",
            "category",
            "quantity_change",
            "quantity_before",
            "quantity_after",
            "reference_no",
            "produced_by",
            "notes",
        ]
    )
    for log, item in rows:
        writer.writerow(
            [
                log.created_at.isoformat(),
                log.transaction_type.value,
                item.item_code,
                item.item_name,
                item.category.value,
                float(log.quantity_change),
                "" if log.quantity_before is None else float(log.quantity_before),
                "" if log.quantity_after is None else float(log.quantity_after),
                log.reference_no or "",
                log.produced_by or "",
                log.notes or "",
            ]
        )

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="transactions-export.csv"'},
    )


@router.put("/transactions/{log_id}", response_model=TransactionLogResponse)
def update_transaction_notes(
    log_id: uuid.UUID,
    payload: TransactionLogUpdate,
    db: Session = Depends(get_db),
):
    """Update the notes field of a transaction log entry."""
    log = db.query(TransactionLog).filter(TransactionLog.log_id == log_id).first()
    if not log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    item = db.query(Item).filter(Item.item_id == log.item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    log.notes = payload.notes
    db.commit()
    db.refresh(log)

    return TransactionLogResponse(
        log_id=log.log_id,
        item_id=log.item_id,
        item_code=item.item_code,
        item_name=item.item_name,
        item_category=item.category,
        item_unit=item.unit,
        transaction_type=log.transaction_type,
        quantity_change=log.quantity_change,
        quantity_before=log.quantity_before,
        quantity_after=log.quantity_after,
        reference_no=log.reference_no,
        produced_by=log.produced_by,
        notes=log.notes,
        created_at=log.created_at,
    )
