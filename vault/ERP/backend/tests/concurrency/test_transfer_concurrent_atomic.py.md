---
type: file-explanation
source_path: "backend/tests/concurrency/test_transfer_concurrent_atomic.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_transfer_concurrent_atomic.py — test_transfer_concurrent_atomic.py 설명

## 이 파일은 무엇을 책임지나

`test_transfer_concurrent_atomic.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_setup_warehouse`
- `_setup_dept`
- `test_transfer_to_production_concurrent`
- `test_transfer_to_warehouse_concurrent`

## 연결되는 파일

- [[ERP/backend/tests/concurrency/📁_concurrency]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""동시성 테스트: transfer_to_production / transfer_to_warehouse 원자적 UPDATE 검증.

- transfer_to_production: 창고 10개, 20스레드 동시 이동 → 창고 음수 없음, 총량 불변
- transfer_to_warehouse: 부서 10개, 20스레드 동시 복귀 → 부서 음수 없음, 총량 불변
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

from app.models import DepartmentEnum, Inventory, InventoryLocation, Item, LocationStatusEnum


def _setup_warehouse(make_session, warehouse_qty: Decimal):
    session = make_session()
    item = Item(item_name="이동테스트_창고", process_type_code="TA", unit="EA")
    session.add(item)
    session.flush()
    inv = Inventory(
        item_id=item.item_id,
        quantity=warehouse_qty,
        warehouse_qty=warehouse_qty,
        pending_quantity=Decimal("0"),
    )
    session.add(inv)
    session.commit()
    item_id = item.item_id
    session.close()
    return item_id


def _setup_dept(make_session, dept_qty: Decimal, dept: DepartmentEnum):
    session = make_session()
    item = Item(item_name="이동테스트_부서", process_type_code="TA", unit="EA")
    session.add(item)
    session.flush()
    inv = Inventory(
        item_id=item.item_id,
        quantity=dept_qty,
        warehouse_qty=Decimal("0"),
        pending_quantity=Decimal("0"),
    )
    session.add(inv)
    loc = InventoryLocation(
        item_id=item.item_id,
        department=dept,
```
