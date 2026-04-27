---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/queue.py
status: active
updated: 2026-04-27
source_sha: 6f5196c09ff6
tags:
  - erp
  - backend
  - router
  - py
---

# queue.py

> [!summary] 역할
> FastAPI 라우터 계층의 `queue` 영역 API 엔드포인트를 담당한다.

## 원본 위치

- Source: `backend/app/routers/queue.py`
- Layer: `backend`
- Kind: `router`
- Size: `13205` bytes

## 연결

- Parent hub: [[backend/app/routers/routers|backend/app/routers]]
- Related: [[backend/backend]]

## 읽는 포인트

- 라우터는 API 표면이다. 요청/응답 계약은 `schemas.py`와 함께 확인한다.
- DB 변경은 서비스/모델/테스트까지 같이 본다.

## 원본 발췌

> 전체 395줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````python
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
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import (
    Employee,
    Item,
    QueueBatch,
    QueueBatchStatusEnum,
    QueueLine,
)
from app.routers._errors import ErrorCode, http_error
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


def _line_to_response(
    db: Session,
    line: QueueLine,
    *,
    item: Optional[Item] = None,
) -> QueueLineResponse:
    """item 을 주입하면 per-line Item 쿼리를 건너뛴다 (list_batches 경로 N+1 방지)."""
    resolved_item = item
    if resolved_item is None and line.item_id is not None:
        resolved_item = db.query(Item).filter(Item.item_id == line.item_id).first()
    return QueueLineResponse(
        line_id=line.line_id,
        batch_id=line.batch_id,
        item_id=line.item_id,
        erp_code=resolved_item.erp_code if resolved_item else None,
        item_name=resolved_item.item_name if resolved_item else None,
        direction=line.direction,
        quantity=line.quantity,
        bom_expected=line.bom_expected,
        reason=line.reason,
        process_stage=line.process_stage,
        included=line.included,
        created_at=line.created_at,
    )


def _batch_to_response(
    db: Session,
    batch: QueueBatch,
    *,
    items_by_id: Optional[dict] = None,
) -> QueueBatchResponse:
    """items_by_id 를 주입하면 parent / line item 쿼리를 생략한다."""
    parent = None
    if batch.parent_item_id:
        if items_by_id is not None:
            parent = items_by_id.get(batch.parent_item_id)
        if parent is None:
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
        lines=[
            _line_to_response(
                db,
                ln,
                item=(items_by_id.get(ln.item_id) if items_by_id else None),
            )
            for ln in batch.lines
        ],
    )


def _prefetch_items_for_batches(db: Session, batches: list[QueueBatch]) -> dict:
    """list_batches bulk 경로용 — parent + 모든 라인의 item_id 를 한 번에 fetch."""
    item_ids: set = set()
    for b in batches:
        if b.parent_item_id:
            item_ids.add(b.parent_item_id)
        for ln in b.lines:
            if ln.item_id:
                item_ids.add(ln.item_id)
    if not item_ids:
        return {}
    return {
        it.item_id: it
        for it in db.query(Item).filter(Item.item_id.in_(item_ids)).all()
    }


def _get_batch_or_404(db: Session, batch_id: uuid.UUID) -> QueueBatch:
    batch = db.query(QueueBatch).filter(QueueBatch.batch_id == batch_id).first()
    if batch is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "배치를 찾을 수 없습니다.")
    return batch


def _get_line_or_404(db: Session, batch_id: uuid.UUID, line_id: uuid.UUID) -> QueueLine:
    line = (
        db.query(QueueLine)
        .filter(QueueLine.line_id == line_id, QueueLine.batch_id == batch_id)
        .first()
    )
    if line is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "라인을 찾을 수 없습니다.")
    return line


# ---------------------------------------------------------------------------
# Create / List / Get
# ---------------------------------------------------------------------------


@router.post(
    "",
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
            raise http_error(404, ErrorCode.NOT_FOUND, "작업자를 찾을 수 없습니다.")

    if payload.parent_item_id is not None:
        parent = (
            db.query(Item).filter(Item.item_id == payload.parent_item_id).first()
        )
        if parent is None:
            raise http_error(404, ErrorCode.NOT_FOUND, "상위 품목을 찾을 수 없습니다.")

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
        raise http_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.UNPROCESSABLE, str(exc)
        )

    db.refresh(batch)
    return _batch_to_response(db, batch)


@router.get(
    "",
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
    q = db.query(QueueBatch).options(selectinload(QueueBatch.lines))
    if status_filter is not None:
        q = q.filter(QueueBatch.status == status_filter)
    if owner_employee_id is not None:
        q = q.filter(QueueBatch.owner_employee_id == owner_employee_id)
    batches = (
        q.order_by(QueueBatch.created_at.desc()).offset(skip).limit(limit).all()
    )
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
