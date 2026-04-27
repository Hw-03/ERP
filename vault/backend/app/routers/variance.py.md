---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/variance.py
status: active
updated: 2026-04-27
source_sha: 06c6a5180542
tags:
  - erp
  - backend
  - router
  - py
---

# variance.py

> [!summary] 역할
> FastAPI 라우터 계층의 `variance` 영역 API 엔드포인트를 담당한다.

## 원본 위치

- Source: `backend/app/routers/variance.py`
- Layer: `backend`
- Kind: `router`
- Size: `1711` bytes

## 연결

- Parent hub: [[backend/app/routers/routers|backend/app/routers]]
- Related: [[backend/backend]]

## 읽는 포인트

- 라우터는 API 표면이다. 요청/응답 계약은 `schemas.py`와 함께 확인한다.
- DB 변경은 서비스/모델/테스트까지 같이 본다.

## 원본 발췌

````python
"""Variance log router: BOM expected vs actual 차이 조회 (읽기 전용).

Queue confirm 시 자동 생성됨. UI는 배치 사후 분석과 품목별 누적 편차
대시보드에서 사용.
"""

from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, VarianceLog
from app.schemas import VarianceLogResponse

router = APIRouter()


def _to_response(db: Session, log: VarianceLog) -> VarianceLogResponse:
    item = db.query(Item).filter(Item.item_id == log.item_id).first()
    return VarianceLogResponse(
        var_id=log.var_id,
        batch_id=log.batch_id,
        item_id=log.item_id,
        erp_code=item.erp_code if item else None,
        item_name=item.item_name if item else None,
        bom_expected=log.bom_expected,
        actual_used=log.actual_used,
        diff=log.diff,
        note=log.note,
        created_at=log.created_at,
    )


@router.get("", response_model=List[VarianceLogResponse], summary="Variance 로그 조회")
def list_variance(
    item_id: Optional[uuid.UUID] = Query(None),
    batch_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(VarianceLog)
    if item_id:
        q = q.filter(VarianceLog.item_id == item_id)
    if batch_id:
        q = q.filter(VarianceLog.batch_id == batch_id)
    rows = q.order_by(VarianceLog.created_at.desc()).offset(skip).limit(limit).all()
    return [_to_response(db, r) for r in rows]
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
