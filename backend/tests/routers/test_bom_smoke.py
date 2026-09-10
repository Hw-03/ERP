"""BOM API smoke tests for direct rows, tree, and where-used lookups."""

from __future__ import annotations

from datetime import UTC, datetime
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


def test_bom_tree_marks_production_capacity_ignored_components(client, make_item, make_bom):
    parent = make_item(name="생산가능 수량 상위", process_type_code="AF", model_symbol="4", serial_no=1)
    ignored = make_item(name="OS 라이센스 라벨", process_type_code="PR", model_symbol="4", serial_no=58)
    included = make_item(name="일반 구성품", process_type_code="PR", model_symbol="4", serial_no=59)
    make_bom(parent.item_id, ignored.item_id, Decimal("1"))
    make_bom(parent.item_id, included.item_id, Decimal("1"))

    response = client.get(f"/api/bom/{parent.item_id}/tree")

    assert response.status_code == 200, response.text
    children_by_id = {row["item_id"]: row for row in response.json()["children"]}
    assert children_by_id[str(ignored.item_id)]["production_capacity_ignored"] is True
    assert children_by_id[str(included.item_id)]["production_capacity_ignored"] is False


def test_bom_tree_current_stock_excludes_defective_locations(
    client,
    db_session,
    make_item,
    make_location,
    make_bom,
):
    from app.models import Inventory, LocationStatusEnum

    parent = make_item(name="정상 재고 상위", process_type_code="AF")
    component = make_item(name="불량 포함 구성품", process_type_code="AR", warehouse_qty=Decimal("4"))
    make_bom(parent.item_id, component.item_id, Decimal("1"))
    make_location(component.item_id, status=LocationStatusEnum.PRODUCTION, quantity=Decimal("2"))
    make_location(component.item_id, status=LocationStatusEnum.DEFECTIVE, quantity=Decimal("7"))

    inventory = db_session.query(Inventory).filter_by(item_id=component.item_id).one()
    inventory.quantity = Decimal("13")
    db_session.flush()

    response = client.get(f"/api/bom/{parent.item_id}/tree")

    assert response.status_code == 200, response.text
    assert response.json()["children"][0]["current_stock"] == 6


def test_bom_tree_exposes_additional_producible_quantity_from_available_stock(
    client, make_item, make_bom, monkeypatch
):
    """새 필드만 생략하고, 기존 nullable 키는 null로 유지한다."""
    parent = make_item(name="추가 생산 상위", process_type_code="AF", warehouse_qty=Decimal("5"))
    component = make_item(
        name="예약 자재", process_type_code="AR", warehouse_qty=Decimal("10"), pending=Decimal("4")
    )
    make_bom(parent.item_id, component.item_id, Decimal("2"))

    from app.routers import bom as bom_router
    from app.schemas.item import BOMTreeNode

    def nullable_tree(*_args, **_kwargs):
        return BOMTreeNode(
            item_id=parent.item_id,
            mes_code=None,
            item_name=parent.item_name,
            process_type_code=None,
            unit="EA",
            required_quantity=1,
            current_stock=5,
            children=[
                BOMTreeNode(
                    item_id=component.item_id,
                    mes_code=None,
                    item_name=component.item_name,
                    process_type_code=None,
                    unit="EA",
                    required_quantity=2,
                    current_stock=6,
                    children=[],
                )
            ],
        )

    monkeypatch.setattr(bom_router, "_build_tree_cached", nullable_tree)

    response = client.get(f"/api/bom/{parent.item_id}/tree")

    assert response.status_code == 200, response.text
    tree = response.json()
    assert tree["current_stock"] == 5
    assert tree["mes_code"] is None
    assert tree["process_type_code"] is None
    assert tree["additional_producible_quantity"] == 3
    child = tree["children"][0]
    assert child["mes_code"] is None
    assert child["process_type_code"] is None
    assert "additional_producible_quantity" not in child


def test_bom_tree_additional_quantity_tracks_active_shipping_reservations(
    client,
    db_session,
    make_item,
    make_bom,
):
    from app.models import (
        ShippingAllocation,
        ShippingRequest,
        ShippingRequestStatusEnum,
    )

    parent = make_item(name="출하 예약 생산 상위", process_type_code="AF")
    component = make_item(
        name="출하 예약 구성품",
        process_type_code="AR",
        warehouse_qty=Decimal("10"),
        pending=Decimal("2"),
    )
    make_bom(parent.item_id, component.item_id, Decimal("2"))
    request = ShippingRequest(
        status=ShippingRequestStatusEnum.PREPARED,
        base_pf_item_id=parent.item_id,
        request_quantity=1,
        requested_by_name="BOM capacity test",
    )
    db_session.add(request)
    db_session.flush()
    allocation = ShippingAllocation(
        request_id=request.request_id,
        item_id=component.item_id,
        quantity=Decimal("3"),
        department=None,
        status="RESERVED",
    )
    db_session.add(allocation)
    db_session.commit()

    reserved = client.get(f"/api/bom/{parent.item_id}/tree")

    assert reserved.status_code == 200, reserved.text
    assert reserved.json()["additional_producible_quantity"] == 2

    allocation.status = "RELEASED"
    db_session.commit()
    released = client.get(f"/api/bom/{parent.item_id}/tree")

    assert released.status_code == 200, released.text
    assert released.json()["additional_producible_quantity"] == 4


