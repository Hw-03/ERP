---
type: file-explanation
source_path: "backend/app/services/stock_requests.py"
importance: critical
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# stock_requests.py — 입출고 요청과 승인 흐름

## 이 파일은 무엇을 책임지나

현장 담당자가 요청을 제출하고 창고가 승인/반려/취소하는 흐름을 처리하는 서비스입니다.

## 업무 흐름에서의 의미

아직 처리되지 않은 요청과 실제 재고 처리 완료를 구분하는 업무 규칙이 들어 있습니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `LineInput`
- `FailedApprovalError`
- `RequestNotFoundError`
- `line_requires_approval`
- `line_requires_pending`
- `request_requires_approval`
- `_generate_request_code`
- `validate_line_shape_for_request_type`
- `_validate_lines`
- `_preflight_inventory_check`
- 그 외 8개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/routers/stock_requests.py]] — 프론트의 입출고 요청 작성, 내 요청, 창고 승인함이 호출하는 API 입구입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

상태 전이가 꼬이면 승인 대기 수량, 요청 목록, 실제 재고 처리가 어긋납니다.

## 핵심 발췌

```python
"""StockRequest 서비스 — 작업자 결재 요청 흐름.

원칙:
- 창고 재고가 움직이는 모든 작업(`from_bucket=='warehouse'` 또는 `to_bucket=='warehouse'`)은
  창고 담당자(`warehouse_role in ('primary','deputy')`)의 승인 후에만 실재고 반영.
- 점유는 `Inventory.pending_quantity` 컬럼으로 관리하고, origin 구분은
  `StockRequestLine` 조회로 한다 (별도 컬럼 추가하지 않음).
- 승인은 한 트랜잭션 내에서 release + 실재고 이동 + TransactionLog 기록을 모두 수행한다.
  성공하면 `completed`, 검증 실패하면 `failed_approval` 로 저장하고 pending 을 안전하게 원복.
- 승인 불필요 작업(`production ↔ production`)은 즉시 실행되고 `completed` 상태로 기록.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Iterable, List, Optional, Sequence

from sqlalchemy.orm import Session

from app.models import (
    DepartmentEnum,
    Employee,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    RequestBucketEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.database import _is_sqlite
from app.services import inventory as inventory_svc
from app.services.dept_hierarchy import can_approve_department
from app.services.pin_auth import verify_pin


# ---------------------------------------------------------------------------
# 정책 상수
# ---------------------------------------------------------------------------

# request_type → 승인 시 호출할 거래 유형 (TransactionLog.transaction_type)
_TX_TYPE_BY_REQUEST: dict[StockRequestTypeEnum, TransactionTypeEnum] = {
    StockRequestTypeEnum.RAW_RECEIVE: TransactionTypeEnum.RECEIVE,
    StockRequestTypeEnum.RAW_SHIP: TransactionTypeEnum.SHIP,
    StockRequestTypeEnum.WAREHOUSE_TO_DEPT: TransactionTypeEnum.TRANSFER_TO_PROD,
    StockRequestTypeEnum.DEPT_TO_WAREHOUSE: TransactionTypeEnum.TRANSFER_TO_WH,
    StockRequestTypeEnum.DEPT_INTERNAL: TransactionTypeEnum.TRANSFER_DEPT,
    StockRequestTypeEnum.MARK_DEFECTIVE_WH: TransactionTypeEnum.MARK_DEFECTIVE,
    StockRequestTypeEnum.MARK_DEFECTIVE_PROD: TransactionTypeEnum.MARK_DEFECTIVE,
```
