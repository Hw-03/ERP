"""
Items Router — 품목 마스터 CRUD
"""

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, Inventory, CategoryEnum
from app.schemas import ItemCreate, ItemUpdate, ItemResponse, ItemWithInventory

router = APIRouter()


@router.post("/", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
def create_item(payload: ItemCreate, db: Session = Depends(get_db)):
    """품목 등록. category 미지정 시 UK(미분류)로 자동 설정."""
    # 품목 코드 중복 확인
    existing = db.query(Item).filter(Item.item_code == payload.item_code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"품목 코드 '{payload.item_code}'가 이미 존재합니다."
        )

    item = Item(
        item_code=payload.item_code,
        item_name=payload.item_name,
        spec=payload.spec,
        category=payload.category,
        unit=payload.unit,
    )
    db.add(item)
    db.flush()  # item_id 확보

    # 재고 레코드 초기화 (0으로 시작)
    inventory = Inventory(item_id=item.item_id, quantity=0)
    db.add(inventory)

    db.commit()
    db.refresh(item)
    return item


@router.get("/", response_model=List[ItemWithInventory])
def list_items(
    category: Optional[CategoryEnum] = Query(None, description="카테고리 필터"),
    search: Optional[str] = Query(None, description="품명/품목코드/바코드 검색"),
    legacy_file_type: Optional[str] = Query(None, description="레거시 fileType 필터"),
    legacy_part: Optional[str] = Query(None, description="레거시 part 필터"),
    legacy_model: Optional[str] = Query(None, description="레거시 모델 필터"),
    stock_status: Optional[str] = Query(None, description="재고상태: out/low/normal"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """품목 목록 조회. category / 검색어 / 레거시 필터 / 재고상태로 필터링 가능."""
    query = db.query(Item)

    if category:
        query = query.filter(Item.category == category)

    if search:
        pattern = f"%{search}%"
        query = query.filter(
            Item.item_name.ilike(pattern)
            | Item.item_code.ilike(pattern)
            | Item.barcode.ilike(pattern)
            | Item.supplier.ilike(pattern)
            | Item.legacy_item_type.ilike(pattern)
        )

    if legacy_file_type:
        query = query.filter(Item.legacy_file_type == legacy_file_type)

    if legacy_part:
        query = query.filter(Item.legacy_part == legacy_part)

    if legacy_model:
        query = query.filter(Item.legacy_model.ilike(f"%{legacy_model}%"))

    items = query.order_by(Item.category, Item.item_code).offset(skip).limit(limit).all()

    # 재고 상태 필터는 Python에서 처리 (Numeric 비교 복잡성 회피)
    result = []
    for item in items:
        inv_qty = item.inventory.quantity if item.inventory else 0
        inv_loc = item.inventory.location if item.inventory else None
        ss = item.safety_stock

        if float(inv_qty) <= 0:
            status = "out"
        elif ss is not None and float(inv_qty) <= float(ss):
            status = "low"
        else:
            status = "normal"

        if stock_status and status != stock_status:
            continue

        result.append(ItemWithInventory(
            item_id=item.item_id,
            item_code=item.item_code,
            item_name=item.item_name,
            spec=item.spec,
            category=item.category,
            unit=item.unit,
            safety_stock=item.safety_stock,
            barcode=item.barcode,
            supplier=item.supplier,
            legacy_file_type=item.legacy_file_type,
            legacy_part=item.legacy_part,
            legacy_item_type=item.legacy_item_type,
            legacy_model=item.legacy_model,
            created_at=item.created_at,
            updated_at=item.updated_at,
            quantity=inv_qty,
            location=inv_loc,
            stock_status=status,
        ))

    return result


@router.get("/{item_id}", response_model=ItemWithInventory)
def get_item(item_id: uuid.UUID, db: Session = Depends(get_db)):
    """단일 품목 상세 조회."""
    item = db.query(Item).filter(Item.item_id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    inv_qty = item.inventory.quantity if item.inventory else 0
    inv_loc = item.inventory.location if item.inventory else None

    inv_qty = item.inventory.quantity if item.inventory else 0
    ss = item.safety_stock
    if float(inv_qty) <= 0:
        status = "out"
    elif ss is not None and float(inv_qty) <= float(ss):
        status = "low"
    else:
        status = "normal"

    return ItemWithInventory(
        item_id=item.item_id,
        item_code=item.item_code,
        item_name=item.item_name,
        spec=item.spec,
        category=item.category,
        unit=item.unit,
        safety_stock=item.safety_stock,
        barcode=item.barcode,
        supplier=item.supplier,
        legacy_file_type=item.legacy_file_type,
        legacy_part=item.legacy_part,
        legacy_item_type=item.legacy_item_type,
        legacy_model=item.legacy_model,
        created_at=item.created_at,
        updated_at=item.updated_at,
        quantity=inv_qty,
        location=inv_loc,
        stock_status=status,
    )


@router.put("/{item_id}", response_model=ItemResponse)
def update_item(item_id: uuid.UUID, payload: ItemUpdate, db: Session = Depends(get_db)):
    """품목 정보 수정. UK 항목의 카테고리 재지정에 주로 사용."""
    item = db.query(Item).filter(Item.item_id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    for field in ["item_name", "spec", "category", "unit", "safety_stock",
                  "barcode", "supplier", "legacy_file_type", "legacy_part",
                  "legacy_item_type", "legacy_model"]:
        val = getattr(payload, field, None)
        if val is not None:
            setattr(item, field, val)

    item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: uuid.UUID, db: Session = Depends(get_db)):
    """품목 삭제 (연결된 재고/BOM/이력 CASCADE 삭제)."""
    item = db.query(Item).filter(Item.item_id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    db.delete(item)
    db.commit()
