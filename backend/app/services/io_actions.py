"""IO 제출 HTTP 명령의 트랜잭션 경계."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.schemas import IoSubmitRequest
from app.services import io_dispatch
from app.services._tx import transactional


def submit(db: Session, payload: IoSubmitRequest) -> dict[str, Any]:
    """새 배치의 다라인 재고·박스·요청·로그를 원자적으로 확정한다."""
    with transactional(db):
        return io_dispatch.submit(db, payload)


def submit_existing_draft(
    db: Session,
    *,
    batch_id: uuid.UUID,
    requester_employee_id: uuid.UUID,
) -> dict[str, Any]:
    """기존 draft 제출의 다라인 변경 전체를 원자적으로 확정한다."""
    with transactional(db):
        return io_dispatch.submit_existing_draft(
            db,
            batch_id=batch_id,
            requester_employee_id=requester_employee_id,
        )
