---
type: file-explanation
source_path: "backend/app/routers/inventory/transactions.py"
importance: critical
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# transactions.py — transactions.py 설명

## 이 파일은 무엇을 책임지나

`transactions.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

> 목록·요약·내보내기가 공유하는 쿼리 필터·응답 빌더 헬퍼는 [[ERP/backend/app/routers/inventory/_tx_filters.py]] 로 분리되었습니다(예: `_apply_common_filters`, `_to_log_response`, 라벨 매핑 상수). 이 파일은 엔드포인트 로직을 맡고 그 헬퍼를 import 합니다.

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `TransactionSummaryResponse`
- `_department_label_expr`
- `_process_step_filter`
- `_model_filter`
- `_department_filter`
- `_operation_filter`
- `_require_export_range`
- `_enforce_export_limit`
- `_to_log_response`
- `_log_snapshot`
- 그 외 8개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/services/inventory.py]] — 입고, 출고, 부서 이동, 불량 처리처럼 실제 재고 숫자를 바꾸는 업무 규칙을 담은 핵심 파일입니다.
- [[ERP/backend/app/services/stock_math.py]] — 여러 재고 숫자를 일관된 방식으로 계산하고 검증하기 위한 보조 함수입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

이 파일은 운영 데이터, 재고 수량, 승인 상태, DB 구조, 백업/복구 중 하나와 직접 연결됩니다. 수정 전에는 관련 테스트, 백업 여부, 연결 화면/API를 반드시 확인해야 합니다.

## 핵심 발췌

```python
"""거래 이력: /transactions, /transactions/export.csv|.xlsx, 메타/수량 수정 + 수정 이력."""

from __future__ import annotations

import csv
import json
import uuid
from datetime import UTC, date, datetime, time
from decimal import Decimal
from io import StringIO
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Employee,
    IoBatch,
    Inventory,
    Item,
    ItemModel,
    ProductSymbol,
    TransactionEditLog,
    TransactionLog,
    TransactionTypeEnum,
)
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    TransactionEditLogResponse,
    TransactionLogResponse,
    TransactionMetaEditRequest,
    TransactionQuantityCorrectionRequest,
    TransactionQuantityCorrectionResponse,
)
from app.services import audit, inventory as inventory_svc
from app.services._tx import commit_only
from app.services.export_helpers import csv_streaming_response
from app.services.pin_auth import verify_pin


router = APIRouter()


# 단일 export 요청에서 허용하는 최대 행 수. 운영 PC 메모리 보호용 안전 상한.
EXPORT_MAX_ROWS = 50_000


# 메타데이터(notes/reference_no/produced_by) 수정이 허용되는 거래 타입.
# 복합 거래(PRODUCE/BACKFLUSH 등)는 수정 금지.
META_CORRECTABLE = {
    TransactionTypeEnum.RECEIVE,
    TransactionTypeEnum.SHIP,
```
