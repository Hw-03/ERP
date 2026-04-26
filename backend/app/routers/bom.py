"""BOM router for Bill of Materials CRUD and tree queries."""

import uuid
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import BOM, Inventory, Item
from app.routers._errors import ErrorCode, http_error
from app.schemas import BOMCreate, BOMDetailResponse, BOMResponse, BOMTreeNode, BOMUpdate

router = APIRouter()


@router.get("", response_model=List[BOMDetailResponse])
def get_all_bom(db: Session = Depends(get_db)):
    """Return all BOM relationships with parent and child item names."""
    entries = db.query(BOM).all()
    if not entries:
        return []

    needed_ids = {e.parent_item_id for e in entries} | {e.child_item_id for e in entries}
    items_map = {
        i.item_id: i
        for i in db.query(Item).filter(Item.item_id.in_(list(needed_ids))).all()
    }

    result = []
    for entry in entries:
        parent = items_map.get(entry.parent_item_id)
        child = items_map.get(entry.child_item_id)
        if not parent or not child:
            continue
        result.append(BOMDetailResponse(
            bom_id=entry.bom_id,
            parent_item_id=entry.parent_item_id,
            parent_item_name=parent.item_name,
            parent_erp_code=parent.erp_code,
            child_item_id=entry.child_item_id,
            child_item_name=child.item_name,
            child_erp_code=child.erp_code,
            quantity=entry.quantity,
            unit=entry.unit,
        ))
    return result


