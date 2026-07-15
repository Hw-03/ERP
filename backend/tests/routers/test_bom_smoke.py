"""BOM API smoke tests for direct rows, tree, and where-used lookups."""

from __future__ import annotations

from decimal import Decimal

ADMIN_HEADERS = {"X-Admin-Pin": "0000"}


def test_bom_create_query_tree_and_where_used_smoke(client, make_item):
    parent = make_item(name="스모크 상위", process_type_code="AF")
    child = make_item(name="스모크 하위", process_type_code="TR")

    created = client.post(
        "/api/bom",
        headers=ADMIN_HEADERS,
        json={
            "parent_item_id": str(parent.item_id),
            "child_item_id": str(child.item_id),
            "quantity": "2",
            "unit": "EA",
            "notes": "smoke",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["parent_item_id"] == str(parent.item_id)
    assert body["child_item_id"] == str(child.item_id)
    assert body["quantity"] == 2

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


def test_bom_flat_orders_children_by_department_stage_and_serial(client, make_item, make_bom):
    parent = make_item(name="Sort parent", process_type_code="AF", model_symbol="9", serial_no=1)
    tf_first = make_item(name="TF first", process_type_code="TF", model_symbol="6", serial_no=1)
    tf_second = make_item(name="TF second", process_type_code="TF", model_symbol="3", serial_no=2)
    ta = make_item(name="TA", process_type_code="TA", model_symbol="3", serial_no=1)
    tr = make_item(name="TR", process_type_code="TR", model_symbol="3", serial_no=1)
    hf = make_item(name="HF", process_type_code="HF", model_symbol="3", serial_no=1)
    af = make_item(name="AF", process_type_code="AF", model_symbol="3", serial_no=1)
    aa = make_item(name="AA", process_type_code="AA", model_symbol="3", serial_no=1)
    ar = make_item(name="AR", process_type_code="AR", model_symbol="3", serial_no=1)
    pr = make_item(name="PR", process_type_code="PR", model_symbol="3", serial_no=1)

    for child in [pr, ar, aa, af, hf, tr, ta, tf_second, tf_first]:
        make_bom(parent.item_id, child.item_id, Decimal("1"))

    response = client.get(f"/api/bom/{parent.item_id}")

    assert response.status_code == 200, response.text
    assert [row["child_item_id"] for row in response.json()] == [
        str(tf_first.item_id),
        str(tf_second.item_id),
        str(ta.item_id),
        str(tr.item_id),
        str(hf.item_id),
        str(af.item_id),
        str(aa.item_id),
        str(ar.item_id),
        str(pr.item_id),
    ]


def test_bom_duplicate_and_circular_references_are_blocked(client, make_item):
    parent = make_item(name="스모크 부모", process_type_code="AF")
    child = make_item(name="스모크 자식", process_type_code="TR")

    payload = {
        "parent_item_id": str(parent.item_id),
        "child_item_id": str(child.item_id),
        "quantity": "1",
        "unit": "EA",
    }
    first = client.post("/api/bom", headers=ADMIN_HEADERS, json=payload)
    assert first.status_code == 201, first.text

    duplicate = client.post("/api/bom", headers=ADMIN_HEADERS, json=payload)
    assert duplicate.status_code == 409

    circular = client.post(
        "/api/bom",
        headers=ADMIN_HEADERS,
        json={
            "parent_item_id": str(child.item_id),
            "child_item_id": str(parent.item_id),
            "quantity": "1",
            "unit": "EA",
        },
    )
    assert circular.status_code == 400


def test_bom_rejects_fractional_quantity(client, make_item):
    """BOM 수량은 정수 전용 — 소수는 거부(422)."""
    parent = make_item(name="정수부모", process_type_code="AF")
    child = make_item(name="정수자식", process_type_code="TR")

    res = client.post(
        "/api/bom",
        headers=ADMIN_HEADERS,
        json={
            "parent_item_id": str(parent.item_id),
            "child_item_id": str(child.item_id),
            "quantity": "2.5",
            "unit": "EA",
        },
    )
    assert res.status_code == 422, res.text
