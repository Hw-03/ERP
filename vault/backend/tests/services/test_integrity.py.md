---
type: code-note
project: ERP
layer: backend
source_path: erp/backend/tests/services/test_integrity.py
status: active
updated: 2026-04-27
source_sha: dbf270551a04
tags:
  - erp
  - backend
  - test
  - py
---

# test_integrity.py

> [!summary] 역할
> 현재 ERP 동작을 회귀 없이 유지하기 위한 자동 테스트 파일이다.

## 원본 위치

- Source: `backend/tests/services/test_integrity.py`
- Layer: `backend`
- Kind: `test`
- Size: `9219` bytes

## 연결

- Parent hub: [[backend/tests/services/services|backend/tests/services]]
- Related: [[backend/backend]]

## 읽는 포인트

- 기능 변경 후 같은 영역 테스트를 먼저 확인한다.
- 테스트가 문서보다 최신 동작을 더 정확히 말해줄 때가 많다.

## 원본 발췌

> 전체 240줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````python
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
# ... (이하 185줄 생략. 원본 참조)

````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
