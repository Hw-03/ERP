"""Ordinary inventory readers can inspect work status without administrative credentials."""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item
from app.routers._errors import ErrorCode, http_error
from app.schemas.work_reservations import InventoryWorkStatus
from app.services.work_reservation_queries import bulk_inventory_work_status


router = APIRouter()


@router.get("/work-status", response_model=InventoryWorkStatus)
def inventory_work_status(item_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    """Return stored reservations and identifiable open effects without materializing stock rows."""
    with db.no_autoflush:
        if db.get(Item, item_id) is None:
            raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")
        return bulk_inventory_work_status(db, [item_id])[item_id]
