---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/scrap.py
status: active
updated: 2026-04-27
source_sha: e2a4e0037b45
tags:
  - erp
  - backend
  - router
  - py
---

# scrap.py

> [!summary] 역할
> FastAPI 라우터 계층의 `scrap` 영역 API 엔드포인트를 담당한다.

## 원본 위치

- Source: `backend/app/routers/scrap.py`
- Layer: `backend`
- Kind: `router`
- Size: `3528` bytes

## 연결

- Parent hub: [[backend/app/routers/routers|backend/app/routers]]
- Related: [[backend/backend]]

## 읽는 포인트

- 라우터는 API 표면이다. 요청/응답 계약은 `schemas.py`와 함께 확인한다.
- DB 변경은 서비스/모델/테스트까지 같이 본다.

## 원본 발췌

````python
"""Scrap log router: 폐기(불량) 이력 기록 및 조회."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Inventory,
    Item,
    ScrapLog,
    TransactionLog,
    TransactionTypeEnum,
)
from app.routers._errors import ErrorCode, http_error
from app.schemas import ScrapLogCreateRequest, ScrapLogResponse
from app.services import inventory as inv_svc
from app.services._tx import commit_and_refresh

router = APIRouter()


def _to_response(db: Session, log: ScrapLog) -> ScrapLogResponse:
    item = db.query(Item).filter(Item.item_id == log.item_id).first()
    return ScrapLogResponse(
        scrap_id=log.scrap_id,
        item_id=log.item_id,
        erp_code=item.erp_code if item else None,
        item_name=item.item_name if item else None,
        quantity=log.quantity,
        process_stage=log.process_stage,
        reason=log.reason,
        batch_id=log.batch_id,
        operator=log.operator,
        created_at=log.created_at,
    )


@router.post(
    "",
    response_model=ScrapLogResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Scrap(폐기) 기록 + 재고 차감",
)
def create_scrap(payload: ScrapLogCreateRequest, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if item is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    inv = inv_svc.get_or_create_inventory(db, payload.item_id)
    wh = inv.warehouse_qty or Decimal("0")
    pending = inv.pending_quantity or Decimal("0")
    if wh - pending < payload.quantity:
        raise http_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            ErrorCode.STOCK_SHORTAGE,
            (
                f"창고 가용 재고 부족 (창고 {wh}, 예약중 {pending}, "
                f"요청 {payload.quantity})."
            ),
        )

    inv, qty_before = inv_svc.consume_warehouse(db, payload.item_id, payload.quantity)

    log = ScrapLog(
        item_id=payload.item_id,
        quantity=payload.quantity,
        process_stage=payload.process_stage,
        reason=payload.reason,
        operator=payload.operator,
    )
    db.add(log)
    db.add(
        TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.SCRAP,
            quantity_change=-payload.quantity,
            quantity_before=qty_before,
            quantity_after=inv.quantity,
            produced_by=payload.operator,
            notes=payload.reason,
        )
    )
    commit_and_refresh(db, log)
    return _to_response(db, log)


@router.get("", response_model=List[ScrapLogResponse], summary="Scrap 로그 조회")
def list_scrap(
    item_id: Optional[uuid.UUID] = Query(None),
    batch_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(ScrapLog)
    if item_id:
        q = q.filter(ScrapLog.item_id == item_id)
    if batch_id:
        q = q.filter(ScrapLog.batch_id == batch_id)
    rows = q.order_by(ScrapLog.created_at.desc()).offset(skip).limit(limit).all()
    return [_to_response(db, r) for r in rows]
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
