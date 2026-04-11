"""Items router for item master CRUD operations."""

from datetime import UTC, datetime
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CategoryEnum, Inventory, Item
from app.schemas import ItemCreate, ItemResponse, ItemUpdate, ItemWithInventory

router = APIRouter()


@router.post("/", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
def create_item(payload: ItemCreate, db: Session = Depends(get_db)):
    """Create a new item and initialize inventory with zero stock."""

    existing = db.query(Item).filter(Item.item_code == payload.item_code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"품목 코드 '{payload.item_code}'는 이미 존재합니다.",
        )

    item = Item(
        item_code=payload.item_code,
        item_name=payload.item_name,
        spec=payload.spec,
        category=payload.category,
        unit=payload.unit,
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
    search: Optional[str] = Query(None, description="품목명, 품목코드, 사양, 위치 검색"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    """List items with optional category and search filters."""

    query = db.query(Item).outerjoin(Inventory, Item.item_id == Inventory.item_id)

    if category:
        query = query.filter(Item.category == category)

    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Item.item_name.ilike(pattern),
                Item.item_code.ilike(pattern),
                Item.spec.ilike(pattern),
                Inventory.location.ilike(pattern),
            )
        )

    items = query.order_by(Item.category, Item.item_code).offset(skip).limit(limit).all()

    return [
        ItemWithInventory(
            item_id=item.item_id,
            item_code=item.item_code,
            item_name=item.item_name,
            spec=item.spec,
            category=item.category,
            unit=item.unit,
            created_at=item.created_at,
            updated_at=item.updated_at,
            quantity=item.inventory.quantity if item.inventory else 0,
            location=item.inventory.location if item.inventory else None,
        )
        for item in items
    ]


@router.get("/{item_id}", response_model=ItemWithInventory)
def get_item(item_id: uuid.UUID, db: Session = Depends(get_db)):
    """Return a single item with inventory fields."""

    item = db.query(Item).filter(Item.item_id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    return ItemWithInventory(
        item_id=item.item_id,
        item_code=item.item_code,
        item_name=item.item_name,
        spec=item.spec,
        category=item.category,
        unit=item.unit,
        created_at=item.created_at,
        updated_at=item.updated_at,
        quantity=item.inventory.quantity if item.inventory else 0,
        location=item.inventory.location if item.inventory else None,
    )


@router.put("/{item_id}", response_model=ItemResponse)
def update_item(item_id: uuid.UUID, payload: ItemUpdate, db: Session = Depends(get_db)):
    """Update editable item fields."""

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

    item.updated_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: uuid.UUID, db: Session = Depends(get_db)):
    """Delete an item and cascade to related inventory and BOM rows."""

    item = db.query(Item).filter(Item.item_id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    db.delete(item)
    db.commit()
