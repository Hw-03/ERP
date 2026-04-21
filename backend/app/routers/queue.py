"""Queue batch router: 생산/분해/반품 2단계 워크플로.

Lifecycle
    POST /queue                      → 배치 생성 (OPEN, BOM 자동 로드)
    GET /queue?status=OPEN           → 현재 열린 배치(점유자 포함)
    GET /queue/{id}                  → 배치 상세
    PUT /queue/{id}/lines/{lid}      → 수량 override
    POST /queue/{id}/lines/{lid}/toggle  → 포함/제외 + direction 재분류
    POST /queue/{id}/lines           → 수동 라인 추가 (Scrap/Loss 지정)
    DELETE /queue/{id}/lines/{lid}   → 라인 제거
    POST /queue/{id}/confirm         → 원자 커밋
    POST /queue/{id}/cancel          → Pending 롤백
"""

from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Employee,
    Item,
    QueueBatch,
    QueueBatchStatusEnum,
    QueueLine,
)
from app.schemas import (
    QueueBatchCreateRequest,
    QueueBatchResponse,
    QueueLineAddRequest,
    QueueLineOverrideRequest,
    QueueLineResponse,
    QueueLineToggleRequest,
)
from app.services import queue as queue_svc

router = APIRouter()


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------


def _line_to_response(db: Session, line: QueueLine) -> QueueLineResponse:
    item = db.query(Item).filter(Item.item_id == line.item_id).first()
    return QueueLineResponse(
        line_id=line.line_id,
        batch_id=line.batch_id,
        item_id=line.item_id,
        item_code=item.item_code if item else None,
        item_name=item.item_name if item else None,
        direction=line.direction,
        quantity=line.quantity,
        bom_expected=line.bom_expected,
        reason=line.reason,
        process_stage=line.process_stage,
        included=line.included,
        created_at=line.created_at,
    )


def _batch_to_response(db: Session, batch: QueueBatch) -> QueueBatchResponse:
    parent = None
    if batch.parent_item_id:
        parent = db.query(Item).filter(Item.item_id == batch.parent_item_id).first()
    return QueueBatchResponse(
        batch_id=batch.batch_id,
        batch_type=batch.batch_type,
        status=batch.status,
        owner_employee_id=batch.owner_employee_id,
        owner_name=batch.owner_name,
        parent_item_id=batch.parent_item_id,
        parent_item_name=parent.item_name if parent else None,
        parent_quantity=batch.parent_quantity,
        reference_no=batch.reference_no,
        notes=batch.notes,
        created_at=batch.created_at,
        confirmed_at=batch.confirmed_at,
        cancelled_at=batch.cancelled_at,
        lines=[_line_to_response(db, ln) for ln in batch.lines],
    )


def _get_batch_or_404(db: Session, batch_id: uuid.UUID) -> QueueBatch:
    batch = db.query(QueueBatch).filter(QueueBatch.batch_id == batch_id).first()
    if batch is None:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    return batch


def _get_line_or_404(db: Session, batch_id: uuid.UUID, line_id: uuid.UUID) -> QueueLine:
    line = (
        db.query(QueueLine)
        .filter(QueueLine.line_id == line_id, QueueLine.batch_id == batch_id)
        .first()
    )
    if line is None:
        raise HTTPException(status_code=404, detail="라인을 찾을 수 없습니다.")
    return line


# ---------------------------------------------------------------------------
# Create / List / Get
# ---------------------------------------------------------------------------


@router.post(
    "/",
    response_model=QueueBatchResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Queue 배치 생성 (OPEN, BOM 자동 로드)",
)
def create_batch(payload: QueueBatchCreateRequest, db: Session = Depends(get_db)):
    owner_emp: Optional[Employee] = None
    if payload.owner_employee_id is not None:
        owner_emp = (
            db.query(Employee)
            .filter(Employee.employee_id == payload.owner_employee_id)
            .first()
        )
        if owner_emp is None:
            raise HTTPException(status_code=404, detail="작업자를 찾을 수 없습니다.")

    if payload.parent_item_id is not None:
        parent = (
            db.query(Item).filter(Item.item_id == payload.parent_item_id).first()
        )
        if parent is None:
            raise HTTPException(status_code=404, detail="상위 품목을 찾을 수 없습니다.")

    try:
        batch = queue_svc.create_batch(
            db,
            batch_type=payload.batch_type,
            parent_item_id=payload.parent_item_id,
            parent_quantity=payload.parent_quantity,
            owner=owner_emp,
            owner_name=payload.owner_name,
            reference_no=payload.reference_no,
            notes=payload.notes,
            load_bom=payload.load_bom,
        )
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )

    db.refresh(batch)
    return _batch_to_response(db, batch)