def test_bom_tree_omits_additional_quantity_without_calculable_bom_and_ignores_excluded_component(
    client, make_item, make_bom
):
    """BOM이 없으면 필드를 생략하고, 제외 품목은 계산 병목이 아니다."""
    no_bom = make_item(name="계산 제약 없음", process_type_code="AF")
    assert "additional_producible_quantity" not in client.get(f"/api/bom/{no_bom.item_id}/tree").json()

    parent = make_item(name="제외 정책 상위", process_type_code="AF", model_symbol="4", serial_no=1)
    ignored = make_item(name="제외 라벨", process_type_code="PR", model_symbol="4", serial_no=58)
    required = make_item(name="필수 자재", process_type_code="AR", warehouse_qty=Decimal("3"), model_symbol="4", serial_no=59)
    make_bom(parent.item_id, ignored.item_id, Decimal("1"))
    make_bom(parent.item_id, required.item_id, Decimal("1"))

    tree = client.get(f"/api/bom/{parent.item_id}/tree").json()
    assert tree["additional_producible_quantity"] == 3


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


def test_bom_tree_modal_order_reverses_only_department_priority(client, make_item, make_bom):
    parent = make_item(name="Tree sort parent", process_type_code="AF", model_symbol="9", serial_no=1)
    tf = make_item(name="TF", process_type_code="TF", model_symbol="3", serial_no=1)
    hf = make_item(name="HF", process_type_code="HF", model_symbol="3", serial_no=1)
    aa = make_item(name="AA", process_type_code="AA", model_symbol="3", serial_no=1)
    pr = make_item(name="PR", process_type_code="PR", model_symbol="3", serial_no=1)

    for child in [tf, hf, aa, pr]:
        make_bom(parent.item_id, child.item_id, Decimal("1"))

    response = client.get(f"/api/bom/{parent.item_id}/tree?department_order=desc")

    assert response.status_code == 200, response.text
    assert [row["item_id"] for row in response.json()["children"]] == [
        str(pr.item_id),
        str(aa.item_id),
        str(hf.item_id),
        str(tf.item_id),
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


def test_bom_mutations_require_completion_to_be_cleared(client, db_session, make_item, make_bom):
    parent = make_item(name="완료 잠금 부모", process_type_code="AF")
    child = make_item(name="기존 자식", process_type_code="TR")
    added_child = make_item(name="추가 자식", process_type_code="HR")
    row = make_bom(parent.item_id, child.item_id, Decimal("1"))
    parent.bom_completed_at = datetime.now(UTC).replace(tzinfo=None)
    db_session.commit()

    create = client.post(
        "/api/bom",
        headers=ADMIN_HEADERS,
        json={
            "parent_item_id": str(parent.item_id),
            "child_item_id": str(added_child.item_id),
            "quantity": "1",
            "unit": "EA",
        },
    )
    assert create.status_code == 409, create.text

    update = client.patch(
        f"/api/bom/{row.bom_id}",
        headers=ADMIN_HEADERS,
        json={"quantity": "2"},
    )
    assert update.status_code == 409, update.text

    delete = client.delete(f"/api/bom/{row.bom_id}", headers=ADMIN_HEADERS)
    assert delete.status_code == 409, delete.text

    db_session.refresh(row)
    assert row.quantity == Decimal("1")

    unlocked = client.patch(
        f"/api/items/{parent.item_id}/bom-completion",
        headers=ADMIN_HEADERS,
        json={"completed": False},
    )
    assert unlocked.status_code == 200, unlocked.text

    assert client.patch(
        f"/api/bom/{row.bom_id}",
        headers=ADMIN_HEADERS,
        json={"quantity": "2"},
    ).status_code == 200
    assert client.delete(f"/api/bom/{row.bom_id}", headers=ADMIN_HEADERS).status_code == 204
    assert client.post(
        "/api/bom",
        headers=ADMIN_HEADERS,
        json={
            "parent_item_id": str(parent.item_id),
            "child_item_id": str(added_child.item_id),
            "quantity": "1",
            "unit": "EA",
        },
    ).status_code == 201
