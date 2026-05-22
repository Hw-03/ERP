---
type: file-explanation
source_path: "backend/tests/services/test_bom.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_bom.py — test_bom.py 설명

## 이 파일은 무엇을 책임지나

`test_bom.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `test_build_bom_cache_empty`
- `test_build_bom_cache_groups_children`
- `test_explode_bom_single_level`
- `test_explode_bom_multi_level`
- `test_explode_bom_cycle_detection`
- `test_explode_bom_max_depth`
- `test_explode_bom_with_cache_no_extra_queries`
- `test_merge_requirements_aggregates`
- `test_merge_requirements_empty`
- `test_direct_children_first_level_only`
- 그 외 1개 항목

## 연결되는 파일

- [[ERP/backend/tests/services/📁_services]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""services/bom.py 단위 테스트."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.services.bom import (
    MAX_DEPTH,
    build_bom_cache,
    direct_children,
    explode_bom,
    merge_requirements,
)


D = Decimal


def test_build_bom_cache_empty(db_session):
    cache = build_bom_cache(db_session)
    assert cache == {}


def test_build_bom_cache_groups_children(make_item, make_bom, db_session):
    parent = make_item(name="Parent")
    child_a = make_item(name="ChildA")
    child_b = make_item(name="ChildB")
    make_bom(parent.item_id, child_a.item_id, D("2"))
    make_bom(parent.item_id, child_b.item_id, D("3"))

    cache = build_bom_cache(db_session)
    assert parent.item_id in cache
    pairs = sorted(cache[parent.item_id])
    assert len(pairs) == 2
    qtys = sorted(q for _, q in pairs)
    assert qtys == [D("2"), D("3")]


def test_explode_bom_single_level(make_item, make_bom, db_session):
    """A → B(2), C(3); produce 5 → [(B,10), (C,15)]"""
    a = make_item(name="A")
    b = make_item(name="B")
    c = make_item(name="C")
    make_bom(a.item_id, b.item_id, D("2"))
    make_bom(a.item_id, c.item_id, D("3"))

    pairs = explode_bom(db_session, a.item_id, D("5"))
    qtys = {iid: q for iid, q in pairs}
    assert qtys[b.item_id] == D("10")
    assert qtys[c.item_id] == D("15")


def test_explode_bom_multi_level(make_item, make_bom, db_session):
```
