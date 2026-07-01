from __future__ import annotations

from decimal import Decimal

from app.models import DepartmentEnum, ShippingRequestStatusEnum


def _line(item, qty=1, stage="PA", *, included=True, origin="CUSTOM"):
    return {
        "parent_stage": stage,
        "child_item_id": str(item.item_id),
        "quantity": qty,
        "unit": "EA",
        "included": included,
        "origin": origin,
    }


def test_shipping_request_api_full_pc_workflow(client, db_session, make_item, make_bom, make_location):
    af = make_item(name="AF Main", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    pouch = make_item(name="Pouch", process_type_code="PR", warehouse_qty=Decimal("2"), model_symbol="4", serial_no=2)
    carton = make_item(name="Carton", process_type_code="PR", warehouse_qty=Decimal("3"), model_symbol="4", serial_no=3)
    base_pa = make_item(name="Base PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    base_pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=5)
    make_bom(base_pa.item_id, af.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    make_location(af.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("2"))
    make_location(pouch.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("2"))
    make_location(carton.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("2"))
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
        json={
            "base_pf_item_id": str(base_pf.item_id),
            "requested_by_name": "shipping-user",
            "custom_pa_name": "Base PF with Pouch PA",
            "custom_pf_name": "Base PF with Pouch",
            "request_quantity": 2,
            "companion_lines": [{"item_id": str(carton.item_id), "quantity": 2, "unit": "EA"}],
            "bom_lines": [_line(af), _line(pouch)],
        },
    )
    assert create.status_code == 201, create.text
    request_id = create.json()["request_id"]
    assert create.json()["status"] == ShippingRequestStatusEnum.REQUESTED.value
    assert create.json()["request_quantity"] == 2
    assert create.json()["companion_lines"][0]["item_name"] == "Carton"
    assert create.json()["companion_lines"][0]["quantity"] == 2
    assert len(create.json()["bom_lines"]) == 3

    prep = client.post(f"/api/shipping/requests/{request_id}/send-to-prep")
    assert prep.status_code == 200, prep.text
    assert prep.json()["status"] == ShippingRequestStatusEnum.PREPARING.value
    assert any(line["item_name"] == "Pouch" for line in prep.json()["checklist_lines"])

    checklist_id = [line for line in prep.json()["checklist_lines"] if line["item_name"] == "Pouch"][0]["item_id"]
    checked = client.patch(
        f"/api/shipping/requests/{request_id}/checklist",
        json={"checks": [{"item_id": checklist_id, "checked": True}]},
    )
    assert checked.status_code == 200, checked.text
    checked_line = [line for line in checked.json()["checklist_lines"] if line["item_id"] == checklist_id][0]
    assert checked_line["checked"] is True

    prepared = client.post(
        f"/api/shipping/requests/{request_id}/prepare-complete",
        json={},
    )
    assert prepared.status_code == 200, prepared.text
    assert prepared.json()["status"] == ShippingRequestStatusEnum.PREPARED.value
    assert prepared.json()["final_pf_item_name"] == "Base PF with Pouch"
    assert prepared.json()["companion_lines"][0]["item_name"] == "Carton"

    cancel = client.post(
        f"/api/shipping/requests/{request_id}/prepare-cancel",
        json={"reason": "change components"},
    )
    assert cancel.status_code == 200, cancel.text
    assert cancel.json()["status"] == ShippingRequestStatusEnum.PREPARING.value

    prepared_again = client.post(
        f"/api/shipping/requests/{request_id}/prepare-complete",
        json={},
    )
    assert prepared_again.status_code == 200, prepared_again.text

    pickup = client.post(f"/api/shipping/requests/{request_id}/pickup-complete")
    assert pickup.status_code == 200, pickup.text
    assert pickup.json()["status"] == ShippingRequestStatusEnum.PICKED_UP.value

    history = client.get("/api/shipping/history")
    assert history.status_code == 200, history.text
    assert history.json()[0]["request_id"] == request_id
    assert history.json()[0]["transaction_count"] >= 2
    assert history.json()[0]["transaction_count"] == len(history.json()[0]["transactions"])
    assert any(
        log["shipping_phase"] == "PREPARE" and log["cancelled"]
        for log in history.json()[0]["transactions"]
    )
    assert any(
        log["shipping_phase"] == "PICKUP" and log["transaction_type"] == "SHIP"
        for log in history.json()[0]["transactions"]
    )

    clear_after_pickup = client.post(f"/api/shipping/requests/{request_id}/checklist/clear")
    assert clear_after_pickup.status_code == 422, clear_after_pickup.text


def test_shipping_mobile_list_is_read_only_shape(client, db_session, make_item, make_bom):
    af = make_item(name="AF Main", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    pouch = make_item(name="Pouch", process_type_code="PR", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=2)
    pa = make_item(name="Base PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pa.item_id, pouch.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
        json={"base_pf_item_id": str(pf.item_id), "requested_by_name": "shipping-user"},
    )
    assert create.status_code == 201, create.text
    request_id = create.json()["request_id"]
    client.post(f"/api/shipping/requests/{request_id}/send-to-prep")

    rows = client.get("/api/shipping/requests?status=PREPARING")
    assert rows.status_code == 200, rows.text
    assert rows.json()[0]["request_id"] == request_id
    assert any(line["item_name"] == "Pouch" for line in rows.json()[0]["checklist_lines"])


def test_shipping_bom_included_origin_and_match_flags(client, db_session, make_item, make_bom):
    af = make_item(name="AF Main", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    cable = make_item(name="Base Cable", process_type_code="PR", warehouse_qty=Decimal("2"), model_symbol="4", serial_no=2)
    bracket = make_item(name="Bracket", process_type_code="PR", warehouse_qty=Decimal("2"), model_symbol="4", serial_no=3)
    pa = make_item(name="Shared PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=5)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
        json={
            "base_pf_item_id": str(pf.item_id),
            "requested_by_name": "shipping-user",
            "bom_lines": [
                _line(pa, stage="PF", origin="DEFAULT"),
                _line(af, stage="PA", origin="DEFAULT"),
                _line(cable, stage="PA", included=False, origin="DEFAULT"),
            ],
        },
    )
    assert create.status_code == 201, create.text
    body = create.json()
    excluded = [line for line in body["bom_lines"] if line["child_item_id"] == str(cable.item_id)][0]
    assert excluded["included"] is False
    assert excluded["origin"] == "DEFAULT"
    assert all(line["item_id"] != str(cable.item_id) for line in body["checklist_lines"])

    request_id = body["request_id"]
    prep = client.post(f"/api/shipping/requests/{request_id}/send-to-prep")
    assert prep.status_code == 200, prep.text

    update = client.patch(
        f"/api/shipping/requests/{request_id}",
        json={
            "custom_pf_name": "Bracket PF",
            "bom_lines": [
                _line(pa, stage="PF", origin="DEFAULT"),
                _line(bracket, stage="PF"),
                _line(af, stage="PA", origin="DEFAULT"),
                _line(cable, stage="PA", included=False, origin="DEFAULT"),
            ],
        },
    )
    assert update.status_code == 200, update.text
    checklist_names = {line["item_name"] for line in update.json()["checklist_lines"]}
    assert "Bracket" in checklist_names
    assert "Base Cable" not in checklist_names

    match = client.post(
        "/api/shipping/bom-match",
        json={
            "base_pf_item_id": str(pf.item_id),
            "bom_lines": [
                _line(pa, stage="PF", origin="DEFAULT"),
                _line(bracket, stage="PF"),
                _line(af, stage="PA", origin="DEFAULT"),
            ],
        },
    )
    assert match.status_code == 200, match.text
    assert match.json()["matched_pa_item_name"] == "Shared PA"
    assert match.json()["matched_pf_item_id"] is None
    assert match.json()["requires_pa_name"] is False
    assert match.json()["requires_pf_name"] is True


def test_requested_and_preparing_shipping_requests_can_be_deleted(client, db_session, make_item, make_bom):
    af = make_item(name="AF Main", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    pa = make_item(name="Base PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
        json={"base_pf_item_id": str(pf.item_id), "requested_by_name": "shipping-user"},
    )
    assert create.status_code == 201, create.text
    request_id = create.json()["request_id"]

    delete_requested = client.delete(f"/api/shipping/requests/{request_id}")
    assert delete_requested.status_code == 204, delete_requested.text

    rows = client.get("/api/shipping/requests")
    assert rows.status_code == 200, rows.text
    assert all(row["request_id"] != request_id for row in rows.json())

    create_again = client.post(
        "/api/shipping/requests",
        json={"base_pf_item_id": str(pf.item_id), "requested_by_name": "shipping-user"},
    )
    assert create_again.status_code == 201, create_again.text
    preparing_id = create_again.json()["request_id"]
    prep = client.post(f"/api/shipping/requests/{preparing_id}/send-to-prep")
    assert prep.status_code == 200, prep.text

    delete_preparing = client.delete(f"/api/shipping/requests/{preparing_id}")
    assert delete_preparing.status_code == 204, delete_preparing.text

    rows_after_preparing_delete = client.get("/api/shipping/requests")
    assert rows_after_preparing_delete.status_code == 200, rows_after_preparing_delete.text
    assert all(row["request_id"] != preparing_id for row in rows_after_preparing_delete.json())


def test_prepared_and_picked_up_shipping_requests_cannot_be_deleted(client, db_session, make_item, make_bom, make_location):
    af = make_item(name="AF Main", process_type_code="AF", warehouse_qty=Decimal("2"), model_symbol="4", serial_no=1)
    pa = make_item(name="Base PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    make_location(af.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("2"))
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
        json={"base_pf_item_id": str(pf.item_id), "requested_by_name": "shipping-user"},
    )
    assert create.status_code == 201, create.text
    request_id = create.json()["request_id"]
    assert client.post(f"/api/shipping/requests/{request_id}/send-to-prep").status_code == 200
    prepared = client.post(f"/api/shipping/requests/{request_id}/prepare-complete", json={"companion_lines": []})
    assert prepared.status_code == 200, prepared.text

    delete_prepared = client.delete(f"/api/shipping/requests/{request_id}")
    assert delete_prepared.status_code == 422, delete_prepared.text

    picked_up = client.post(f"/api/shipping/requests/{request_id}/pickup-complete")
    assert picked_up.status_code == 200, picked_up.text

    delete_picked_up = client.delete(f"/api/shipping/requests/{request_id}")
    assert delete_picked_up.status_code == 422, delete_picked_up.text


def test_shipping_prepare_complete_requires_process_department_stock(client, db_session, make_item, make_bom):
    af = make_item(name="AF Main", process_type_code="AF", warehouse_qty=Decimal("5"), model_symbol="4", serial_no=1)
    pa = make_item(name="Base PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
        json={"base_pf_item_id": str(pf.item_id), "requested_by_name": "shipping-user"},
    )
    assert create.status_code == 201, create.text
    request_id = create.json()["request_id"]
    assert client.post(f"/api/shipping/requests/{request_id}/send-to-prep").status_code == 200

    prepared = client.post(f"/api/shipping/requests/{request_id}/prepare-complete", json={"companion_lines": []})

    assert prepared.status_code == 422, prepared.text
    body = prepared.text
    assert af.mes_code in body
    assert "AF Main" in body
    assert DepartmentEnum.ASSEMBLY.value in body
    assert "0" in body
    assert "1" in body