@router.post("", response_model=BOMResponse, status_code=status.HTTP_201_CREATED)
def create_bom(payload: BOMCreate, db: Session = Depends(get_db)):
    """Create a BOM row for a parent and child item."""

    if payload.parent_item_id == payload.child_item_id:
        raise http_error(
            status.HTTP_400_BAD_REQUEST,
            ErrorCode.BAD_REQUEST,
            "상위 품목과 하위 품목은 같을 수 없습니다.",
        )

    parent = db.query(Item).filter(Item.item_id == payload.parent_item_id).first()
    if not parent:
        raise http_error(404, ErrorCode.NOT_FOUND, "상위 품목을 찾을 수 없습니다.")

    child = db.query(Item).filter(Item.item_id == payload.child_item_id).first()
    if not child:
        raise http_error(404, ErrorCode.NOT_FOUND, "하위 품목을 찾을 수 없습니다.")

    existing = (
        db.query(BOM)
        .filter(
            BOM.parent_item_id == payload.parent_item_id,
            BOM.child_item_id == payload.child_item_id,
        )
        .first()
    )
    if existing:
        raise http_error(
            status.HTTP_409_CONFLICT,
            ErrorCode.CONFLICT,
            "동일한 BOM 항목이 이미 존재합니다.",
        )

    if _is_circular(db, payload.parent_item_id, payload.child_item_id):
        raise http_error(
            status.HTTP_400_BAD_REQUEST,
            ErrorCode.BAD_REQUEST,
            "순환 참조가 발생합니다. BOM 구성을 확인해 주세요.",
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


@router.patch("/{bom_id}", response_model=BOMResponse)
def update_bom(bom_id: uuid.UUID, payload: BOMUpdate, db: Session = Depends(get_db)):
    """Update quantity or unit of an existing BOM row."""
    bom_entry = db.query(BOM).filter(BOM.bom_id == bom_id).first()
    if not bom_entry:
        raise http_error(404, ErrorCode.NOT_FOUND, "BOM 항목을 찾을 수 없습니다.")
    if payload.quantity is not None:
        bom_entry.quantity = payload.quantity
    if payload.unit is not None:
        bom_entry.unit = payload.unit
    db.commit()
    db.refresh(bom_entry)
    return bom_entry


@router.get("/{parent_item_id}", response_model=List[BOMResponse])
def get_bom_flat(parent_item_id: uuid.UUID, db: Session = Depends(get_db)):
    """Return direct child BOM rows for a given parent item."""

    item = db.query(Item).filter(Item.item_id == parent_item_id).first()
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    return db.query(BOM).filter(BOM.parent_item_id == parent_item_id).all()


@router.get("/{parent_item_id}/tree", response_model=BOMTreeNode)
def get_bom_tree(parent_item_id: uuid.UUID, db: Session = Depends(get_db)):
    """Return a recursive BOM tree for a given parent item."""

    item = db.query(Item).filter(Item.item_id == parent_item_id).first()
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    inv = db.query(Inventory).filter(Inventory.item_id == parent_item_id).first()
    current_stock = inv.quantity if inv else Decimal("0")

    return _build_tree(db, item, Decimal("1"), current_stock, depth=0)


@router.delete("/{bom_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bom(bom_id: uuid.UUID, db: Session = Depends(get_db)):
    """Delete a BOM row."""

    bom_entry = db.query(BOM).filter(BOM.bom_id == bom_id).first()
    if not bom_entry:
        raise http_error(404, ErrorCode.NOT_FOUND, "BOM 항목을 찾을 수 없습니다.")
    db.delete(bom_entry)
    db.commit()


@router.get("/where-used/{item_id}", response_model=List[BOMDetailResponse])
def get_where_used(item_id: uuid.UUID, db: Session = Depends(get_db)):
    """주어진 품목을 child 로 사용하는 parent BOM 행 목록 (역방향 추적).

    - 직접 사용처만 반환 (1단계). 다단계 추적은 호출측에서 재귀.
    - 응답은 `BOMDetailResponse` 배열 — 기존 BOM 조회와 동일 모양.
    """
    item = db.query(Item).filter(Item.item_id == item_id).first()
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    entries = db.query(BOM).filter(BOM.child_item_id == item_id).all()
    if not entries:
        return []

    parent_ids = list({e.parent_item_id for e in entries})
    parents = {
        p.item_id: p
        for p in db.query(Item).filter(Item.item_id.in_(parent_ids)).all()
    }

    result: List[BOMDetailResponse] = []
    for entry in entries:
        parent = parents.get(entry.parent_item_id)
        if not parent:
            continue
        result.append(BOMDetailResponse(
            bom_id=entry.bom_id,
            parent_item_id=entry.parent_item_id,
            parent_item_name=parent.item_name,
            parent_erp_code=parent.erp_code,
            child_item_id=entry.child_item_id,
            child_item_name=item.item_name,
            child_erp_code=item.erp_code,
            quantity=entry.quantity,
            unit=entry.unit,
        ))
    return result


def _build_tree(
    db: Session,
    item: Item,
    required_quantity: Decimal,
    current_stock: Decimal,
    depth: int,
    visited: set | None = None,
) -> BOMTreeNode:
    """Build a recursive BOM tree with current stock."""

    if visited is None:
        visited = set()

    if item.item_id in visited or depth > 10:
        return BOMTreeNode(
            item_id=item.item_id,
            erp_code=item.erp_code,
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
        child_inv = db.query(Inventory).filter(Inventory.item_id == entry.child_item_id).first()
        child_stock = child_inv.quantity if child_inv else Decimal("0")
        child_node = _build_tree(
            db,
            child_item,
            entry.quantity * required_quantity,
            child_stock,
            depth + 1,
            visited,
        )
        children.append(child_node)

    return BOMTreeNode(
        item_id=item.item_id,
        erp_code=item.erp_code,
        item_name=item.item_name,
        category=item.category,
        unit=item.unit,
        required_quantity=required_quantity,
        current_stock=current_stock,
        children=children,
    )


def _is_circular(db: Session, parent_id: uuid.UUID, new_child_id: uuid.UUID) -> bool:
    """Check whether adding a child would create a circular BOM reference."""

    visited = set()
    stack = [new_child_id]
    while stack:
        current = stack.pop()
        if current == parent_id:
            return True
        if current in visited:
            continue
        visited.add(current)
        children = db.query(BOM.child_item_id).filter(BOM.parent_item_id == current).all()
        stack.extend(child_id for (child_id,) in children)
    return False
