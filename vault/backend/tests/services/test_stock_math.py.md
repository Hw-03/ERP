---
type: code-note
project: ERP
layer: backend
source_path: erp/backend/tests/services/test_stock_math.py
status: active
updated: 2026-04-27
source_sha: ed1514ae8be9
tags:
  - erp
  - backend
  - test
  - py
---

# test_stock_math.py

> [!summary] 역할
> 현재 ERP 동작을 회귀 없이 유지하기 위한 자동 테스트 파일이다.

## 원본 위치

- Source: `backend/tests/services/test_stock_math.py`
- Layer: `backend`
- Kind: `test`
- Size: `5236` bytes

## 연결

- Parent hub: [[backend/tests/services/services|backend/tests/services]]
- Related: [[backend/backend]]

## 읽는 포인트

- 기능 변경 후 같은 영역 테스트를 먼저 확인한다.
- 테스트가 문서보다 최신 동작을 더 정확히 말해줄 때가 많다.

## 원본 발췌

````python
"""services/stock_math.py 단위 테스트."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import CategoryEnum, DepartmentEnum, LocationStatusEnum
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
# ... (이하 98줄 생략. 원본 참조)

````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
