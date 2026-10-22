"""Administrator commands share the owner's ledger and revision transaction."""
from __future__ import annotations

import uuid

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import Employee, IoBatch, IoWorkReservationEvent
from app.services import io_reservations as reservations
from app.services.audit_actor_session import get_verified_audit_actor_code
from app.services.io_persist import ensure_batch_is_mutable
from app.services.work_reservation_errors import WorkReservationError


def cancel_work_reservation(db: Session, *, batch_id: uuid.UUID, expected_revision: int,
                            reason: str, request: Request) -> IoBatch:
    """After PIN authentication, cancel one draft; the router owns commit/rollback."""
    batch = db.query(IoBatch).filter_by(batch_id=batch_id).populate_existing().with_for_update().first()
    if batch is None:
        raise WorkReservationError("NOT_FOUND", "작업을 찾을 수 없습니다.", 404)
    reason = reason.strip()
    if batch.status == "cancelled" and db.query(IoWorkReservationEvent).filter_by(
        batch_id=batch_id, action="admin_cancelled", from_revision=expected_revision,
        to_revision=batch.revision, reason=reason,
    ).first() is not None:
        return batch
    reservations.check_revision(batch, expected_revision)
    reservations.check_draft(batch)
    try:
        ensure_batch_is_mutable(batch)
    except ValueError as exc:
        raise WorkReservationError("WORK_STATE_CONFLICT", str(exc)) from exc
    reservations.advance_revision(db, batch, expected_revision)
    snapshot = batch.effective_plan
    reservations.replace_reservations(db, batch, None)
    batch.effective_plan = snapshot
    batch.status = "cancelled"
    actor_code = get_verified_audit_actor_code(request)
    tab_employee_code = (request.headers.get("X-MES-Employee-Code") or "").strip()
    # A tab hint can disqualify a shared cookie, but cannot authenticate its own actor.
    if actor_code and tab_employee_code and actor_code != tab_employee_code:
        actor_code = None
    actor = db.query(Employee).filter_by(employee_code=actor_code).first() if actor_code else None
    reservations.record_event(db, batch, "admin_cancelled", expected_revision,
        actor.employee_id if actor else None, actor.name if actor else "공유 관리자", reason)
    return batch
