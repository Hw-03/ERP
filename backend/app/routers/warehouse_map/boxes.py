"""위치 배정 — 박스 CRUD (admin PIN). 자리 용량(높이 3) 검증 포함."""

from typing import Annotated, List

from fastapi import APIRouter, Depends, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin import require_admin_pin
from app.dependencies.warehouse_manager import require_warehouse_manager
from app.models import (
    BoxSizeEnum,
    Employee,
    Item,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
)
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    BoxTrackingResponse,
    BoxTrackingUpdate,
    JariRestackPayload,
    WarehouseBoxCreate,
    WarehouseBoxItemPayload,
    WarehouseBoxMove,
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


def _is_plain_angle(angle: WarehouseAngle) -> bool:
    return (getattr(angle, "angle_type", "angle") or "angle") == "angle"


def _validate_coords(db: Session, angle_id: int, row_no: int, layer_no: int, jari_index: int) -> WarehouseAngle:
    angle = db.query(WarehouseAngle).filter(WarehouseAngle.id == angle_id).first()
    if not angle:
        raise http_error(404, ErrorCode.NOT_FOUND, "Angle not found.")
    if not _is_plain_angle(angle):
        if (row_no, layer_no, jari_index) != (1, 1, 0):
            raise http_error(
                422,
                ErrorCode.VALIDATION_ERROR,
                "PL/aisle boxes can only use list coordinates (row=1, layer=1, jari_index=0).",
            )
        return angle
    if row_no > angle.rows or layer_no > angle.layers or jari_index >= angle.jaris_per_cell:
        raise http_error(
            422, ErrorCode.VALIDATION_ERROR,
            f"Coordinates are outside angle bounds (row 1~{angle.rows}, layer 1~{angle.layers}, jari 0~{angle.jaris_per_cell - 1}).",
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
    _mgr: Annotated[Employee, Depends(require_warehouse_manager)],
    db: Session = Depends(get_db),
):
    angle = _validate_coords(db, payload.angle_id, payload.row_no, payload.layer_no, payload.jari_index)
    _validate_items(db, payload.items)

    used = _jari_used_units(db, payload.angle_id, payload.row_no, payload.layer_no, payload.jari_index)
    new_unit = SIZE_UNIT[payload.size]
    if _is_plain_angle(angle) and used + new_unit > JARI_CAPACITY:
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
    _mgr: Annotated[Employee, Depends(require_warehouse_manager)],
    db: Session = Depends(get_db),
):
    box = db.query(WarehouseBox).filter(WarehouseBox.box_id == box_id).first()
    if not box:
        raise http_error(404, ErrorCode.NOT_FOUND, "박스를 찾을 수 없습니다.")

    if payload.size is not None and payload.size != (box.size.value if hasattr(box.size, "value") else box.size):
        angle = db.query(WarehouseAngle).filter(WarehouseAngle.id == box.angle_id).first()
        used = _jari_used_units(db, box.angle_id, box.row_no, box.layer_no, box.jari_index, exclude_box_id=box.box_id)
        if (angle is None or _is_plain_angle(angle)) and used + SIZE_UNIT[payload.size] > JARI_CAPACITY:
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


@router.patch("/boxes/{box_id}/move", response_model=WarehouseBoxResponse)
def move_box(
    box_id: str,
    payload: WarehouseBoxMove,
    _mgr: Annotated[Employee, Depends(require_warehouse_manager)],
    db: Session = Depends(get_db),
):
    """박스를 다른 자리로 이동(드래그). 같은 자리면 맨 위로 올림(스택 순서 변경).

    대상 자리 용량 초과 시 422 차단. 어느 경우든 박스는 대상 자리의 맨 위로 간다
    (stack_order 최대+1) — 차감 시 위 박스부터 빠지는 R1 순서와 일치.
    """
    box = db.query(WarehouseBox).filter(WarehouseBox.box_id == box_id).first()
    if not box:
        raise http_error(404, ErrorCode.NOT_FOUND, "박스를 찾을 수 없습니다.")

    same_jari = (box.angle_id, box.row_no, box.layer_no, box.jari_index) == (
        payload.angle_id, payload.row_no, payload.layer_no, payload.jari_index
    )

    # 다른 자리로 옮길 때만 좌표·용량 검증 (같은 자리는 이미 들어가 있으므로 생략).
    if not same_jari:
        target_angle = _validate_coords(db, payload.angle_id, payload.row_no, payload.layer_no, payload.jari_index)
        used = _jari_used_units(db, payload.angle_id, payload.row_no, payload.layer_no, payload.jari_index)
        box_unit = SIZE_UNIT[box.size.value if hasattr(box.size, "value") else box.size]
        if _is_plain_angle(target_angle) and used + box_unit > JARI_CAPACITY:
            raise http_error(
                422, ErrorCode.VALIDATION_ERROR,
                f"자리 용량 초과 — 남은 높이 {JARI_CAPACITY - used}, 박스 높이 {box_unit}.",
            )
        box.angle_id = payload.angle_id
        box.row_no = payload.row_no
        box.layer_no = payload.layer_no
        box.jari_index = payload.jari_index

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
    box.stack_order = (max_order or 0) + 1
    db.commit()
    return _box_response(db, box.box_id)


@router.patch("/boxes/restack", response_model=List[WarehouseBoxResponse])
def restack_jari(
    payload: JariRestackPayload,
    _mgr: Annotated[Employee, Depends(require_warehouse_manager)],
    db: Session = Depends(get_db),
):
    """한 자리의 스택 순서를 통째로 재배치(중간 삽입 포함). box_ids = 아래→위 최종 순서.

    다른 자리에서 끌어온 박스도 이 자리로 이동된다. 합계 높이 초과 시 422.
    """
    target_angle = _validate_coords(db, payload.angle_id, payload.row_no, payload.layer_no, payload.jari_index)
    box_ids = [str(b) for b in payload.box_ids]
    boxes = db.query(WarehouseBox).filter(WarehouseBox.box_id.in_(box_ids)).all()
    if len(boxes) != len(set(box_ids)):
        raise http_error(404, ErrorCode.NOT_FOUND, "일부 박스를 찾을 수 없습니다.")

    total = sum(SIZE_UNIT[b.size.value if hasattr(b.size, "value") else b.size] for b in boxes)
    if _is_plain_angle(target_angle) and total > JARI_CAPACITY:
        raise http_error(
            422, ErrorCode.VALIDATION_ERROR,
            f"자리 용량 초과 — 합계 높이 {total}, 최대 {JARI_CAPACITY}.",
        )

    by_id = {str(b.box_id): b for b in boxes}
    for idx, bid in enumerate(box_ids):
        b = by_id[bid]
        b.angle_id = payload.angle_id
        b.row_no = payload.row_no
        b.layer_no = payload.layer_no
        b.jari_index = payload.jari_index
        b.stack_order = idx
    db.commit()

    full = wm_service.build_map_payload(db)
    return [b for b in full["boxes"] if str(b["box_id"]) in set(box_ids)]


@router.delete("/boxes/{box_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_box(
    box_id: str,
    _mgr: Annotated[Employee, Depends(require_warehouse_manager)],
    db: Session = Depends(get_db),
):
    box = db.query(WarehouseBox).filter(WarehouseBox.box_id == box_id).first()
    if not box:
        raise http_error(404, ErrorCode.NOT_FOUND, "박스를 찾을 수 없습니다.")
    db.delete(box)
    db.commit()
