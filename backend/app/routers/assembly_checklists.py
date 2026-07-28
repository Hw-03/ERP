"""Mobile assembly checklist template management API."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import (
    AssemblyChecklist,
    AssemblyChecklistItem,
    AssemblyChecklistSection,
    ProductSymbol,
)
from app.routers._errors import ErrorCode, http_error
from app.schemas.assembly_checklist import (
    AssemblyChecklistCreate,
    AssemblyChecklistItemCreate,
    AssemblyChecklistItemMove,
    AssemblyChecklistItemReorder,
    AssemblyChecklistItemUpdate,
    AssemblyChecklistResponse,
    AssemblyChecklistSectionCreate,
)


router = APIRouter()


def _checklist_query(db: Session):
    """Return the common fully-loaded checklist query for latest-state responses."""

    return db.query(AssemblyChecklist).options(
        selectinload(AssemblyChecklist.model),
        selectinload(AssemblyChecklist.sections).selectinload(AssemblyChecklistSection.items),
    )


def _serialize(checklist: AssemblyChecklist) -> dict:
    """Keep API ordering and linked MES model data explicit at the response edge."""

    return {
        "checklist_id": checklist.checklist_id,
        "model_slot": checklist.model_slot,
        "model_name": checklist.model.model_name,
        "sections": [
            {
                "section_id": section.section_id,
                "title": section.title,
                "sort_order": section.sort_order,
                "items": [
                    {
                        "item_id": item.item_id,
                        "content": item.content,
                        "sort_order": item.sort_order,
                    }
                    for item in section.items
                ],
            }
            for section in checklist.sections
        ],
    }


def _get_checklist_by_slot(db: Session, model_slot: int) -> AssemblyChecklist:
    checklist = _checklist_query(db).filter(AssemblyChecklist.model_slot == model_slot).first()
    if checklist is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "체크리스트를 찾을 수 없습니다.")
    return checklist


def _get_section(db: Session, section_id: uuid.UUID) -> AssemblyChecklistSection:
    section = db.query(AssemblyChecklistSection).filter(AssemblyChecklistSection.section_id == section_id).first()
    if section is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "체크리스트 박스를 찾을 수 없습니다.")
    return section


def _get_item(db: Session, item_id: uuid.UUID) -> AssemblyChecklistItem:
    """Load one checklist item or return the shared not-found response."""

    item = db.query(AssemblyChecklistItem).filter(AssemblyChecklistItem.item_id == item_id).first()
    if item is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "체크리스트 항목을 찾을 수 없습니다.")
    return item


def _ordered_section_items(db: Session, section_id: uuid.UUID) -> list[AssemblyChecklistItem]:
    """Return one section's items in the deterministic persisted display order."""

    return (
        db.query(AssemblyChecklistItem)
        .filter(AssemblyChecklistItem.section_id == section_id)
        .order_by(AssemblyChecklistItem.sort_order.asc(), AssemblyChecklistItem.item_id.asc())
        .all()
    )


def _latest_checklist(db: Session, model_slot: int) -> AssemblyChecklist:
    return _get_checklist_by_slot(db, model_slot)


@router.get("", response_model=list[AssemblyChecklistResponse], summary="조립 체크리스트 목록")
def list_assembly_checklists(db: Session = Depends(get_db)):
    """List only MES models that have been added as mobile checklist templates."""

    checklists = (
        _checklist_query(db)
        .join(ProductSymbol, AssemblyChecklist.model_slot == ProductSymbol.slot)
        .order_by(ProductSymbol.display_order.asc(), ProductSymbol.slot.asc())
        .all()
    )
    return [_serialize(checklist) for checklist in checklists]


