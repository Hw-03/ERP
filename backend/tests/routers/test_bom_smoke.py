"""BOM API smoke tests for direct rows, tree, and where-used lookups."""

from __future__ import annotations

from decimal import Decimal


def test_bom_create_query_tree_and_where_used_smoke(client, make_item):
    parent = make_item(name="스모크 상위", process_type_code="AF")
    child = make_item(name="스모크 하위", process_type_code="TR")

    created = client.post(
        "/api/bom",
        json={
            "parent_item_id": str(parent.item_id),
            "child_item_id": str(child.item_id),
            "quantity": "2.5",
            "unit": "EA",
            "notes": "smoke",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["parent_item_id"] == str(parent.item_id)
    assert body["child_item_id"] == str(child.item_id)
    assert Decimal(str(body["quantity"])) == Decimal("2.5")

    flat = client.get(f"/api/bom/{parent.item_id}")
    assert flat.status_code == 200, flat.text
    assert len(flat.json()) == 1

    all_rows = client.get("/api/bom")
    assert all_rows.status_code == 200, all_rows.text
    assert any(row["child_item_id"] == str(child.item_id) for row in all_rows.json())

    tree = client.get(f"/api/bom/{parent.item_id}/tree")
    assert tree.status_code == 200, tree.text
    tree_body = tree.json()
    assert tree_body["item_id"] == str(parent.item_id)
    assert len(tree_body["children"]) == 1
    assert tree_body["children"][0]["item_id"] == str(child.item_id)

    where_used = client.get(f"/api/bom/where-used/{child.item_id}")
    assert where_used.status_code == 200, where_used.text
    assert len(where_used.json()) == 1
    assert where_used.json()[0]["parent_item_id"] == str(parent.item_id)


def test_bom_duplicate_and_circular_references_are_blocked(client, make_item):
    parent = make_item(name="스모크 부모", process_type_code="AF")
    child = make_item(name="스모크 자식", process_type_code="TR")

    payload = {
        "parent_item_id": str(parent.item_id),
        "child_item_id": str(child.item_id),
        "quantity": "1",
        "unit": "EA",
    }
    first = client.post("/api/bom", json=payload)
    assert first.status_code == 201, first.text

    duplicate = client.post("/api/bom", json=payload)
    assert duplicate.status_code == 409

    circular = client.post(
        "/api/bom",
        json={
            "parent_item_id": str(child.item_id),
            "child_item_id": str(parent.item_id),
            "quantity": "1",
            "unit": "EA",
        },
    )
    assert circular.status_code == 400
