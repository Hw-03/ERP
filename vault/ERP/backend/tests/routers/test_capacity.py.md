---
type: file-explanation
source_path: "backend/tests/routers/test_capacity.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_capacity.py — test_capacity.py 설명

## 이 파일은 무엇을 책임지나

`test_capacity.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_dec`
- `test_capacity_pf_stock_only`
- `test_capacity_recursive_buildable_with_stage_filter`
- `test_capacity_cycle_protection`
- `test_capacity_limit_removed_16plus`
- `test_capacity_multi_path_bottleneck`

## 연결되는 파일

- [[ERP/backend/tests/routers/📁_routers]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""Tests for recursive buildable production capacity calculation (F1)."""

from __future__ import annotations

from decimal import Decimal

import pytest


def _dec(value) -> Decimal:
    return Decimal(str(value))


def test_capacity_pf_stock_only(client, db_session, make_item, make_bom):
    """① PF with simple part (no BOM child) → immediate = maximum = stock."""
    # PF ← simple_part (which has no further BOM)
    pf = make_item(name="완제품A", process_type_code="PF", warehouse_qty=Decimal("0"))
    simple_part = make_item(name="단순부품", process_type_code="AA", warehouse_qty=Decimal("10"))
    make_bom(pf.item_id, simple_part.item_id, Decimal("1"))
    db_session.commit()

    resp = client.get("/api/production/capacity")
    assert resp.status_code == 200
    data = resp.json()

    # PF stock=0, simple_part stock=10, BOM qty=1, so can make 10 PF
    assert data["immediate"] == 10
    assert data["maximum"] == 10
    assert data["status"] == "producible"
    assert len(data["top_items"]) == 1
    assert data["top_items"][0]["item_id"] == str(pf.item_id)
    assert data["top_items"][0]["immediate"] == 10
    assert data["top_items"][0]["maximum"] == 10


def test_capacity_recursive_buildable_with_stage_filter(
    client, db_session, make_item, make_bom
):
    """② PF→AA(65)→AR(45), AR=0 → immediate limited by stage<60, maximum uses all."""
    # PF (stage 80)
    pf = make_item(name="완제품B", process_type_code="PF", warehouse_qty=Decimal("0"))

    # AA (stage 65, 중간재, NF 이상, immediate_mode에서 전개 O)
    aa = make_item(name="중간재AA", process_type_code="AA", warehouse_qty=Decimal("5"))

    # AR (stage 45, 원자재, NF 미만, immediate_mode에서 전개 X)
    ar = make_item(name="원자재AR", process_type_code="AR", warehouse_qty=Decimal("0"))

    # BOM: PF ← 2×AA, AA ← 3×AR
    make_bom(pf.item_id, aa.item_id, Decimal("2"))
    make_bom(aa.item_id, ar.item_id, Decimal("3"))
    db_session.commit()

    resp = client.get("/api/production/capacity")
    assert resp.status_code == 200
```
