---
type: file-explanation
source_path: "backend/tests/concurrency/test_approve_concurrent.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_approve_concurrent.py — test_approve_concurrent.py 설명

## 이 파일은 무엇을 책임지나

`test_approve_concurrent.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_setup`
- `test_concurrent_approve_only_once`

## 연결되는 파일

- [[ERP/backend/tests/concurrency/📁_concurrency]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""동시성 테스트: 같은 StockRequest 를 여러 스레드가 동시 승인해도 1건만 처리.

SQLite WAL + busy_timeout 으로 직렬화되며, approve_request 내 멱등 처리로
이미 COMPLETED 된 요청에 대한 재승인은 200(멱등) 반환.
검증: TransactionLog 가 라인당 1건만 기록되어야 한다.
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


def _setup(make_session):
    """테스트용 직원(요청자 + 승인자) + 품목 + 재고 + RESERVED 요청 생성."""
    session = make_session()

    requester = Employee(
        employee_code="CREQ01",
        name="요청자",
        role="조립/사원",
        department=DepartmentEnum.ASSEMBLY.value,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        display_order=0,
    )
    approver = Employee(
        employee_code="CWHA01",
        name="창고담당자",
        role="조립/사원",
        department=DepartmentEnum.ASSEMBLY.value,
```