@router.post("", response_model=AssemblyChecklistResponse, status_code=status.HTTP_201_CREATED, summary="기존 MES 모델에 체크리스트 추가")
def create_assembly_checklist(
    payload: AssemblyChecklistCreate,
    db: Session = Depends(get_db),
):
    """Attach one template to a non-reserved MES model without creating a model."""

    model = (
        db.query(ProductSymbol)
        .filter(ProductSymbol.slot == payload.model_slot)
        .filter(ProductSymbol.model_name.isnot(None))
        .filter(ProductSymbol.is_reserved == False)  # noqa: E712
        .first()
    )
    if model is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "등록 가능한 MES 모델을 찾을 수 없습니다.")
    if db.query(AssemblyChecklist).filter(AssemblyChecklist.model_slot == payload.model_slot).first():
        raise http_error(409, ErrorCode.CONFLICT, "이 모델의 체크리스트가 이미 있습니다.")

    checklist = AssemblyChecklist(model_slot=model.slot)
    db.add(checklist)
    db.commit()
    return _serialize(_latest_checklist(db, model.slot))


@router.post(
    "/{model_slot}/sections",
    response_model=AssemblyChecklistResponse,
    status_code=status.HTTP_201_CREATED,
    summary="체크리스트 박스 추가",
)
def create_assembly_checklist_section(
    model_slot: int,
    payload: AssemblyChecklistSectionCreate,
    db: Session = Depends(get_db),
):
    """Add one non-empty named section to an existing checklist."""

    title = payload.title.strip()
    if not title:
        raise http_error(422, ErrorCode.UNPROCESSABLE, "박스 이름을 입력하세요.")
    checklist = _get_checklist_by_slot(db, model_slot)
    duplicate = (
        db.query(AssemblyChecklistSection)
        .filter(AssemblyChecklistSection.checklist_id == checklist.checklist_id)
        .filter(func.lower(AssemblyChecklistSection.title) == title.lower())
        .first()
    )
    if duplicate is not None:
        raise http_error(409, ErrorCode.CONFLICT, "같은 이름의 박스가 이미 있습니다.")

    next_order = (
        db.query(func.coalesce(func.max(AssemblyChecklistSection.sort_order), -1))
        .filter(AssemblyChecklistSection.checklist_id == checklist.checklist_id)
        .scalar()
        + 1
    )
    db.add(
        AssemblyChecklistSection(
            checklist_id=checklist.checklist_id,
            title=title,
            sort_order=next_order,
        )
    )
    db.commit()
    return _serialize(_latest_checklist(db, model_slot))


@router.post(
    "/sections/{section_id}/items",
    response_model=AssemblyChecklistResponse,
    status_code=status.HTTP_201_CREATED,
    summary="체크리스트 항목 추가",
)
def create_assembly_checklist_item(
    section_id: uuid.UUID,
    payload: AssemblyChecklistItemCreate,
    db: Session = Depends(get_db),
):
    """Append one non-empty instruction to the selected checklist section."""

    content = payload.content.strip()
    if not content:
        raise http_error(422, ErrorCode.UNPROCESSABLE, "체크 항목을 입력하세요.")
    section = _get_section(db, section_id)
    next_order = (
        db.query(func.coalesce(func.max(AssemblyChecklistItem.sort_order), -1))
        .filter(AssemblyChecklistItem.section_id == section.section_id)
        .scalar()
        + 1
    )
    db.add(
        AssemblyChecklistItem(
            section_id=section.section_id,
            content=content,
            sort_order=next_order,
        )
    )
    db.commit()
    return _serialize(_latest_checklist(db, section.checklist.model_slot))


@router.put(
    "/items/{item_id}",
    response_model=AssemblyChecklistResponse,
    summary="체크리스트 항목 문구 수정",
)
def update_assembly_checklist_item(
    item_id: uuid.UUID,
    payload: AssemblyChecklistItemUpdate,
    db: Session = Depends(get_db),
) -> dict:
    """Trim and persist one existing item message, returning its latest checklist."""

    content = payload.content.strip()
    if not content:
        raise http_error(422, ErrorCode.UNPROCESSABLE, "체크 항목을 입력하세요.")
    item = _get_item(db, item_id)
    model_slot = item.section.checklist.model_slot
    item.content = content
    db.commit()
    return _serialize(_latest_checklist(db, model_slot))


