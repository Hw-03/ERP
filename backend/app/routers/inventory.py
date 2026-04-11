"""
Inventory Router — 재고 현황 조회, 직접 입고, 출하, 재고 조정
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, Inventory, TransactionLog, CategoryEnum, TransactionTypeEnum
from app.schemas import (
    InventoryReceive, InventoryShip, InventoryAdjust, InventoryResponse,
    CategorySummary, InventorySummaryResponse,
    TransactionLogResponse, TransactionLogWithItem,
)

router = APIRouter()

# 카테고리 한글 라벨 (제조 흐름 순서)
CATEGORY_LABELS = {
    CategoryEnum.RM: "원자재 (Raw Material)",
    CategoryEnum.TA: "튜브 반제품 (Tube Ass'y)",
    CategoryEnum.TF: "완성 튜브 (Tube Final)",
    CategoryEnum.HA: "고압 반제품 (High-voltage Ass'y)",
    CategoryEnum.HF: "고압 완제품 (High-voltage Final)",
    CategoryEnum.VA: "진공 반제품 (Vacuum Ass'y)",
    CategoryEnum.VF: "진공 완제품 (Vacuum Final)",
    CategoryEnum.BA: "조립 반제품 (Body Ass'y)",
    CategoryEnum.BF: "조립 완제품 (Body Final)",
    CategoryEnum.FG: "최종 출하품 (Finished Good)",
    CategoryEnum.UK: "미분류 자재 (Unknown)",
}

CATEGORY_ORDER = [
    CategoryEnum.RM, CategoryEnum.TA, CategoryEnum.TF,
    CategoryEnum.HA, CategoryEnum.HF,
    CategoryEnum.VA, CategoryEnum.VF,
    CategoryEnum.BA, CategoryEnum.BF,
    CategoryEnum.FG, CategoryEnum.UK,
]


# ---------------------------------------------------------------------------
# GET /summary — 카테고리별 재고 집계 (대시보드)
# ---------------------------------------------------------------------------

@router.get("/summary", response_model=InventorySummaryResponse)
def get_inventory_summary(db: Session = Depends(get_db)):
    """
    카테고리별 재고 현황 집계 — 대시보드 메인 데이터.
    안전재고 기준 부족/품절 건수도 함께 반환.
    """
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

    total_items = sum(v["item_count"] for v in summary_map.values())
    total_quantity = sum(v["total_quantity"] for v in summary_map.values())
    uk_count = summary_map.get(CategoryEnum.UK, {}).get("item_count", 0)

    # 품절 건수: quantity <= 0
    out_of_stock = (
        db.query(func.count(Item.item_id))
        .outerjoin(Inventory, Item.item_id == Inventory.item_id)
        .filter(func.coalesce(Inventory.quantity, 0) <= 0)
        .scalar() or 0
    )

    # 재고부족 건수: 0 < quantity <= safety_stock (safety_stock이 설정된 품목만)
    low_stock = (
        db.query(func.count(Item.item_id))
        .join(Inventory, Item.item_id == Inventory.item_id)
        .filter(
            Item.safety_stock.isnot(None),
            Inventory.quantity > 0,
            Inventory.quantity <= Item.safety_stock,
        )
        .scalar() or 0
    )

    categories = []
    for cat in CATEGORY_ORDER:
        data = summary_map.get(cat, {"item_count": 0, "total_quantity": Decimal("0")})
        categories.append(CategorySummary(
            category=cat,
            category_label=CATEGORY_LABELS[cat],
            item_count=data["item_count"],
            total_quantity=data["total_quantity"],
        ))

    return InventorySummaryResponse(
        categories=categories,
        total_items=total_items,
        total_quantity=total_quantity,
        uk_item_count=uk_count,
        low_stock_count=int(low_stock),
        out_of_stock_count=int(out_of_stock),
    )


# ---------------------------------------------------------------------------
# POST /receive — 직접 입고
# ---------------------------------------------------------------------------

@router.post("/receive", response_model=InventoryResponse, status_code=status.HTTP_201_CREATED)
def receive_inventory(payload: InventoryReceive, db: Session = Depends(get_db)):
    """직접 입고 처리. 재고를 즉시 증가시키고 TransactionLog에 기록."""
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    inventory = db.query(Inventory).filter(Inventory.item_id == payload.item_id).first()
    if not inventory:
        inventory = Inventory(item_id=payload.item_id, quantity=Decimal("0"))
        db.add(inventory)
        db.flush()

    qty_before = inventory.quantity
    inventory.quantity = qty_before + payload.quantity
    if payload.location:
        inventory.location = payload.location

    db.add(TransactionLog(
        item_id=payload.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=payload.quantity,
        quantity_before=qty_before,
        quantity_after=inventory.quantity,
        reference_no=payload.reference_no,
        produced_by=payload.produced_by,
        notes=payload.notes,
    ))
    db.commit()
    db.refresh(inventory)
    return inventory


# ---------------------------------------------------------------------------
# POST /ship — 출하 처리
# ---------------------------------------------------------------------------

@router.post("/ship", response_model=InventoryResponse, status_code=status.HTTP_201_CREATED)
def ship_inventory(payload: InventoryShip, db: Session = Depends(get_db)):
    """
    출하 처리. 재고를 차감하고 TransactionLog(SHIP)에 기록.
    재고 부족 시 422 반환.
    """
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    inventory = db.query(Inventory).filter(Inventory.item_id == payload.item_id).first()
    current_qty = inventory.quantity if inventory else Decimal("0")

    if current_qty < payload.quantity:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "재고 부족으로 출하할 수 없습니다.",
                "item_code": item.item_code,
                "item_name": item.item_name,
                "required": float(payload.quantity),
                "current_stock": float(current_qty),
                "shortage": float(payload.quantity - current_qty),
            }
        )

    if not inventory:
        inventory = Inventory(item_id=payload.item_id, quantity=Decimal("0"))
        db.add(inventory)
        db.flush()

    qty_before = inventory.quantity
    inventory.quantity = qty_before - payload.quantity

    db.add(TransactionLog(
        item_id=payload.item_id,
        transaction_type=TransactionTypeEnum.SHIP,
        quantity_change=-payload.quantity,
        quantity_before=qty_before,
        quantity_after=inventory.quantity,
        reference_no=payload.reference_no,
        produced_by=payload.produced_by,
        notes=payload.notes,
    ))
    db.commit()
    db.refresh(inventory)
    return inventory


# ---------------------------------------------------------------------------
# POST /adjust — 재고 조정
# ---------------------------------------------------------------------------

@router.post("/adjust", response_model=InventoryResponse, status_code=status.HTTP_200_OK)
def adjust_inventory(payload: InventoryAdjust, db: Session = Depends(get_db)):
    """
    재고 조정. 절대 수량으로 재고를 설정하고 변동량을 TransactionLog(ADJUST)에 기록.
    """
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    inventory = db.query(Inventory).filter(Inventory.item_id == payload.item_id).first()
    if not inventory:
        inventory = Inventory(item_id=payload.item_id, quantity=Decimal("0"))
        db.add(inventory)
        db.flush()

    qty_before = inventory.quantity
    qty_change = payload.quantity_absolute - qty_before
    inventory.quantity = payload.quantity_absolute

    db.add(TransactionLog(
        item_id=payload.item_id,
        transaction_type=TransactionTypeEnum.ADJUST,
        quantity_change=qty_change,
        quantity_before=qty_before,
        quantity_after=inventory.quantity,
        reference_no=payload.reference_no,
        produced_by=payload.produced_by,
        notes=payload.notes or f"재고 조정: {float(qty_before)} → {float(payload.quantity_absolute)}",
    ))
    db.commit()
    db.refresh(inventory)
    return inventory


# ---------------------------------------------------------------------------
# GET / — 재고 목록
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[InventoryResponse])
def list_inventory(
    category: Optional[CategoryEnum] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """전체 재고 목록 조회."""
    query = db.query(Inventory).join(Item, Inventory.item_id == Item.item_id)
    if category:
        query = query.filter(Item.category == category)
    return query.offset(skip).limit(limit).all()


# ---------------------------------------------------------------------------
# GET /transactions — 거래 이력
# ---------------------------------------------------------------------------

@router.get("/transactions", response_model=List[TransactionLogWithItem])
def list_transactions(
    item_id: Optional[uuid.UUID] = Query(None, description="품목 ID 필터"),
    transaction_type: Optional[TransactionTypeEnum] = Query(None, description="트랜잭션 유형"),
    produced_by: Optional[str] = Query(None, description="처리자 필터"),
    reference_no: Optional[str] = Query(None, description="참조번호 필터"),
    date_from: Optional[datetime] = Query(None, description="시작일 (ISO 8601)"),
    date_to: Optional[datetime] = Query(None, description="종료일 (ISO 8601)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """
    거래 이력 조회.
    품목ID / 유형 / 처리자 / 참조번호 / 날짜 범위로 필터링.
    """
    query = db.query(TransactionLog, Item).join(Item, TransactionLog.item_id == Item.item_id)

    if item_id:
        query = query.filter(TransactionLog.item_id == item_id)
    if transaction_type:
        query = query.filter(TransactionLog.transaction_type == transaction_type)
    if produced_by:
        query = query.filter(TransactionLog.produced_by.ilike(f"%{produced_by}%"))
    if reference_no:
        query = query.filter(TransactionLog.reference_no.ilike(f"%{reference_no}%"))
    if date_from:
        query = query.filter(TransactionLog.created_at >= date_from)
    if date_to:
        query = query.filter(TransactionLog.created_at <= date_to)

    rows = (
        query.order_by(TransactionLog.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    result = []
    for log, item in rows:
        result.append(TransactionLogWithItem(
            log_id=log.log_id,
            item_id=log.item_id,
            transaction_type=log.transaction_type,
            quantity_change=log.quantity_change,
            quantity_before=log.quantity_before,
            quantity_after=log.quantity_after,
            reference_no=log.reference_no,
            produced_by=log.produced_by,
            notes=log.notes,
            created_at=log.created_at,
            item_code=item.item_code,
            item_name=item.item_name,
            category=item.category,
        ))

    return result
