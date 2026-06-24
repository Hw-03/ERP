---
type: file-explanation
source_path: "backend/app/routers/stock_requests.py"
importance: critical
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# stock_requests.py — 입출고 요청 API

## 이 파일은 무엇을 책임지나

프론트의 입출고 요청 작성, 내 요청, 창고 승인함이 호출하는 API 입구입니다.

## 업무 흐름에서의 의미

현장 요청과 창고 승인을 시스템에 기록하는 핵심 통로입니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `create_stock_request`
- `list_stock_requests`
- `list_warehouse_queue`
- `count_warehouse_queue`
- `list_department_queue`
- `count_department_queue`
- `list_item_reservations`
- `upsert_stock_request_draft`
- `get_stock_request_draft`
- `list_stock_request_drafts`
- 그 외 11개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/services/stock_requests.py]] — 현장 담당자가 요청을 제출하고 창고가 승인/반려/취소하는 흐름을 처리하는 서비스입니다.
- [[ERP/backend/app/schemas/📁_schemas]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.

## 조심할 점

상태값, 권한, 응답 형식이 바뀌면 입출고 화면 전체가 영향을 받습니다.

## 핵심 발췌

```python
"""StockRequest 라우터 — 작업자 결재 요청 / 창고 담당자 승인 흐름.

기존 `/api/inventory/*` 즉시 입출고 API 는 그대로 유지된다. 본 라우터는 별도 도메인.
"""

from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from sqlalchemy.exc import IntegrityError

from app.database import get_db, _is_sqlite
from app.models import (
    Employee,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.routers._errors import ErrorCode, http_error
from app.services.dept_hierarchy import approvable_departments
from app.schemas import (
    ReservationLineResponse,
    StockRequestActionRequest,
    StockRequestCreate,
    StockRequestDraftUpsert,
    StockRequestResponse,
    StockRequestSubmitPayload,
)
from app.services import stock_requests as svc
from app.services._tx import commit_and_refresh, commit_only


router = APIRouter()


# ---------------------------------------------------------------------------
# 요청 생성
# ---------------------------------------------------------------------------


@router.post("", response_model=StockRequestResponse, status_code=status.HTTP_201_CREATED)
def create_stock_request(payload: StockRequestCreate, db: Session = Depends(get_db)):
    requester = (
        db.query(Employee)
        .filter(Employee.employee_id == payload.requester_employee_id)
        .first()
    )
    if requester is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "요청자(직원)를 찾을 수 없습니다.")
    if not bool(requester.is_active):
```
