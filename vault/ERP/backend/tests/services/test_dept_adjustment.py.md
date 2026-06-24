---
type: file-explanation
source_path: "backend/tests/services/test_dept_adjustment.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_dept_adjustment.py — test_dept_adjustment.py 설명

## 이 파일은 무엇을 책임지나

`test_dept_adjustment.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_prod_qty`
- `_defective_qty`
- `_tx_types`
- `test_production_template_basic`
- `test_production_template_no_bom`
- `test_disassembly_template_basic`
- `test_expand_component`
- `test_expand_component_no_children_raises`
- `test_submit_production`
- `test_submit_production_manual_edit`
- 그 외 2개 항목

## 연결되는 파일

- [[ERP/backend/tests/services/📁_services]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""services/dept_adjustment.py 단위 테스트."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import DepartmentEnum, DeptAdjSubTypeEnum, LocationStatusEnum, TransactionTypeEnum
from app.services import dept_adjustment as svc
from app.services import inventory as inv_svc

D = Decimal
ASSEMBLY = DepartmentEnum.ASSEMBLY


# ──────────────────────────── helpers ────────────────────────────

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


def _defective_qty(db_session, item_id, dept=ASSEMBLY) -> Decimal:
    from app.models import InventoryLocation
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
        )
        .first()
    )
    return loc.quantity if loc else D("0")


def _tx_types(db_session) -> list[str]:
    from app.models import TransactionLog
    return [r.transaction_type.value for r in db_session.query(TransactionLog).all()]


# ──────────────────────────── 템플릿 빌더 ────────────────────────────

def test_production_template_basic(make_item, make_bom, db_session):
    parent = make_item(name="AF", process_type_code="AF")
```
