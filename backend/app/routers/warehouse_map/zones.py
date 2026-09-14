"""Aisle and pallet zone CRUD for the warehouse map."""

from typing import Annotated, List

from fastapi import APIRouter, Depends, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.warehouse_manager import require_warehouse_manager
from app.models import (
    Employee,
    Item,
    WarehouseSpecialZone,
    WarehouseSpecialZoneAudit,
    WarehouseSpecialZoneItem,
)
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    WarehouseBoxItemPayload,
    WarehouseSpecialZoneCreate,
    WarehouseSpecialZoneItemsUpdate,
    WarehouseSpecialZoneResponse,
    WarehouseSpecialZoneUpdate,
)
from app.services import warehouse_map as wm_service

router = APIRouter()


def _validate_items(db: Session, items: List[WarehouseBoxItemPayload]) -> None:
    for it in items:
        item = db.query(Item).filter(Item.item_id == it.item_id, Item.deleted_at.is_(None)).first()
        if not item:
            raise http_error(404, ErrorCode.NOT_FOUND, "Item not found.")


def _replace_items(db: Session, zone_id: int, items: List[WarehouseBoxItemPayload]) -> None:
    db.query(WarehouseSpecialZoneItem).filter(WarehouseSpecialZoneItem.zone_id == zone_id).delete()
    for it in items:
        db.add(WarehouseSpecialZoneItem(zone_id=zone_id, item_id=it.item_id, quantity=it.quantity))


def _audit(db: Session, zone: WarehouseSpecialZone, action: str, mgr: Employee) -> None:
    db.add(
        WarehouseSpecialZoneAudit(
            zone_id=zone.id,
            action=action,
            actor_employee_id=mgr.employee_id,
            actor_employee_code=mgr.employee_code,
            actor_name=mgr.name,
        )
    )


def _get_zone(db: Session, zone_id: int) -> WarehouseSpecialZone:
    zone = db.query(WarehouseSpecialZone).filter(WarehouseSpecialZone.id == zone_id).first()
    if not zone:
        raise http_error(404, ErrorCode.NOT_FOUND, "Zone not found.")
    return zone


def _zone_response(db: Session, zone_id: int) -> WarehouseSpecialZoneResponse:
    for zone in wm_service.build_special_zone_payloads(db, include_inactive=True):
        if zone["id"] == zone_id:
            return zone
    raise http_error(404, ErrorCode.NOT_FOUND, "Zone not found.")


@router.post("/zones", response_model=WarehouseSpecialZoneResponse, status_code=status.HTTP_201_CREATED)
def create_zone(
    payload: WarehouseSpecialZoneCreate,
    mgr: Annotated[Employee, Depends(require_warehouse_manager)],
    db: Session = Depends(get_db),
):
    _validate_items(db, payload.items)
    order = payload.display_order
    if order is None:
        max_order = db.query(func.max(WarehouseSpecialZone.display_order)).scalar()
        order = (max_order or 0) + 1

    zone = WarehouseSpecialZone(
        label=payload.label,
        zone_type=payload.zone_type,
        pos_x=payload.pos_x,
        pos_y=payload.pos_y,
        width=payload.width,
        height=payload.height,
        display_order=order,
        is_active=True,
    )
    db.add(zone)
    db.flush()
    _replace_items(db, zone.id, payload.items)
    _audit(db, zone, "create", mgr)
    db.commit()
    return _zone_response(db, zone.id)


@router.put("/zones/{zone_id}", response_model=WarehouseSpecialZoneResponse)
def update_zone(
    zone_id: int,
    payload: WarehouseSpecialZoneUpdate,
    mgr: Annotated[Employee, Depends(require_warehouse_manager)],
    db: Session = Depends(get_db),
):
    zone = _get_zone(db, zone_id)
    data = payload.model_dump(exclude_unset=True)
    items = data.pop("items", None)
    for field, value in data.items():
        setattr(zone, field, value)
    if items is not None:
        _validate_items(db, items)
        _replace_items(db, zone.id, items)
    _audit(db, zone, "update", mgr)
    db.commit()
    return _zone_response(db, zone.id)


@router.put("/zones/{zone_id}/items", response_model=WarehouseSpecialZoneResponse)
def replace_zone_items(
    zone_id: int,
    payload: WarehouseSpecialZoneItemsUpdate,
    mgr: Annotated[Employee, Depends(require_warehouse_manager)],
    db: Session = Depends(get_db),
):
    zone = _get_zone(db, zone_id)
    _validate_items(db, payload.items)
    _replace_items(db, zone.id, payload.items)
    _audit(db, zone, "items_replace", mgr)
    db.commit()
    return _zone_response(db, zone.id)


@router.delete("/zones/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_zone(
    zone_id: int,
    mgr: Annotated[Employee, Depends(require_warehouse_manager)],
    db: Session = Depends(get_db),
):
    zone = _get_zone(db, zone_id)
    _audit(db, zone, "delete", mgr)
    db.delete(zone)
    db.commit()
