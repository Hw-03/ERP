"""Tests for BOM graph script data preparation."""

from __future__ import annotations

from decimal import Decimal

from app.models import LocationStatusEnum
from scripts.bom_graph_data import (
    build_graph_tree,
    build_limited_bom_cache,
    collect_item_ids,
    load_item_maps,
)


def test_limited_bom_cache_collects_only_reachable_items(
    db_session, make_item, make_bom
):
    root = make_item(name="root", process_type_code="PF")
    child = make_item(name="child", process_type_code="AF")
    leaf = make_item(name="leaf", process_type_code="AR")
    unrelated_parent = make_item(name="other-parent", process_type_code="PF")
    unrelated_child = make_item(name="other-child", process_type_code="AR")

    make_bom(root.item_id, child.item_id, Decimal("2"))
    make_bom(child.item_id, leaf.item_id, Decimal("3"))
    make_bom(unrelated_parent.item_id, unrelated_child.item_id, Decimal("9"))
    db_session.commit()

    cache = build_limited_bom_cache(db_session, [root.item_id])
    ids = collect_item_ids([root.item_id], cache)

    assert ids == {root.item_id, child.item_id, leaf.item_id}
    assert root.item_id in cache
    assert child.item_id in cache
    assert unrelated_parent.item_id not in cache


def test_graph_tree_carries_required_quantities_and_stock_flags(
    db_session, make_item, make_bom, make_location
):
    root = make_item(name="root", process_type_code="PF")
    child = make_item(
        name="child",
        process_type_code="AF",
        warehouse_qty=Decimal("2"),
        pending=Decimal("1"),
    )
    leaf = make_item(name="leaf", process_type_code="AR", warehouse_qty=Decimal("4"))
    leaf.min_stock = Decimal("10")

    make_location(child.item_id, status=LocationStatusEnum.PRODUCTION, quantity=Decimal("5"))
    make_bom(root.item_id, child.item_id, Decimal("2"))
    make_bom(child.item_id, leaf.item_id, Decimal("3"))
    db_session.commit()

    cache = build_limited_bom_cache(db_session, [root.item_id])
    maps = load_item_maps(db_session, collect_item_ids([root.item_id], cache))
    tree = build_graph_tree(root.item_id, cache, maps)

    child_node = tree["children"][0]
    leaf_node = child_node["children"][0]

    assert child_node["edge_quantity"] == 2
    assert child_node["required_quantity"] == 2
    assert child_node["available_quantity"] == 6  # warehouse 2 + production 5 - pending 1
    assert child_node["warehouse_available"] == 1  # warehouse 2 - pending 1
    assert child_node["shortage_to_required"] == 0
    assert child_node["warehouse_shortage_to_required"] == 1

    assert leaf_node["edge_quantity"] == 3
    assert leaf_node["required_quantity"] == 6
    assert leaf_node["available_quantity"] == 4
    assert leaf_node["shortage_to_required"] == 2
    assert leaf_node["below_min_stock"] is True
    assert leaf_node["stock_tone"] == "danger"
