---
type: file-explanation
source_path: "backend/tests/routers/test_inventory_smoke.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_inventory_smoke.py — test_inventory_smoke.py 설명

## 이 파일은 무엇을 책임지나

`test_inventory_smoke.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_dec`
- `_location_qty`
- `test_inventory_receive_transfer_smoke`
- `test_inventory_shortage_rolls_back_transfer`

## 연결되는 파일

- [[ERP/backend/tests/routers/📁_routers]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""Inventory API smoke tests for core warehouse and department flows."""

from __future__ import annotations

from decimal import Decimal

from app.models import (
    DepartmentEnum,
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    TransactionLog,
)
from app.services import integrity as integrity_svc


def _dec(value) -> Decimal:
    return Decimal(str(value))


def _location_qty(db_session, item_id, department: DepartmentEnum) -> Decimal:
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == department,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    return loc.quantity if loc else Decimal("0")


def test_inventory_receive_transfer_smoke(client, db_session, make_item):
    item = make_item(name="스모크 재고", warehouse_qty=Decimal("0"))
    db_session.commit()

    receive = client.post(
        "/api/inventory/receive",
        json={
            "item_id": str(item.item_id),
            "quantity": "20",
            "reference_no": "SMOKE-RCV",
            "produced_by": "smoke",
        },
    )
    assert receive.status_code == 201, receive.text
    assert _dec(receive.json()["quantity"]) == Decimal("20")
    assert _dec(receive.json()["warehouse_qty"]) == Decimal("20")

    to_assembly = client.post(
        "/api/inventory/transfer-to-production",
        json={
            "item_id": str(item.item_id),
            "quantity": "8",
```
