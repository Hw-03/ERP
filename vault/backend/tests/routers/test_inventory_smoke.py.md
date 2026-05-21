---
type: code-note
project: DEXCOWIN MES
layer: backend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/tests/routers/test_inventory_smoke.py
tags: [vault, code-note, auto-generated, stub]
---

# test_inventory_smoke.py

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/backend/tests/routers/test_inventory_smoke.py]]

## 원본 첫 줄

```
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
```