@router.put(
    "/items/{item_id}/move",
    response_model=AssemblyChecklistResponse,
    summary="체크리스트 항목 이동",
)
def move_assembly_checklist_item(
    item_id: uuid.UUID,
    payload: AssemblyChecklistItemMove,
    db: Session = Depends(get_db),
) -> dict:
    """Move an item within its checklist and persist contiguous source and target orders atomically."""

    item = _get_item(db, item_id)
    source_section = item.section
    target_section = _get_section(db, payload.target_section_id)
    if source_section.checklist_id != target_section.checklist_id:
        raise http_error(422, ErrorCode.UNPROCESSABLE, "같은 체크리스트 안에서만 항목을 이동할 수 있습니다.")

    source_items = _ordered_section_items(db, source_section.section_id)
    if source_section.section_id == target_section.section_id:
        reordered_items = [candidate for candidate in source_items if candidate.item_id != item.item_id]
        if payload.target_index > len(reordered_items):
            raise http_error(422, ErrorCode.UNPROCESSABLE, "이동할 위치가 범위를 벗어났습니다.")
        reordered_items.insert(payload.target_index, item)
        for sort_order, reordered_item in enumerate(reordered_items):
            reordered_item.sort_order = sort_order
    else:
        target_items = _ordered_section_items(db, target_section.section_id)
        if payload.target_index > len(target_items):
            raise http_error(422, ErrorCode.UNPROCESSABLE, "이동할 위치가 범위를 벗어났습니다.")
        source_items = [candidate for candidate in source_items if candidate.item_id != item.item_id]
        target_items.insert(payload.target_index, item)
        item.section_id = target_section.section_id
        for sort_order, source_item in enumerate(source_items):
            source_item.sort_order = sort_order
        for sort_order, target_item in enumerate(target_items):
            target_item.sort_order = sort_order

    model_slot = source_section.checklist.model_slot
    db.commit()
    return _serialize(_latest_checklist(db, model_slot))


@router.delete(
    "/items/{item_id}",
    response_model=AssemblyChecklistResponse,
    summary="체크리스트 항목 삭제",
)
def delete_assembly_checklist_item(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Delete one item and keep the remaining section order contiguous."""

    item = _get_item(db, item_id)
    section_id = item.section_id
    model_slot = item.section.checklist.model_slot
    db.delete(item)
    db.flush()
    remaining_items = (
        db.query(AssemblyChecklistItem)
        .filter(AssemblyChecklistItem.section_id == section_id)
        .order_by(AssemblyChecklistItem.sort_order.asc(), AssemblyChecklistItem.item_id.asc())
        .all()
    )
    for sort_order, remaining_item in enumerate(remaining_items):
        remaining_item.sort_order = sort_order
    db.commit()
    return _serialize(_latest_checklist(db, model_slot))


@router.put(
    "/sections/{section_id}/items/reorder",
    response_model=AssemblyChecklistResponse,
    summary="박스 안 체크리스트 항목 순서 저장",
)
def reorder_assembly_checklist_items(
    section_id: uuid.UUID,
    payload: AssemblyChecklistItemReorder,
    db: Session = Depends(get_db),
):
    """Persist an exact same-section item permutation; cross-section IDs are rejected."""

    section = _get_section(db, section_id)
    current_items = (
        db.query(AssemblyChecklistItem)
        .filter(AssemblyChecklistItem.section_id == section.section_id)
        .all()
    )
    current_ids = {item.item_id for item in current_items}
    requested_ids = payload.item_ids
    if len(requested_ids) != len(set(requested_ids)) or set(requested_ids) != current_ids:
        raise http_error(422, ErrorCode.UNPROCESSABLE, "같은 박스의 모든 항목 순서만 저장할 수 있습니다.")

    item_by_id = {item.item_id: item for item in current_items}
    for sort_order, item_id in enumerate(requested_ids):
        item_by_id[item_id].sort_order = sort_order
    db.commit()
    return _serialize(_latest_checklist(db, section.checklist.model_slot))
