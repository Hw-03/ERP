---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/counts.py
status: active
updated: 2026-04-27
source_sha: 5efb5d43c9ec
tags:
  - erp
  - backend
  - router
  - py
---

# counts.py

> [!summary] 역할
> FastAPI 라우터 계층의 `counts` 영역 API 엔드포인트를 담당한다.

## 원본 위치

- Source: `backend/app/routers/counts.py`
- Layer: `backend`
- Kind: `router`
- Size: `4579` bytes

## 연결

- Parent hub: [[backend/app/routers/routers|backend/app/routers]]
- Related: [[backend/backend]]

## 읽는 포인트

- 라우터는 API 표면이다. 요청/응답 계약은 `schemas.py`와 함께 확인한다.
- DB 변경은 서비스/모델/테스트까지 같이 본다.

## 원본 발췌

````python
"""Physical count router: 실사 등록 + 강제 조정.

제출 시 system_qty(현재 재고)와 diff를 자동 계산하고, diff ≠ 0이면 재고를
counted_qty로 강제 맞추고 ADJUST TransactionLog + COUNT_VARIANCE 알림을 생성.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    AlertKindEnum,
    Inventory,
    Item,
    PhysicalCount,
    StockAlert,
    TransactionLog,
    TransactionTypeEnum,
)
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    PhysicalCountCreateRequest,
    PhysicalCountResponse,
)
from app.services import inventory as inv_svc
from app.services._tx import commit_and_refresh

router = APIRouter()


def _to_response(db: Session, count: PhysicalCount) -> PhysicalCountResponse:
    item = db.query(Item).filter(Item.item_id == count.item_id).first()
    return PhysicalCountResponse(
        count_id=count.count_id,
        item_id=count.item_id,
        erp_code=item.erp_code if item else None,
        item_name=item.item_name if item else None,
        counted_qty=count.counted_qty,
        system_qty=count.system_qty,
        diff=count.diff,
        reason=count.reason,
        operator=count.operator,
        created_at=count.created_at,
    )


@router.post(
    "",
    response_model=PhysicalCountResponse,
    status_code=status.HTTP_201_CREATED,
    summary="실사 등록 + 강제 조정",
)
def submit_count(
    payload: PhysicalCountCreateRequest,
    db: Session = Depends(get_db),
):
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if item is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    inv = inv_svc.get_or_create_inventory(db, payload.item_id)
    # 실사는 창고(warehouse) 단위로 수행 (생산/불량 위치는 별도 실사 흐름 추후)
    system_qty = inv.warehouse_qty or Decimal("0")
    pending = inv.pending_quantity or Decimal("0")
    diff = payload.counted_qty - system_qty

    # Enforce physical can't go below pending (someone has reserved it)
    if payload.counted_qty < pending:
        raise http_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            ErrorCode.UNPROCESSABLE,
            (
                f"실사량이 예약 수량보다 적습니다 (counted {payload.counted_qty}, "
                f"pending {pending}). 예약 해제 후 다시 실사하세요."
            ),
        )

    count = PhysicalCount(
        item_id=payload.item_id,
        counted_qty=payload.counted_qty,
        system_qty=system_qty,
        diff=diff,
        reason=payload.reason,
        operator=payload.operator,
    )
    db.add(count)
    db.flush()

    if diff != 0:
        inv_svc.adjust_warehouse(db, payload.item_id, payload.counted_qty)
        db.add(
            TransactionLog(
                item_id=payload.item_id,
                transaction_type=TransactionTypeEnum.ADJUST,
                quantity_change=diff,
                quantity_before=system_qty,
                quantity_after=payload.counted_qty,
                produced_by=payload.operator,
                notes=f"실사 편차 조정: {payload.reason or '(사유 없음)'} (count_id={count.count_id})",
            )
        )
        db.add(
            StockAlert(
                item_id=payload.item_id,
                kind=AlertKindEnum.COUNT_VARIANCE,
                threshold=None,
                observed_value=diff,
                message=(
                    f"{item.item_name}: 실사 {payload.counted_qty} vs 시스템 "
                    f"{system_qty} (diff {diff})"
                ),
            )
        )
    commit_and_refresh(db, count)
    return _to_response(db, count)


@router.get("", response_model=List[PhysicalCountResponse], summary="실사 이력")
def list_counts(
    item_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(PhysicalCount)
    if item_id:
        q = q.filter(PhysicalCount.item_id == item_id)
    rows = q.order_by(PhysicalCount.created_at.desc()).offset(skip).limit(limit).all()
    return [_to_response(db, r) for r in rows]
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
