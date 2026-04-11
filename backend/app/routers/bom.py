"""
BOM Router — Bill of Materials CRUD + 트리 조회
"""

import uuid
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, BOM, Inventory
from app.schemas import BOMCreate, BOMResponse, BOMTreeNode

router = APIRouter()


@router.post("/", response_model=BOMResponse, status_code=status.HTTP_201_CREATED)
def create_bom(payload: BOMCreate, db: Session = Depends(get_db)):
    """BOM 항목 등록. parent와 child 품목이 모두 존재해야 함."""
    if payload.parent_item_id == payload.child_item_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="상위 품목과 하위 품목은 동일할 수 없습니다."
        )

    # 존재 확인
    parent = db.query(Item).filter(Item.item_id == payload.parent_item_id).first()
    if not parent:
        raise HTTPException(status_code=404, detail="상위 품목을 찾을 수 없습니다.")

    child = db.query(Item).filter(Item.item_id == payload.child_item_id).first()
    if not child:
        raise HTTPException(status_code=404, detail="하위 품목을 찾을 수 없습니다.")

    # 중복 확인
    existing = db.query(BOM).filter(
        BOM.parent_item_id == payload.parent_item_id,
        BOM.child_item_id == payload.child_item_id,
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="해당 BOM 항목이 이미 존재합니다."
        )

    # 순환 참조 간단 체크 (child가 parent를 포함하는지)
    if _is_circular(db, payload.parent_item_id, payload.child_item_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="순환 참조가 발생합니다. BOM 구조를 확인하세요."
        )

    bom_entry = BOM(
        parent_item_id=payload.parent_item_id,
        child_item_id=payload.child_item_id,
        quantity=payload.quantity,
        unit=payload.unit,
        notes=payload.notes,
    )
    db.add(bom_entry)
    db.commit()
    db.refresh(bom_entry)
    return bom_entry


@router.get("/{parent_item_id}", response_model=List[BOMResponse])
def get_bom_flat(parent_item_id: uuid.UUID, db: Session = Depends(get_db)):
    """특정 품목의 직접 하위 BOM 목록 (1단계)."""
    item = db.query(Item).filter(Item.item_id == parent_item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    return db.query(BOM).filter(BOM.parent_item_id == parent_item_id).all()


@router.get("/{parent_item_id}/tree", response_model=BOMTreeNode)
def get_bom_tree(parent_item_id: uuid.UUID, db: Session = Depends(get_db)):
    """BOM 전체 트리 조회 (다단계 재귀)."""
    item = db.query(Item).filter(Item.item_id == parent_item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    inv = db.query(Inventory).filter(Inventory.item_id == parent_item_id).first()
    current_stock = inv.quantity if inv else Decimal("0")

    return _build_tree(db, item, Decimal("1"), current_stock, depth=0)


@router.delete("/{bom_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bom(bom_id: uuid.UUID, db: Session = Depends(get_db)):
    """BOM 항목 삭제."""
    bom_entry = db.query(BOM).filter(BOM.bom_id == bom_id).first()
    if not bom_entry:
        raise HTTPException(status_code=404, detail="BOM 항목을 찾을 수 없습니다.")
    db.delete(bom_entry)
    db.commit()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_tree(
    db: Session,
    item: Item,
    required_quantity: Decimal,
    current_stock: Decimal,
    depth: int,
    visited: set = None,
) -> BOMTreeNode:
    """BOM 트리를 재귀적으로 구성."""
    if visited is None:
        visited = set()

    if item.item_id in visited or depth > 10:
        return BOMTreeNode(
            item_id=item.item_id,
            item_code=item.item_code,
            item_name=item.item_name,
            category=item.category,
            unit=item.unit,
            required_quantity=required_quantity,
            current_stock=current_stock,
            children=[],
        )

    visited = visited | {item.item_id}
    bom_entries = db.query(BOM).filter(BOM.parent_item_id == item.item_id).all()
    children = []

    for entry in bom_entries:
        child_item = db.query(Item).filter(Item.item_id == entry.child_item_id).first()
        if not child_item:
            continue
        child_inv = db.query(Inventory).filter(
            Inventory.item_id == entry.child_item_id
        ).first()
        child_stock = child_inv.quantity if child_inv else Decimal("0")
        child_node = _build_tree(
            db, child_item,
            entry.quantity * required_quantity,
            child_stock,
            depth + 1,
            visited,
        )
        children.append(child_node)

    return BOMTreeNode(
        item_id=item.item_id,
        item_code=item.item_code,
        item_name=item.item_name,
        category=item.category,
        unit=item.unit,
        required_quantity=required_quantity,
        current_stock=current_stock,
        children=children,
    )


def _is_circular(db: Session, parent_id: uuid.UUID, new_child_id: uuid.UUID) -> bool:
    """new_child_id가 이미 parent_id를 하위에 포함하는지 확인 (순환 참조 방지)."""
    visited = set()
    stack = [new_child_id]
    while stack:
        current = stack.pop()
        if current == parent_id:
            return True
        if current in visited:
            continue
        visited.add(current)
        children = db.query(BOM.child_item_id).filter(
            BOM.parent_item_id == current
        ).all()
        stack.extend(c[0] for c in children)
    return False
