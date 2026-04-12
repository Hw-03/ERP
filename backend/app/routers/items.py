"""Items router for item master CRUD operations."""

from datetime import UTC, datetime
import csv
from io import StringIO
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CategoryEnum, Inventory, Item
from app.schemas import ItemCreate, ItemResponse, ItemUpdate, ItemWithInventory

router = APIRouter()


def _build_item_query(db: Session):
    return db.query(Item, Inventory).outerjoin(Inventory, Item.item_id == Inventory.item_id)


@router.post("/", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
def create_item(payload: ItemCreate, db: Session = Depends(get_db)):
    existing = db.query(Item).filter(Item.item_code == payload.item_code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"품목 코드 '{payload.item_code}'가 이미 존재합니다.",
        )

    item = Item(
        item_code=payload.item_code,
        item_name=payload.item_name,
        spec=payload.spec,
        category=payload.category,
        unit=payload.unit,
        barcode=payload.barcode,
        legacy_file_type=payload.legacy_file_type,
        legacy_part=payload.legacy_part,
        legacy_item_type=payload.legacy_item_type,
        legacy_model=payload.legacy_model,
        supplier=payload.supplier,
        min_stock=payload.min_stock,
    )
    db.add(item)
    db.flush()

    inventory = Inventory(item_id=item.item_id, quantity=0)
    db.add(inventory)

    db.commit()
    db.refresh(item)
    return item


@router.get("/", response_model=List[ItemWithInventory])
def list_items(
    category: Optional[CategoryEnum] = Query(None, description="카테고리 필터"),
    search: Optional[str] = Query(None, description="품목명, 품목코드, 사양, 위치, 바코드 검색"),
    legacy_file_type: Optional[str] = Query(None, description="레거시 파일 구분 필터"),
    legacy_part: Optional[str] = Query(None, description="레거시 파트 필터"),
    legacy_model: Optional[str] = Query(None, description="레거시 모델 필터"),
    legacy_item_type: Optional[str] = Query(None, description="레거시 품목 유형 필터"),
    barcode: Optional[str] = Query(None, description="바코드 검색"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    query = _build_item_query(db)

    if category:
        query = query.filter(Item.category == category)

    if legacy_file_type:
        query = query.filter(Item.legacy_file_type == legacy_file_type)

    if legacy_part:
        query = query.filter(Item.legacy_part == legacy_part)

    if legacy_model:
        query = query.filter(Item.legacy_model == legacy_model)

    if legacy_item_type:
        query = query.filter(Item.legacy_item_type == legacy_item_type)

    if barcode:
        query = query.filter(Item.barcode == barcode)

    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Item.item_name.ilike(pattern),
                Item.item_code.ilike(pattern),
                Item.spec.ilike(pattern),
                Item.barcode.ilike(pattern),
                Inventory.location.ilike(pattern),
            )
        )

    rows = query.order_by(Item.category, Item.item_code).offset(skip).limit(limit).all()

    return [
        ItemWithInventory(
            item_id=item.item_id,
            item_code=item.item_code,
            item_name=item.item_name,
            spec=item.spec,
            category=item.category,
            unit=item.unit,
            barcode=item.barcode,
            legacy_file_type=item.legacy_file_type,
            legacy_part=item.legacy_part,
            legacy_item_type=item.legacy_item_type,
            legacy_model=item.legacy_model,
            supplier=item.supplier,
            min_stock=item.min_stock,
            created_at=item.created_at,
            updated_at=item.updated_at,
            quantity=inventory.quantity if inventory else 0,
            location=inventory.location if inventory else None,
        )
        for item, inventory in rows
    ]


@router.get("/export.csv")
def export_items_csv(db: Session = Depends(get_db)):
    rows = _build_item_query(db).order_by(Item.item_code).all()

    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["item_code", "item_name", "category", "spec", "unit", "quantity", "location", "updated_at"])

    for item, inventory in rows:
        writer.writerow(
            [
                item.item_code,
                item.item_name,
                item.category.value,
                item.spec or "",
                item.unit,
                float(inventory.quantity) if inventory else 0,
                inventory.location if inventory else "",
                item.updated_at.isoformat(),
            ]
        )

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="items-export.csv"'},
    )


@router.get("/{item_id}", response_model=ItemWithInventory)
def get_item(item_id: uuid.UUID, db: Session = Depends(get_db)):
    row = _build_item_query(db).filter(Item.item_id == item_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    item, inventory = row
    return ItemWithInventory(
        item_id=item.item_id,
        item_code=item.item_code,
        item_name=item.item_name,
        spec=item.spec,
        category=item.category,
        unit=item.unit,
        barcode=item.barcode,
        legacy_file_type=item.legacy_file_type,
        legacy_part=item.legacy_part,
        legacy_item_type=item.legacy_item_type,
        legacy_model=item.legacy_model,
        supplier=item.supplier,
        min_stock=item.min_stock,
        created_at=item.created_at,
        updated_at=item.updated_at,
        quantity=inventory.quantity if inventory else 0,
        location=inventory.location if inventory else None,
    )


@router.put("/{item_id}", response_model=ItemResponse)
def update_item(item_id: uuid.UUID, payload: ItemUpdate, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.item_id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    if payload.item_name is not None:
        item.item_name = payload.item_name
    if payload.spec is not None:
        item.spec = payload.spec
    if payload.category is not None:
        item.category = payload.category
    if payload.unit is not None:
        item.unit = payload.unit
    if payload.barcode is not None:
        item.barcode = payload.barcode
    if payload.legacy_file_type is not None:
        item.legacy_file_type = payload.legacy_file_type
    if payload.legacy_part is not None:
        item.legacy_part = payload.legacy_part
    if payload.legacy_item_type is not None:
        item.legacy_item_type = payload.legacy_item_type
    if payload.legacy_model is not None:
        item.legacy_model = payload.legacy_model
    if payload.supplier is not None:
        item.supplier = payload.supplier
    if payload.min_stock is not None:
        item.min_stock = payload.min_stock

    item.updated_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    db.refresh(item)
    return item
