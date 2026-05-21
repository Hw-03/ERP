---
type: code-note
project: DEXCOWIN MES
layer: backend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/tests/routers/test_dept_adjustment.py
tags: [vault, code-note, auto-generated, stub]
---

# test_dept_adjustment.py

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/backend/tests/routers/test_dept_adjustment.py]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"""routers/dept_adjustment.py 통합 테스트."""

from __future__ import annotations

from decimal import Decimal

from app.models import DepartmentEnum, LocationStatusEnum

D = Decimal
ASSEMBLY = DepartmentEnum.ASSEMBLY


def _prod_qty(db_session, item_id, dept=ASSEMBLY) -> Decimal:
    from app.models import InventoryLocation
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    return loc.quantity if loc else D("0")


# ──────────────────────────── bom-template ────────────────────────────

def test_get_bom_template_production(client, db_session, make_item, make_bom):
    parent = make_item(name="AF")
```
