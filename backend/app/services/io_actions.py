"""IO 제출 HTTP 명령의 트랜잭션 경계."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session

from app.models import Employee
from app.schemas import IoSubmitRequest
from app.services import internal_use_approval, io_dispatch
from app.services._tx import transactional


def _submit_with_failed_settlement_preserved(
    db: Session,
    command: Callable[[], dict[str, Any]],
) -> dict[str, Any]:
    """최종 정산만 실패하면 생성된 사용출고와 실패 상태를 먼저 commit한다."""
    settlement_error: Exception | None = None
    result: dict[str, Any] | None = None
    with transactional(db):
        try:
            result = command()
        except internal_use_approval.InternalUseSubmissionSettlementError as exc:
            approver = db.query(Employee).filter(
                Employee.employee_id == exc.approver_id
            ).one()
            internal_use_approval.mark_batch_failed(
                db,
                batch_id=exc.batch_id,
                approver=approver,
                reason=str(exc.original),
            )
            settlement_error = exc.original
    if settlement_error is not None:
        raise settlement_error
    if result is None:
        raise RuntimeError("입출고 제출 결과가 생성되지 않았습니다.")
    return result


def submit(db: Session, payload: IoSubmitRequest) -> dict[str, Any]:
    """새 배치의 다라인 재고·박스·요청·로그를 원자적으로 확정한다."""
    return _submit_with_failed_settlement_preserved(
        db,
        lambda: io_dispatch.submit(db, payload),
    )


def submit_existing_draft(
    db: Session,
    *,
    batch_id: uuid.UUID,
    requester_employee_id: uuid.UUID,
) -> dict[str, Any]:
    """기존 draft 제출의 다라인 변경 전체를 원자적으로 확정한다."""
    return _submit_with_failed_settlement_preserved(
        db,
        lambda: io_dispatch.submit_existing_draft(
            db,
            batch_id=batch_id,
            requester_employee_id=requester_employee_id,
        ),
    )
