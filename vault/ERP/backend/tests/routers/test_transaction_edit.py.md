---
type: file-explanation
source_path: "backend/tests/routers/test_transaction_edit.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_transaction_edit.py — test_transaction_edit.py 설명

## 이 파일은 무엇을 책임지나

`test_transaction_edit.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `editor`
- `receive_log`
- `ship_log`
- `test_meta_edit_requires_reason`
- `test_meta_edit_wrong_pin_403`
- `test_meta_edit_success_records_history`
- `test_meta_edit_blocks_unsupported_type`
- `test_list_transactions_returns_edit_count`
- `test_quantity_correct_receive_creates_adjust`
- `test_quantity_correct_ship_must_be_negative`
- 그 외 8개 항목

## 연결되는 파일

- [[ERP/backend/tests/routers/📁_routers]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
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
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(emp)
    db_session.commit()
    return emp


@pytest.fixture()
def receive_log(db_session, make_item):
    """RECEIVE 거래 + 재고 100."""
    item = make_item(name="테스트입고품", warehouse_qty=Decimal("100"))
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("100"),
        quantity_before=Decimal("0"),
        quantity_after=Decimal("100"),
        reference_no="REF-001",
        produced_by="원작성자(조립)",
        notes="원본 메모",
    )
    db_session.add(log)
    db_session.commit()
    return log, item
```
