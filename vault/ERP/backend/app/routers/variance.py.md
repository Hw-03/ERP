---
type: file-explanation
source_path: "backend/app/routers/variance.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# variance.py — variance.py 설명

## 이 파일은 무엇을 책임지나

`variance.py`는 `variance` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_to_response`
- `list_variance`
- `API GET ""`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/schemas/📁_schemas]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
"""Variance log router: BOM expected vs actual 차이 조회 (읽기 전용)."""

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
        item_id=log.item_id,
        item_code=item.item_code if item else None,
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
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(VarianceLog)
    if item_id:
        q = q.filter(VarianceLog.item_id == item_id)
    rows = q.order_by(VarianceLog.created_at.desc()).offset(skip).limit(limit).all()
    return [_to_response(db, r) for r in rows]
```
