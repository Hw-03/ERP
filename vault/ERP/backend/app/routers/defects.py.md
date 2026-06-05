---
type: file-explanation
source_path: "backend/app/routers/defects.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# defects.py — defects.py 설명

## 이 파일은 무엇을 책임지나

`defects.py`는 `defects` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DefectLocationItem`
- `DefectKpi`
- `QuarantineRequest`
- `UnquarantineRequest`
- `DefectActionResult`
- `_dept_enum`
- `list_defect_locations`
- `get_defect_kpi`
- `quarantine`
- `unquarantine`
- 그 외 4개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/frontend/lib/api/defects.ts]] — `defects.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
"""불량 처리 허브 API — Phase 2 백엔드.

엔드포인트:
  GET  /api/defects/locations    부서·아이템별 DEFECTIVE 목록
  GET  /api/defects/kpi          KPI 카드 (격리중/1년이상/결재대기/오늘처리)
  POST /api/defects/quarantine   격리 (mark_defective 래퍼)
  POST /api/defects/unquarantine 정상 복귀 (unmark_defective 래퍼)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    DepartmentEnum,
    Employee,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.routers._errors import ErrorCode, http_error
from app.services import inventory as inventory_svc

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class DefectLocationItem(BaseModel):
    item_id: uuid.UUID
    item_name: str
    item_code: Optional[str]
    department: str
    quantity: Decimal
    defective_at: Optional[datetime]
    reason_category: Optional[str]
    reason_memo: Optional[str]
```
