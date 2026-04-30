"""BOM router for Bill of Materials CRUD and tree queries."""

import uuid
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import BOM, Inventory, Item
from app.routers._errors import ErrorCode, http_error
from app.schemas import BOMCreate, BOMDetailResponse, BOMResponse, BOMTreeNode, BOMUpdate
from app.services import audit
from app.services._tx import commit_and_refresh, commit_only
from app.services.bom import BomCache, build_bom_cache

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
def create_bom(payload: BOMCreate, request: Request, db: Session = Depends(get_db)):
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
    db.flush()

    audit.record(
        db,
        request=request,
        action="bom.create",
        target_type="bom",
        target_id=str(bom_entry.bom_id),
        payload_summary=f"{parent.item_name} ← {child.item_name} ×{payload.quantity}{payload.unit}",
    )

    commit_and_refresh(db, bom_entry)
    return bom_entry


@router.patch("/{bom_id}", response_model=BOMResponse)
def update_bom(bom_id: uuid.UUID, payload: BOMUpdate, request: Request, db: Session = Depends(get_db)):
    """Update quantity or unit of an existing BOM row."""
    bom_entry = db.query(BOM).filter(BOM.bom_id == bom_id).first()
    if not bom_entry:
        raise http_error(404, ErrorCode.NOT_FOUND, "BOM 항목을 찾을 수 없습니다.")

    changed: list[str] = []
    if payload.quantity is not None and bom_entry.quantity != payload.quantity:
        old_qty = bom_entry.quantity
        bom_entry.quantity = payload.quantity
        changed.append(f"qty {old_qty}→{payload.quantity}")
    if payload.unit is not None and bom_entry.unit != payload.unit:
        bom_entry.unit = payload.unit
        changed.append(f"unit→{payload.unit}")

    if changed:
        audit.record(
            db,
            request=request,
            action="bom.update",
            target_type="bom",
            target_id=str(bom_entry.bom_id),
            payload_summary=", ".join(changed),
        )

    commit_and_refresh(db, bom_entry)
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
    """Return a recursive BOM tree for a given parent item.

    진입 시 BOM 캐시 1회 + 후손 후보 Items/Inventory IN 1회씩으로 N+1 제거.
    """
    bom_cache = build_bom_cache(db)
    needed_ids = _collect_descendants(parent_item_id, bom_cache, set())
    needed_ids.add(parent_item_id)

    items_map = {
        i.item_id: i
        for i in db.query(Item).filter(Item.item_id.in_(list(needed_ids))).all()
    }
    if parent_item_id not in items_map:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    invs_map = {
        i.item_id: i
        for i in db.query(Inventory).filter(Inventory.item_id.in_(list(needed_ids))).all()
    }

    return _build_tree_cached(
        items_map[parent_item_id],
        Decimal("1"),
        items_map,
        invs_map,
        bom_cache,
        depth=0,
        visited=set(),
    )


@router.delete("/{bom_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bom(bom_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    """Delete a BOM row."""

    bom_entry = db.query(BOM).filter(BOM.bom_id == bom_id).first()
    if not bom_entry:
        raise http_error(404, ErrorCode.NOT_FOUND, "BOM 항목을 찾을 수 없습니다.")

    audit.record(
        db,
        request=request,
        action="bom.delete",
        target_type="bom",
        target_id=str(bom_entry.bom_id),
        payload_summary=f"parent={bom_entry.parent_item_id} child={bom_entry.child_item_id}",
    )
    db.delete(bom_entry)
    commit_only(db)


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


def _collect_descendants(
    parent_id: uuid.UUID,
    cache: BomCache,
    visited: set,
) -> set:
    """순환 참조와 깊이 10 안전망을 그대로 두고, 캐시에서 모든 후손 id 를 수집."""
    if parent_id in visited:
        return set()
    visited = visited | {parent_id}
    out: set = set()
    for child_id, _qty in cache.get(parent_id, []):
        if child_id in out or child_id in visited:
            continue
        out.add(child_id)
        out.update(_collect_descendants(child_id, cache, visited))
    return out


def _build_tree_cached(
    item: Item,
    required_quantity: Decimal,
    items_map: dict,
    invs_map: dict,
    cache: BomCache,
    depth: int,
    visited: set,
) -> BOMTreeNode:
    """메모리 dict 만 참조하는 순수 재귀 — DB 쿼리 0건."""
    inv = invs_map.get(item.item_id)
    current_stock = inv.quantity if inv else Decimal("0")

    if item.item_id in visited or depth > 10:
        return BOMTreeNode(
            item_id=item.item_id,
            erp_code=item.erp_code,
            item_name=item.item_name,
            process_type_code=item.process_type_code,
            unit=item.unit,
            required_quantity=required_quantity,
            current_stock=current_stock,
            children=[],
        )

    visited = visited | {item.item_id}
    children = []
    for child_id, child_per_unit in cache.get(item.item_id, []):
        child_item = items_map.get(child_id)
        if not child_item:
            continue
        children.append(
            _build_tree_cached(
                child_item,
                child_per_unit * required_quantity,
                items_map,
                invs_map,
                cache,
                depth + 1,
                visited,
            )
        )

    return BOMTreeNode(
        item_id=item.item_id,
        erp_code=item.erp_code,
        item_name=item.item_name,
        process_type_code=item.process_type_code,
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
