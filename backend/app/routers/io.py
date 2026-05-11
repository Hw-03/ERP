"""입출고 탭 2.0 API router."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    IoBatchResponse,
    IoDraftUpsert,
    IoPreviewRequest,
    IoPreviewResponse,
    IoSubmitRequest,
    IoSubmitResponse,
)
from app.services import io as io_svc
from app.services._tx import commit_only


router = APIRouter()


@router.post("/preview", response_model=IoPreviewResponse)
def preview_io(payload: IoPreviewRequest, db: Session = Depends(get_db)):
    try:
        return io_svc.preview(
            db,
            work_type=payload.work_type,
            sub_type=payload.sub_type,
            from_department=payload.from_department,
            to_department=payload.to_department,
            targets=payload.targets,
        )
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))


@router.put("/draft", response_model=IoBatchResponse)
def save_io_draft(payload: IoDraftUpsert, db: Session = Depends(get_db)):
    try:
        draft = io_svc.save_draft(db, payload)
    except PermissionError as exc:
        db.rollback()
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    commit_only(db)
    return draft


@router.get("/draft", response_model=Optional[IoBatchResponse])
def get_io_draft(
    requester_employee_id: uuid.UUID = Query(...),
    work_type: str = Query(...),
    sub_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return io_svc.get_draft(
        db,
        requester_employee_id=requester_employee_id,
        work_type=work_type,
        sub_type=sub_type,
    )


@router.get("/drafts", response_model=list[IoBatchResponse])
def list_io_drafts(
    requester_employee_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    return io_svc.list_drafts(db, requester_employee_id=requester_employee_id)


@router.delete("/draft/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_io_draft(
    batch_id: uuid.UUID,
    requester_employee_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    try:
        io_svc.delete_draft(
            db,
            batch_id=batch_id,
            requester_employee_id=requester_employee_id,
        )
    except PermissionError as exc:
        db.rollback()
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    commit_only(db)
    return None


@router.post("/submit", response_model=IoSubmitResponse, status_code=status.HTTP_201_CREATED)
def submit_io(payload: IoSubmitRequest, db: Session = Depends(get_db)):
    try:
        result = io_svc.submit(db, payload)
    except PermissionError as exc:
        db.rollback()
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    commit_only(db)
    return result


@router.post(
    "/draft/{batch_id}/submit",
    response_model=IoSubmitResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_io_draft(
    batch_id: uuid.UUID,
    requester_employee_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    try:
        result = io_svc.submit_existing_draft(
            db,
            batch_id=batch_id,
            requester_employee_id=requester_employee_id,
        )
    except PermissionError as exc:
        db.rollback()
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    commit_only(db)
    return result


@router.get("/{batch_id}", response_model=IoBatchResponse)
def get_io_batch(batch_id: uuid.UUID, db: Session = Depends(get_db)):
    batch = io_svc.get_batch(db, batch_id=batch_id)
    if batch is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "입출고 작업 묶음을 찾을 수 없습니다.")
    return batch
