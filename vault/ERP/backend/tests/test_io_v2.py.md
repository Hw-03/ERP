---
type: file-explanation
source_path: "backend/tests/test_io_v2.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_io_v2.py — test_io_v2.py 설명

## 이 파일은 무엇을 책임지나

`test_io_v2.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_make_employee`
- `test_io_preview_receive_does_not_expand_bom`
- `test_io_preview_warehouse_to_dept_expands_one_bom_level`
- `test_io_submit_approval_uses_only_included_lines`
- `test_io_submit_receive_is_immediate`
- `test_io_submit_draft_endpoint_completes_batch`
- `test_io_submit_idempotent_with_client_request_id`
- `test_io_immediate_adjust_in_increases_production_quantity`
- `test_io_immediate_adjust_out_decreases_production_quantity`
- `test_io_submit_adjust_out_blocks_on_shortage`
- 그 외 1개 항목

## 연결되는 파일

- [[ERP/backend/tests/📁_tests]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
from __future__ import annotations

from decimal import Decimal

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    IoBatch,
    IoLine,
    LocationStatusEnum,
    StockRequest,
    StockRequestLine,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services.pin_auth import DEFAULT_PIN_HASH


def _make_employee(
    db_session,
    *,
    code: str = "IO01",
    name: str = "IO Tester",
    department: DepartmentEnum = DepartmentEnum.ASSEMBLY,
    warehouse_role: str = "none",
    department_role: str = "none",
) -> Employee:
    employee = Employee(
        employee_code=code,
        name=name,
        role=f"{department.value}/staff",
        department=department,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role=warehouse_role,
        department_role=department_role,
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def test_io_preview_receive_does_not_expand_bom(client, db_session, make_item, make_bom):
    parent = make_item(name="Parent", warehouse_qty=Decimal("0"))
    child = make_item(name="Child", warehouse_qty=Decimal("0"))
    make_bom(parent.item_id, child.item_id, Decimal("2"))
    requester = _make_employee(db_session)
    db_session.commit()

    res = client.post(
```
