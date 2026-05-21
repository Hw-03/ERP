---
type: code-note
project: DEXCOWIN MES
layer: backend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/tests/routers/test_transaction_edit.py
tags: [vault, code-note, auto-generated, stub]
---

# test_transaction_edit.py

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/backend/tests/routers/test_transaction_edit.py]]

## 원본 첫 줄

```
"""거래 수정 (메타데이터 + 수량 보정) 테스트."""

from __future__ import annotations

import json
from decimal import Decimal

import pytest
from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    Item,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin


@pytest.fixture()
def editor(db_session):
    """수정 작업을 수행할 직원 (PIN 0000)."""
    emp = Employee(
        employee_code="ED01",
        name="수정담당",
        role="조립/대리",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        display_order=99,
```
