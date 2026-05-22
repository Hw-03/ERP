---
type: file-explanation
source_path: "backend/tests/concurrency/test_cancel_approve_conflict.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_cancel_approve_conflict.py — test_cancel_approve_conflict.py 설명

## 이 파일은 무엇을 책임지나

`test_cancel_approve_conflict.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_setup_reserved_request`
- `test_approve_cancel_conflict`
- `test_reject_cancel_conflict`
- `test_re_approve_completed_idempotent`

## 연결되는 파일

- [[ERP/backend/tests/concurrency/📁_concurrency]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""동시성 테스트: approve/reject/cancel 동시 충돌 전체 시나리오.

1. approve + cancel 동시 충돌 → 터미널 상태 하나만
2. reject + cancel 동시 충돌 → 터미널 상태 하나만
3. 이미 COMPLETED 요청 재승인 → 멱등 처리 (에러 없음)
4. 이미 REJECTED 요청 재반려 → 멱등 처리 (에러 없음)
"""

from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from decimal import Decimal
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    Item,
    RequestBucketEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
)
from app.services import stock_requests as svc
from app.services.pin_auth import DEFAULT_PIN_HASH


def _setup_reserved_request(make_session, suffix: str):
    session = make_session()

    requester = Employee(
        employee_code=f"CCR{suffix}",
        name=f"요청자_{suffix}",
        role="조립/사원",
        department=DepartmentEnum.ASSEMBLY.value,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        display_order=0,
    )
    approver = Employee(
        employee_code=f"CWH{suffix}",
        name=f"창고담당_{suffix}",
        role="조립/사원",
        department=DepartmentEnum.ASSEMBLY.value,
```
