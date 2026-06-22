"""창고 구조 편집 — 앵글 CRUD (창고 정/부 관리자)."""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.warehouse_manager import require_warehouse_manager
from app.models import Employee, WarehouseAngle, WarehouseBox
from app.routers._errors import ErrorCode, http_error
from app.services.reorder import reorder_by_display_order
from app.schemas import (
    WarehouseAngleCreate,
    WarehouseAngleReorderPayload,
    WarehouseAngleResponse,
    WarehouseAngleUpdate,
)

router = APIRouter()


@router.post("/angles", response_model=WarehouseAngleResponse, status_code=status.HTTP_201_CREATED)
def create_angle(
    payload: WarehouseAngleCreate,
    _mgr: Annotated[Employee, Depends(require_warehouse_manager)],
    db: Session = Depends(get_db),
):
    order = payload.display_order
    if order is None:
        max_order = db.query(func.max(WarehouseAngle.display_order)).scalar()
        order = (max_order or 0) + 1
    angle = WarehouseAngle(
        label=payload.label,
        rows=payload.rows,
        layers=payload.layers,
        jaris_per_cell=payload.jaris_per_cell,
        pos_x=payload.pos_x,
        pos_y=payload.pos_y,
        width=payload.width,
        height=payload.height,
        display_order=order,
        is_active=True,
    )
    db.add(angle)
    db.commit()
    db.refresh(angle)
    return angle


@router.patch("/angles/reorder")
def reorder_angles(
    payload: WarehouseAngleReorderPayload,
    _mgr: Annotated[Employee, Depends(require_warehouse_manager)],
    db: Session = Depends(get_db),
):
    reorder_by_display_order(
        db, WarehouseAngle, "id",
        [(item.id, item.display_order) for item in payload.items],
    )
    db.commit()
    return {"ok": True}


@router.put("/angles/{angle_id}", response_model=WarehouseAngleResponse)
def update_angle(
    angle_id: int,
    payload: WarehouseAngleUpdate,
    _mgr: Annotated[Employee, Depends(require_warehouse_manager)],
    db: Session = Depends(get_db),
):
    angle = db.query(WarehouseAngle).filter(WarehouseAngle.id == angle_id).first()
    if not angle:
        raise http_error(404, ErrorCode.NOT_FOUND, "앵글을 찾을 수 없습니다.")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(angle, field, value)
    db.commit()
    db.refresh(angle)
    return angle


@router.delete("/angles/{angle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_angle(
    angle_id: int,
    _mgr: Annotated[Employee, Depends(require_warehouse_manager)],
    db: Session = Depends(get_db),
):
    angle = db.query(WarehouseAngle).filter(WarehouseAngle.id == angle_id).first()
    if not angle:
        raise http_error(404, ErrorCode.NOT_FOUND, "앵글을 찾을 수 없습니다.")
    # 박스가 남아 있으면 실수 삭제 방지 (배치 전소 방지)
    box_count = db.query(WarehouseBox).filter(WarehouseBox.angle_id == angle_id).count()
    if box_count > 0:
        raise http_error(
            409, ErrorCode.CONFLICT,
            f"이 앵글에 박스 {box_count}개가 남아 있어 삭제할 수 없습니다. 먼저 비워주세요.",
        )
    db.delete(angle)
    db.commit()
