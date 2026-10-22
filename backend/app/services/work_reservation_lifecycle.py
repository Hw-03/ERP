"""Linked request command locks and one-version-per-command auditing."""
from __future__ import annotations

from datetime import datetime
from typing import Sequence
import uuid

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import Employee, IoBatch, StockRequest
from app.services import io_reservations
from app.services.work_reservation_errors import WorkReservationError


def lock_request_context(
    db: Session, request_id: uuid.UUID,
) -> tuple[IoBatch | None, list[StockRequest], StockRequest]:
    """Treat the first association read as a hint, then lock batch before requests."""
    hint = db.query(StockRequest.operation_batch_id).filter_by(request_id=request_id).one()
    batch = None
    if hint.operation_batch_id is not None:
        from app.services import internal_use_approval

        subtype = db.query(IoBatch.sub_type).filter_by(batch_id=hint.operation_batch_id).scalar()
        if subtype == internal_use_approval.INTERNAL_USE_SUB_TYPE:
            internal_use_approval.lock_approver_roster(db)
        batch = db.query(IoBatch).filter_by(batch_id=hint.operation_batch_id).populate_existing().with_for_update().one()
        requests = db.query(StockRequest).filter_by(operation_batch_id=batch.batch_id).order_by(
            StockRequest.request_id.asc()).populate_existing().with_for_update().all()
    else:
        requests = db.query(StockRequest).filter_by(request_id=request_id).populate_existing().with_for_update().all()
    request = next((row for row in requests if row.request_id == request_id), None)
    if request is None or request.operation_batch_id != hint.operation_batch_id:
        raise WorkReservationError("WORK_STATE_CONFLICT", "연결 요청이 변경되었습니다. 최신 내용을 확인해 주세요.")
    return batch, requests, request


def decision_snapshot(batch: IoBatch | None, requests: Sequence[StockRequest]) -> tuple:
    """Ignore incidental timestamps while detecting every persisted approval decision."""
    fields = ("status", "approved_at", "department_approved_at", "as_research_approved_at",
              "rejected_at", "cancelled_at", "completed_at")
    return (batch.status if batch is not None else None, tuple(
        (row.request_id, *(getattr(row, field) for field in fields)) for row in requests))


def advance_command(
    db: Session, batch: IoBatch, *, actor: Employee, previous_revision: int,
    action: str = "approval_changed", reason: str | None = None,
) -> None:
    """CAS also protects SQLite commands, which do not provide row-level locks."""
    db.flush()
    result = db.execute(update(IoBatch).where(
        IoBatch.batch_id == batch.batch_id, IoBatch.revision == previous_revision,
    ).values(revision=previous_revision + 1, updated_at=datetime.utcnow()).execution_options(synchronize_session=False))
    if result.rowcount != 1:
        db.refresh(batch)
        io_reservations.check_revision(batch, previous_revision)
        raise WorkReservationError("WORK_STATE_CONFLICT", "작업이 변경되었습니다. 최신 내용을 확인해 주세요.")
    db.refresh(batch)
    io_reservations.record_event(db, batch, action, previous_revision, actor.employee_id, actor.name, reason)


def persisted_failure(batch: IoBatch, request_id: uuid.UUID, *, internal_use: bool) -> WorkReservationError:
    """A committed failure tells the client to inspect history rather than retry execution."""
    return WorkReservationError(
        "IO_SETTLEMENT_FAILED_PERSISTED" if internal_use else "WORK_APPROVAL_FAILED_PERSISTED",
        "승인 실패 이력이 저장되었습니다. 현재 상태를 확인해 주세요.",
        extra={"state_committed": True, "request_id": str(request_id), "batch_id": str(batch.batch_id),
               "current_revision": batch.revision, "current_status": batch.status},
    )
