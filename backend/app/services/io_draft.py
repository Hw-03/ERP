"""임시저장(draft) CRUD + 멱등 재제출 응답.

io_persist 의 _load_requester / _persist_batch / _batch_to_payload 를 재사용한다.
"""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.orm import Session

from datetime import datetime

from app.models import IoBatch
from app.services.io_preview import (
    APPROVAL_SUB_TYPES,
    validate_internal_use_operation,
    validate_internal_use_requester,
    validate_operation_sources,
)
from app.services.io_persist import (
    _add_bundles_and_lines,
    _batch_to_payload,
    _load_requester,
    _persist_batch,
)


def save_draft(db: Session, payload) -> dict:
    """임시저장. batch_id 가 오면 해당 draft 를 제자리 갱신, 없으면 새 슬롯 누적.

    덮어쓰기(이전 동작) 제거 — 같은 (work_type, sub_type) 라도 batch_id 가 없으면
    새 draft 가 쌓여 '작업 중' 탭에서 여러 작업을 이어서 진행할 수 있다.
    """
    validate_operation_sources(
        payload.sub_type,
        (bundle.source_kind for bundle in payload.bundles),
    )
    requester = _load_requester(db, payload.requester_employee_id)
    validate_internal_use_requester(
        requester,
        work_type=payload.work_type,
        sub_type=payload.sub_type,
    )
    validate_internal_use_operation(
        work_type=payload.work_type,
        sub_type=payload.sub_type,
        to_department=payload.to_department,
        lines=(line for bundle in payload.bundles for line in bundle.lines),
    )
    incoming_batch_id = getattr(payload, "batch_id", None)

    if incoming_batch_id is not None:
        batch = (
            db.query(IoBatch)
            .filter(IoBatch.batch_id == incoming_batch_id)
            .first()
        )
        if batch is None or batch.status != "draft":
            raise ValueError("임시저장 작업을 찾을 수 없습니다.")
        if batch.requester_employee_id != requester.employee_id:
            raise PermissionError("본인 임시저장 작업만 수정할 수 있습니다.")
        # 메타 갱신 + 자식 교체. client_request_id 는 보존(submit 멱등성).
        batch.work_type = payload.work_type
        batch.sub_type = payload.sub_type
        batch.from_department = payload.from_department
        batch.to_department = payload.to_department
        batch.requires_approval = payload.sub_type in APPROVAL_SUB_TYPES
        batch.reference_no = payload.reference_no
        batch.notes = payload.notes
        batch.updated_at = datetime.utcnow()
        # cascade='all, delete-orphan' — 비우고 flush 해서 기존 자식을 INSERT 전에 DELETE.
        batch.bundles.clear()
        db.flush()
        _add_bundles_and_lines(db, batch, payload)
        db.refresh(batch)
        return _batch_to_payload(batch)

    batch = _persist_batch(db, requester=requester, payload=payload, status="draft")
    return _batch_to_payload(batch)


def get_draft(
    db: Session,
    *,
    requester_employee_id: uuid.UUID,
    work_type: str,
    sub_type: Optional[str] = None,
) -> Optional[dict]:
    query = db.query(IoBatch).filter(
        IoBatch.requester_employee_id == requester_employee_id,
        IoBatch.work_type == work_type,
        IoBatch.status == "draft",
    )
    if sub_type:
        query = query.filter(IoBatch.sub_type == sub_type)
    batch = query.order_by(IoBatch.updated_at.desc()).first()
    return _batch_to_payload(batch) if batch else None


def list_drafts(db: Session, *, requester_employee_id: uuid.UUID) -> list[dict]:
    rows = (
        db.query(IoBatch)
        .filter(
            IoBatch.requester_employee_id == requester_employee_id,
            IoBatch.status == "draft",
        )
        .order_by(IoBatch.updated_at.desc())
        .all()
    )
    return [_batch_to_payload(row) for row in rows]


def delete_draft(db: Session, *, batch_id: uuid.UUID, requester_employee_id: uuid.UUID) -> None:
    batch = db.query(IoBatch).filter(IoBatch.batch_id == batch_id).first()
    if batch is None:
        raise ValueError("임시저장 작업을 찾을 수 없습니다.")
    if batch.requester_employee_id != requester_employee_id:
        raise PermissionError("본인 임시저장 작업만 삭제할 수 있습니다.")
    if batch.status != "draft":
        raise ValueError("임시저장 상태가 아닙니다.")
    db.delete(batch)
    db.flush()


def find_by_client_request_id(db: Session, client_request_id: str) -> Optional[IoBatch]:
    """멱등 retry 시 기존 batch 조회. submit IntegrityError 후 라우터가 사용."""
    return (
        db.query(IoBatch)
        .filter(IoBatch.client_request_id == client_request_id)
        .first()
    )


def build_idempotent_response(batch: IoBatch) -> dict:
    """이미 처리 완료된 batch에 대해 IoSubmitResponse 모양 dict 생성 (재제출 멱등 응답)."""
    if batch.requires_approval:
        message = "승인 요청이 생성되었습니다."
    else:
        message = "입출고가 반영되었습니다."
    return {
        "batch": _batch_to_payload(batch),
        "status": batch.status,
        "requires_approval": batch.requires_approval,
        "stock_request_id": batch.stock_request_id,
        "message": message,
    }
