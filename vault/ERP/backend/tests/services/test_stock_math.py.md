---
type: file-explanation
source_path: "backend/tests/services/test_stock_math.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_stock_math.py — test_stock_math.py 설명

## 이 파일은 무엇을 책임지나

`test_stock_math.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `test_compute_for_inventory_missing`
- `test_compute_for_warehouse_only`
- `test_compute_for_with_pending`
- `test_compute_for_with_locations`
- `test_warehouse_available_excludes_production`
- `test_total_invariant_holds`
- `test_bulk_compute_empty_input`
- `test_bulk_compute_multiple_items`
- `test_bulk_compute_unknown_id_zero_filled`
- `test_figures_from_inventory_helper_with_none`
- 그 외 1개 항목

## 연결되는 파일

- [[ERP/backend/tests/services/📁_services]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""services/stock_math.py 단위 테스트."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import DepartmentEnum, LocationStatusEnum
from app.services.stock_math import (
    StockFigures,
    bulk_compute,
    compute_for,
    figures_from_inventory,
)


D = Decimal


def test_compute_for_inventory_missing(db_session):
    """Inventory 행 없으면 모든 값 0."""
    import uuid as _uuid
    figs = compute_for(db_session, _uuid.uuid4())
    assert figs.warehouse_qty == D("0")
    assert figs.pending == D("0")
    assert figs.production_total == D("0")
    assert figs.defective_total == D("0")
    assert figs.total == D("0")
    assert figs.available == D("0")
    assert figs.warehouse_available == D("0")


def test_compute_for_warehouse_only(make_item, db_session):
    item = make_item(warehouse_qty=D("10"))
    figs = compute_for(db_session, item.item_id)
    assert figs.warehouse_qty == D("10")
    assert figs.production_total == D("0")
    assert figs.defective_total == D("0")
    assert figs.total == D("10")
    assert figs.available == D("10")
    assert figs.warehouse_available == D("10")


def test_compute_for_with_pending(make_item, db_session):
    item = make_item(warehouse_qty=D("10"), pending=D("3"))
    figs = compute_for(db_session, item.item_id)
    assert figs.pending == D("3")
    assert figs.available == D("7")  # wh - pending (no production)
    assert figs.warehouse_available == D("7")


def test_compute_for_with_locations(make_item, make_location, db_session):
    item = make_item(warehouse_qty=D("5"))
    make_location(item.item_id, status=LocationStatusEnum.PRODUCTION,
```
