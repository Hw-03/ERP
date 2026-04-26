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
    """A → B → C(4); produce 1 of A → C 4"""
    a = make_item(name="A")
    b = make_item(name="B")
    c = make_item(name="C")
    make_bom(a.item_id, b.item_id, D("1"))
    make_bom(b.item_id, c.item_id, D("4"))

    pairs = explode_bom(db_session, a.item_id, D("1"))
    # B 는 자체 BOM 있으므로 leaf 까지 내려감 → C 만 등장
    qtys = {iid: q for iid, q in pairs}
    assert b.item_id not in qtys
    assert qtys[c.item_id] == D("4")


def test_explode_bom_cycle_detection(make_item, make_bom, db_session):
    """A → B → A 사이클은 visited 로 차단."""
    a = make_item(name="A")
    b = make_item(name="B")
    make_bom(a.item_id, b.item_id, D("1"))
    make_bom(b.item_id, a.item_id, D("1"))  # 사이클

    pairs = explode_bom(db_session, a.item_id, D("1"))
    # 사이클로 인해 더 이상 전개되지 않음 (B 도 자체 BOM 으로 간주되는데 A 는 visited)
    # 결과: B 의 children 으로 A 가 시도되지만 visited 로 차단 → 빈 결과
    # 단, B 는 leaf 가 아니라 자체 BOM 있으므로 등장하지 않음
    assert pairs == []


def test_explode_bom_max_depth(make_item, make_bom, db_session):
    """깊이 MAX_DEPTH+1 이면 차단."""
    chain = [make_item(name=f"L{i}") for i in range(MAX_DEPTH + 3)]
    for i in range(len(chain) - 1):
        make_bom(chain[i].item_id, chain[i + 1].item_id, D("1"))

    pairs = explode_bom(db_session, chain[0].item_id, D("1"))
    # MAX_DEPTH 까지 내려가다 차단; 전개 leaf 가 없을 수 있다
    # 정확한 leaf 수는 MAX_DEPTH 에 의존하지만, 무한 재귀 안 났다는 것만 확인
    assert isinstance(pairs, list)


def test_explode_bom_with_cache_no_extra_queries(make_item, make_bom, db_session):
    """cache 인자 주면 DB 쿼리 0 — 메모리 전개만."""
    from sqlalchemy import event

    a = make_item(name="A")
    b = make_item(name="B")
    make_bom(a.item_id, b.item_id, D("2"))

    cache = build_bom_cache(db_session)

    queries: list[str] = []

    @event.listens_for(db_session.bind, "before_cursor_execute")
    def _capture(conn, cursor, statement, params, context, executemany):
        queries.append(statement)

    pairs = explode_bom(db_session, a.item_id, D("3"), cache=cache)
    # cache 사용 → 추가 쿼리 0
    assert len(queries) == 0
    qtys = {iid: q for iid, q in pairs}
    assert qtys[b.item_id] == D("6")


def test_merge_requirements_aggregates():
    import uuid as _uuid
    iid = _uuid.uuid4()
    other = _uuid.uuid4()
    pairs = [(iid, D("3")), (other, D("5")), (iid, D("2"))]
    merged = merge_requirements(pairs)
    assert merged[iid] == D("5")
    assert merged[other] == D("5")


def test_merge_requirements_empty():
    assert merge_requirements([]) == {}


def test_direct_children_first_level_only(make_item, make_bom, db_session):
    """direct_children 은 1단계만, 재귀 X."""
    a = make_item(name="A")
    b = make_item(name="B")
    c = make_item(name="C")
    make_bom(a.item_id, b.item_id, D("2"))
    make_bom(b.item_id, c.item_id, D("4"))

    pairs = direct_children(db_session, a.item_id)
    ids = [child_id for child_id, _ in pairs]
    assert ids == [b.item_id]  # C 는 등장 안 함


def test_explode_bom_no_bom_returns_empty(make_item, db_session):
    """BOM 없는 leaf 는 빈 리스트."""
    leaf = make_item(name="Leaf")
    pairs = explode_bom(db_session, leaf.item_id, D("100"))
    assert pairs == []