@router.get(
    "/",
    response_model=List[QueueBatchResponse],
    summary="Queue 배치 목록 (점유자/상태 필터)",
)
def list_batches(
    status_filter: Optional[QueueBatchStatusEnum] = Query(None, alias="status"),
    owner_employee_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(QueueBatch)
    if status_filter is not None:
        q = q.filter(QueueBatch.status == status_filter)
    if owner_employee_id is not None:
        q = q.filter(QueueBatch.owner_employee_id == owner_employee_id)
    batches = (
        q.order_by(QueueBatch.created_at.desc()).offset(skip).limit(limit).all()
    )
    return [_batch_to_response(db, b) for b in batches]


@router.get(
    "/{batch_id}",
    response_model=QueueBatchResponse,
    summary="Queue 배치 상세",
)
def get_batch(batch_id: uuid.UUID, db: Session = Depends(get_db)):
    batch = _get_batch_or_404(db, batch_id)
    return _batch_to_response(db, batch)


# ---------------------------------------------------------------------------
# Line mutations (OPEN only)
# ---------------------------------------------------------------------------


@router.put(
    "/{batch_id}/lines/{line_id}",
    response_model=QueueBatchResponse,
    summary="라인 수량 변경 (BOM Override)",
)
def override_line(
    batch_id: uuid.UUID,
    line_id: uuid.UUID,
    payload: QueueLineOverrideRequest,
    db: Session = Depends(get_db),
):
    batch = _get_batch_or_404(db, batch_id)
    line = _get_line_or_404(db, batch_id, line_id)
    try:
        queue_svc.override_line_quantity(db, line, payload.quantity)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )
    db.refresh(batch)
    return _batch_to_response(db, batch)


@router.post(
    "/{batch_id}/lines/{line_id}/toggle",
    response_model=QueueBatchResponse,
    summary="라인 포함/제외 + direction 재분류 (SCRAP/LOSS 지정)",
)
def toggle_line(
    batch_id: uuid.UUID,
    line_id: uuid.UUID,
    payload: QueueLineToggleRequest,
    db: Session = Depends(get_db),
):
    batch = _get_batch_or_404(db, batch_id)
    line = _get_line_or_404(db, batch_id, line_id)
    try:
        queue_svc.toggle_line(
            db, line, included=payload.included, new_direction=payload.new_direction
        )
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )
    db.refresh(batch)
    return _batch_to_response(db, batch)


@router.post(
    "/{batch_id}/lines",
    response_model=QueueBatchResponse,
    summary="수동 라인 추가 (Scrap/Loss/IN/OUT)",
)
def add_line(
    batch_id: uuid.UUID,
    payload: QueueLineAddRequest,
    db: Session = Depends(get_db),
):
    batch = _get_batch_or_404(db, batch_id)
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")
    try:
        queue_svc.add_line(
            db,
            batch,
            item_id=payload.item_id,
            direction=payload.direction,
            quantity=payload.quantity,
            reason=payload.reason,
            process_stage=payload.process_stage,
        )
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )
    db.refresh(batch)
    return _batch_to_response(db, batch)


@router.delete(
    "/{batch_id}/lines/{line_id}",
    response_model=QueueBatchResponse,
    summary="라인 제거",
)
def delete_line(
    batch_id: uuid.UUID,
    line_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    batch = _get_batch_or_404(db, batch_id)
    line = _get_line_or_404(db, batch_id, line_id)
    try:
        queue_svc.remove_line(db, line)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )
    db.refresh(batch)
    return _batch_to_response(db, batch)


# ---------------------------------------------------------------------------
# Terminal state
# ---------------------------------------------------------------------------


@router.post(
    "/{batch_id}/confirm",
    response_model=QueueBatchResponse,
    summary="배치 확정 (Pending→Total 차감, 로그/로그/Variance 기록)",
)
def confirm_batch(batch_id: uuid.UUID, db: Session = Depends(get_db)):
    batch = _get_batch_or_404(db, batch_id)
    try:
        queue_svc.confirm_batch(db, batch)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )
    db.refresh(batch)
    return _batch_to_response(db, batch)


@router.post(
    "/{batch_id}/cancel",
    response_model=QueueBatchResponse,
    summary="배치 취소 (Pending 복구)",
)
def cancel_batch(batch_id: uuid.UUID, db: Session = Depends(get_db)):
    batch = _get_batch_or_404(db, batch_id)
    try:
        queue_svc.cancel_batch(db, batch)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )
    db.refresh(batch)
    return _batch_to_response(db, batch)
