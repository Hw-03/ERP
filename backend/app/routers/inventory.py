"""
Inventory Router — 재고 현황 조회 및 직접 입고
"""

import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, Inventory, TransactionLog, CategoryEnum, TransactionTypeEnum
from app.schemas import (
    InventoryReceive, InventoryResponse,
    CategorySummary, InventorySummaryResponse,
    TransactionLogResponse,
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

# 제조 흐름 순서
CATEGORY_ORDER = [
    CategoryEnum.RM, CategoryEnum.TA, CategoryEnum.TF,
    CategoryEnum.HA, CategoryEnum.HF,
    CategoryEnum.VA, CategoryEnum.VF,
    CategoryEnum.BA, CategoryEnum.BF,
    CategoryEnum.FG, CategoryEnum.UK,
]


@router.get("/summary", response_model=InventorySummaryResponse)
def get_inventory_summary(db: Session = Depends(get_db)):
    """
    카테고리별 재고 현황 집계 — 대시보드 메인 데이터.
    제조 흐름 순서(RM→...→FG→UK)로 반환.
    """
    # 카테고리별 품목 수 및 총 재고량 집계
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

    # dict로 변환
    summary_map = {
        row.category: {
            "item_count": row.item_count,
            "total_quantity": Decimal(str(row.total_quantity)),
        }
        for row in rows
    }

    # 전체 통계
    total_items = sum(v["item_count"] for v in summary_map.values())
    total_quantity = sum(v["total_quantity"] for v in summary_map.values())
    uk_count = summary_map.get(CategoryEnum.UK, {}).get("item_count", 0)

    # 순서에 맞게 카테고리 요약 생성 (데이터 없는 카테고리도 0으로 포함)
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
    )


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

    log = TransactionLog(
        item_id=payload.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=payload.quantity,
        quantity_before=qty_before,
        quantity_after=inventory.quantity,
        reference_no=payload.reference_no,
        produced_by=payload.produced_by,
        notes=payload.notes,
    )
    db.add(log)
    db.commit()
    db.refresh(inventory)
    return inventory


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


@router.get("/transactions", response_model=List[TransactionLogResponse])
def list_transactions(
    item_id: Optional[uuid.UUID] = Query(None),
    transaction_type: Optional[TransactionTypeEnum] = Query(None),
    reference_no: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """거래 이력 조회. 품목/유형/참조번호로 필터링."""
    query = db.query(TransactionLog)

    if item_id:
        query = query.filter(TransactionLog.item_id == item_id)
    if transaction_type:
        query = query.filter(TransactionLog.transaction_type == transaction_type)
    if reference_no:
        query = query.filter(TransactionLog.reference_no == reference_no)

    return (
        query.order_by(TransactionLog.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
