---
type: code-note
project: ERP
layer: backend
source_path: erp/backend/tests/services/test_bom.py
status: active
updated: 2026-04-27
source_sha: e516539f7f3c
tags:
  - erp
  - backend
  - test
  - py
---

# test_bom.py

> [!summary] 역할
> 현재 ERP 동작을 회귀 없이 유지하기 위한 자동 테스트 파일이다.

## 원본 위치

- Source: `backend/tests/services/test_bom.py`
- Layer: `backend`
- Kind: `test`
- Size: `5043` bytes

## 연결

- Parent hub: [[backend/tests/services/services|backend/tests/services]]
- Related: [[backend/backend]]

## 읽는 포인트

- 기능 변경 후 같은 영역 테스트를 먼저 확인한다.
- 테스트가 문서보다 최신 동작을 더 정확히 말해줄 때가 많다.

## 원본 발췌

````python
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
# ... (이하 115줄 생략. 원본 참조)

````
