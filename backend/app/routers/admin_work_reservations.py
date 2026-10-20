"""Every administrator work reservation request requires a fresh, read-only PIN check."""
from typing import Annotated, Literal
import uuid

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin import extract_admin_pin
from app.models import IoBatch
from app.routers.settings import require_admin_readonly
from app.schemas.work_reservations import AdminWorkReservationDetail, AdminWorkReservationList
from app.services.work_reservation_admin import cancel_work_reservation
from app.services.work_reservation_errors import WorkReservationError
from app.services.work_reservation_queries import batch_detail, list_admin_work_reservations

router = APIRouter()
Database = Annotated[Session, Depends(get_db)]


def authenticate_admin(db: Database, pin: Annotated[str, Depends(extract_admin_pin)]) -> None:
    """Authentication never seeds settings or commits an unrelated command."""
    require_admin_readonly(db, pin)


Admin = Annotated[None, Depends(authenticate_admin)]


class WorkReservationCancelRequest(BaseModel):
    expected_revision: Annotated[int, Field(strict=True, ge=0)]
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


@router.get("", response_model=AdminWorkReservationList)
def list_reservations(db: Database, _admin: Admin, search: str | None = None,
    requester_department: str | None = None, requester_employee_id: uuid.UUID | None = None,
    reservation_status: Literal["reserved", "needs_reservation", "not_required", "inactive"] | None = None,
    owner_active: bool | None = None, view: Literal["active", "cancelled"] = "active",
    sort: Literal["updated_asc", "updated_desc"] = "updated_asc",
    skip: Annotated[int, Query(ge=0)] = 0, limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> dict:
    """Expose only authenticated, filtered administrator detail rows."""
    return list_admin_work_reservations(db, search=search, requester_department=requester_department,
        requester_employee_id=requester_employee_id, reservation_status=reservation_status,
        owner_active=owner_active, view=view, sort=sort, skip=skip, limit=limit)


@router.get("/{batch_id}", response_model=AdminWorkReservationDetail)
def get_reservation(batch_id: uuid.UUID, db: Database, _admin: Admin) -> dict:
    """Read history and the frozen snapshot without creating any reservation."""
    batch = db.get(IoBatch, batch_id)
    if batch is None:
        raise WorkReservationError("NOT_FOUND", "작업을 찾을 수 없습니다.", 404)
    return batch_detail(db, batch, include_history=True)


@router.post("/{batch_id}/cancel", response_model=AdminWorkReservationDetail)
def cancel_reservation(batch_id: uuid.UUID, payload: WorkReservationCancelRequest,
                       request: Request, db: Database, _admin: Admin) -> dict:
    """Commit snapshot, release, revision and audit together, or roll all of them back."""
    try:
        batch = cancel_work_reservation(db, batch_id=batch_id, expected_revision=payload.expected_revision,
            reason=payload.reason, request=request)
        result = batch_detail(db, batch, include_history=True)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise
