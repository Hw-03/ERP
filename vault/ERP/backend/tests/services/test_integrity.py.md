---
type: file-explanation
source_path: "backend/tests/services/test_integrity.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_integrity.py — test_integrity.py 설명

## 이 파일은 무엇을 책임지나

`test_integrity.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `test_check_consistency_no_mismatch`
- `test_check_consistency_with_locations_balanced`
- `test_check_consistency_quantity_too_high`
- `test_check_consistency_quantity_too_low`
- `test_repair_dry_run_does_not_write`
- `test_repair_actually_fixes`
- `test_repair_samples_capped_at_20`
- `test_check_consistency_zero_amounts_balanced`
- `test_check_consistency_with_orphan_location`
- `test_repair_dry_run_idempotent`
- 그 외 4개 항목

## 연결되는 파일

- [[ERP/backend/tests/services/📁_services]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""services/integrity.py 단위 테스트."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import LocationStatusEnum
from app.services.integrity import check_inventory_consistency, repair_inventory_totals


D = Decimal


def test_check_consistency_no_mismatch(make_item, db_session):
    """warehouse 만 있고 위치 없음 + recorded == warehouse → 미스매치 0."""
    make_item(warehouse_qty=D("10"))
    mismatches = check_inventory_consistency(db_session)
    assert mismatches == []


def test_check_consistency_with_locations_balanced(make_item, make_location, db_session):
    """warehouse + Σ loc == recorded 인 정상 케이스."""
    item = make_item(warehouse_qty=D("4"))
    make_location(item.item_id, status=LocationStatusEnum.PRODUCTION, quantity=D("3"))
    # quantity 가 처음에 warehouse_qty 와 동기화돼 있음 — 위치 추가 후 동기 안 했으므로 미스매치
    # 일치시키려면 quantity = wh + loc_sum = 7 로 설정
    from app.models import Inventory
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("7")
    db_session.flush()

    mismatches = check_inventory_consistency(db_session)
    assert mismatches == []


def test_check_consistency_quantity_too_high(make_item, db_session):
    """recorded > computed → 미스매치 + delta > 0."""
    from app.models import Inventory
    item = make_item(warehouse_qty=D("5"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("8")  # warehouse 5, loc 0 → computed=5, recorded=8
    db_session.flush()

    mismatches = check_inventory_consistency(db_session)
    assert len(mismatches) == 1
    m = mismatches[0]
    assert m.recorded_total == D("8")
    assert m.computed_total == D("5")
    assert m.delta == D("3")


def test_check_consistency_quantity_too_low(make_item, db_session):
    """recorded < computed → delta < 0."""
```
