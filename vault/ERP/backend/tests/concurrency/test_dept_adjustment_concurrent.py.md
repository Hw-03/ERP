---
type: file-explanation
source_path: "backend/tests/concurrency/test_dept_adjustment_concurrent.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_dept_adjustment_concurrent.py — test_dept_adjustment_concurrent.py 설명

## 이 파일은 무엇을 책임지나

`test_dept_adjustment_concurrent.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_setup_two_items`
- `test_concurrent_dept_adjustment_no_deadlock`

## 연결되는 파일

- [[ERP/backend/tests/concurrency/📁_concurrency]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""동시성 테스트: submit_adjustment() — 교차 아이템 조정 시 deadlock 없음, 음수 없음.

핵심: 10스레드는 [A→out, B→out] 순서, 10스레드는 [B→out, A→out] 순서로 조정.
정렬된 선락(lock_inventories) 적용 후에는 교착 없이 완료되어야 한다.
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
from app.models import DeptAdjSubTypeEnum


def _setup_two_items(make_session, loc_qty: Decimal, dept: DepartmentEnum):
    session = make_session()
    item_a = Item(item_name="조정테스트A", process_type_code="TR", unit="EA")
    item_b = Item(item_name="조정테스트B", process_type_code="TR", unit="EA")
    session.add_all([item_a, item_b])
    session.flush()

    for item in [item_a, item_b]:
        inv = Inventory(
            item_id=item.item_id,
            quantity=loc_qty,
            warehouse_qty=Decimal("0"),
            pending_quantity=Decimal("0"),
        )
        session.add(inv)
        session.flush()
        loc = InventoryLocation(
            item_id=item.item_id,
            department=dept,
            status=LocationStatusEnum.PRODUCTION,
            quantity=loc_qty,
        )
        session.add(loc)

    session.commit()
    ids = item_a.item_id, item_b.item_id
    session.close()
    return ids


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_dept_adjustment_no_deadlock(concurrent_engine, make_session):
```
