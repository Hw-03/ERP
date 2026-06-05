---
type: file-explanation
source_path: "backend/app/services/io.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# io.py — io.py 설명

## 이 파일은 무엇을 책임지나

`io.py`는 `io` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_d`
- `_new_id`
- `_enum_value`
- `_get_item`
- `_has_children`
- `_bucket_available`
- `_default_production_dept`
- `_line_dict`
- `_route_for_sub_type`
- `_direct_item_bundle`
- 그 외 8개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/routers/io.py]] — `io.py`는 `io` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

서비스는 DB 변경을 포함할 수 있습니다. 같은 도메인의 라우터, 모델, 테스트를 함께 확인해야 합니다.

## 핵심 발췌

```python
"""입출고 탭 2.0 orchestration service.

This layer keeps the new UX context (bundle/auto lines/excluded lines) while
delegating actual stock movement to the existing inventory and stock request
services.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Iterable, Optional, Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    DepartmentEnum,
    Employee,
    InventoryLocation,
    IoBatch,
    IoBundle,
    IoLine,
    Item,
    LocationStatusEnum,
    RequestBucketEnum,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import bom as bom_svc
from app.services import inventory as inventory_svc
from app.services import stock_requests as stock_request_svc


WORK_TYPES = {"receive", "warehouse_io", "process", "defect"}
APPROVAL_SUB_TYPES = {"warehouse_to_dept", "dept_to_warehouse", "defect_quarantine"}
# 낱개 라인 origin — 부서 결재 정/부 승인 필요.
MANUAL_LINE_ORIGINS = frozenset({"manual", "adjust_in", "adjust_out"})


def _d(value) -> Decimal:
    return Decimal(str(value or "0"))


def _new_id() -> uuid.UUID:
    return uuid.uuid4()


def _enum_value(value) -> Optional[str]:
    if value is None:
        return None
```
