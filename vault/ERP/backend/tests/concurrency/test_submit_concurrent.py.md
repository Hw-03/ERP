---
type: file-explanation
source_path: "backend/tests/concurrency/test_submit_concurrent.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_submit_concurrent.py — test_submit_concurrent.py 설명

## 이 파일은 무엇을 책임지나

`test_submit_concurrent.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_setup`
- `test_submit_draft_concurrent`

## 연결되는 파일

- [[ERP/backend/tests/concurrency/📁_concurrency]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""동시성 테스트: 같은 DRAFT 를 30스레드가 동시에 submit.

기대: 하나만 RESERVED/COMPLETED/SUBMITTED 로 전환, 나머지는 에러.
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
)
from app.services import stock_requests as svc


def _setup(make_session):
    session = make_session()

    emp = Employee(
        employee_code="CSUB01",
        name="제출테스트직원",
        role="조립/사원",
        department=DepartmentEnum.ASSEMBLY.value,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        display_order=0,
    )
    session.add(emp)
    session.flush()

    item = Item(item_name="제출테스트품목", process_type_code="TR", unit="EA")
    session.add(item)
    session.flush()

    inv = Inventory(
        item_id=item.item_id,
        quantity=Decimal("100"),
```
