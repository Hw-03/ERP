"""위치 배정 — 박스 CRUD (admin PIN). 자리 용량(높이 3) 검증 포함."""

from typing import Annotated, List

from fastapi import APIRouter, Depends, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin import require_admin_pin
from app.models import (
    BoxSizeEnum,
    Item,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
)
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    BoxTrackingResponse,
    BoxTrackingUpdate,
    WarehouseBoxCreate,
    WarehouseBoxItemPayload,
    WarehouseBoxResponse,
    WarehouseBoxUpdate,
)
from app.services import warehouse_map as wm_service
from app.services.warehouse_map import JARI_CAPACITY, SIZE_UNIT

router = APIRouter()


@router.put("/box-tracking", response_model=BoxTrackingResponse)
def set_box_tracking(
    payload: BoxTrackingUpdate,
    _admin: Annotated[None, Depends(require_admin_pin)],
    db: Session = Depends(get_db),
):
    """창고 박스 자동 차감 기능 켜기/끄기 (전환 운영 스위치, admin PIN).

    켜기 전 전 품목 박스 배치가 끝나 있어야 한다 — 안 그러면 R5가 창고 출고를 막는다.
    """
    wm_service.set_box_tracking_enabled(db, payload.enabled)
    db.commit()
    return BoxTrackingResponse(enabled=wm_service.is_box_tracking_enabled(db))


def _validate_coords(db: Session, angle_id: int, row_no: int, layer_no: int, jari_index: int) -> WarehouseAngle:
    angle = db.query(WarehouseAngle).filter(WarehouseAngle.id == angle_id).first()
    if not angle:
        raise http_error(404, ErrorCode.NOT_FOUND, "앵글을 찾을 수 없습니다.")
    if row_no > angle.rows or layer_no > angle.layers or jari_index >= angle.jaris_per_cell:
        raise http_error(
            422, ErrorCode.VALIDATION_ERROR,
            f"좌표가 앵글 범위를 벗어납니다 (줄 1~{angle.rows}, 층 1~{angle.layers}, 자리 0~{angle.jaris_per_cell - 1}).",
        )
    return angle


def _jari_used_units(db: Session, angle_id: int, row_no: int, layer_no: int, jari_index: int, exclude_box_id=None) -> int:
    """해당 자리에 이미 쌓인 박스들의 높이 유닛 합."""
    q = db.query(WarehouseBox).filter(
        WarehouseBox.angle_id == angle_id,
        WarehouseBox.row_no == row_no,
        WarehouseBox.layer_no == layer_no,
        WarehouseBox.jari_index == jari_index,
    )
    if exclude_box_id is not None:
        q = q.filter(WarehouseBox.box_id != exclude_box_id)
    return sum(SIZE_UNIT.get(b.size.value if hasattr(b.size, "value") else b.size, 1) for b in q.all())


def _validate_items(db: Session, items: List[WarehouseBoxItemPayload]) -> None:
    for it in items:
        item = db.query(Item).filter(Item.item_id == it.item_id, Item.deleted_at.is_(None)).first()
        if not item:
            raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")


def _box_response(db: Session, box_id) -> WarehouseBoxResponse:
    payload = wm_service.build_map_payload(db)
    for b in payload["boxes"]:
        if str(b["box_id"]) == str(box_id):
            return b
    raise http_error(404, ErrorCode.NOT_FOUND, "박스를 찾을 수 없습니다.")


@router.post("/boxes", response_model=WarehouseBoxResponse, status_code=status.HTTP_201_CREATED)
def create_box(
    payload: WarehouseBoxCreate,
    _admin: Annotated[None, Depends(require_admin_pin)],
    db: Session = Depends(get_db),
):
    _validate_coords(db, payload.angle_id, payload.row_no, payload.layer_no, payload.jari_index)
    _validate_items(db, payload.items)

    used = _jari_used_units(db, payload.angle_id, payload.row_no, payload.layer_no, payload.jari_index)
    new_unit = SIZE_UNIT[payload.size]
    if used + new_unit > JARI_CAPACITY:
        raise http_error(
            422, ErrorCode.VALIDATION_ERROR,
            f"자리 용량 초과 — 남은 높이 {JARI_CAPACITY - used}, 박스 높이 {new_unit}.",
        )

    max_order = (
        db.query(func.max(WarehouseBox.stack_order))
        .filter(
            WarehouseBox.angle_id == payload.angle_id,
            WarehouseBox.row_no == payload.row_no,
            WarehouseBox.layer_no == payload.layer_no,
            WarehouseBox.jari_index == payload.jari_index,
        )
        .scalar()
    )
    box = WarehouseBox(
        angle_id=payload.angle_id,
        row_no=payload.row_no,
        layer_no=payload.layer_no,
        jari_index=payload.jari_index,
        size=BoxSizeEnum(payload.size),
        stack_order=(max_order or 0) + 1,
    )
    db.add(box)
    db.flush()
    for it in payload.items:
        db.add(WarehouseBoxItem(box_id=box.box_id, item_id=it.item_id, quantity=it.quantity))
    db.commit()
    return _box_response(db, box.box_id)


@router.put("/boxes/{box_id}", response_model=WarehouseBoxResponse)
def update_box(
    box_id: str,
    payload: WarehouseBoxUpdate,
    _admin: Annotated[None, Depends(require_admin_pin)],
    db: Session = Depends(get_db),
):
    box = db.query(WarehouseBox).filter(WarehouseBox.box_id == box_id).first()
    if not box:
        raise http_error(404, ErrorCode.NOT_FOUND, "박스를 찾을 수 없습니다.")

    if payload.size is not None and payload.size != (box.size.value if hasattr(box.size, "value") else box.size):
        used = _jari_used_units(db, box.angle_id, box.row_no, box.layer_no, box.jari_index, exclude_box_id=box.box_id)
        if used + SIZE_UNIT[payload.size] > JARI_CAPACITY:
            raise http_error(
                422, ErrorCode.VALIDATION_ERROR,
                f"자리 용량 초과 — 남은 높이 {JARI_CAPACITY - used}, 박스 높이 {SIZE_UNIT[payload.size]}.",
            )
        box.size = BoxSizeEnum(payload.size)

    if payload.items is not None:
        _validate_items(db, payload.items)
        db.query(WarehouseBoxItem).filter(WarehouseBoxItem.box_id == box.box_id).delete()
        for it in payload.items:
            db.add(WarehouseBoxItem(box_id=box.box_id, item_id=it.item_id, quantity=it.quantity))

    db.commit()
    return _box_response(db, box.box_id)


@router.delete("/boxes/{box_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_box(
    box_id: str,
    _admin: Annotated[None, Depends(require_admin_pin)],
    db: Session = Depends(get_db),
):
    box = db.query(WarehouseBox).filter(WarehouseBox.box_id == box_id).first()
    if not box:
        raise http_error(404, ErrorCode.NOT_FOUND, "박스를 찾을 수 없습니다.")
    db.delete(box)
    db.commit()
