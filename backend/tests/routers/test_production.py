from __future__ import annotations

from decimal import Decimal

from app.models import DepartmentEnum, ShippingAllocation, ShippingRequest


def test_production_bom_check_uses_process_department_location(client, db_session, make_item, make_bom, make_location):
    component = make_item(
        name="Tube component",
        process_type_code="TR",
        warehouse_qty=Decimal("10"),
        model_symbol="3",
        serial_no=1,
    )
    produced = make_item(
        name="Final PF",
        process_type_code="PF",
        warehouse_qty=Decimal("0"),
        model_symbol="3",
        serial_no=2,
    )
    make_bom(produced.item_id, component.item_id, Decimal("1"))
    db_session.commit()

    shortage = client.get(f"/api/production/bom-check/{produced.item_id}?quantity=1")
    assert shortage.status_code == 200, shortage.text
    shortage_body = shortage.json()
    assert shortage_body["can_produce"] is False
    assert shortage_body["components"][0]["available"] == 0
    assert shortage_body["components"][0]["shortage"] == 1

    make_location(component.item_id, department=DepartmentEnum.TUBE, quantity=Decimal("2"))
    db_session.commit()

    ok = client.get(f"/api/production/bom-check/{produced.item_id}?quantity=1")
    assert ok.status_code == 200, ok.text
    ok_body = ok.json()
    assert ok_body["can_produce"] is True
    assert ok_body["components"][0]["available"] == 2
    assert ok_body["components"][0]["shortage"] == 0


def test_production_bom_check_subtracts_active_shipping_reservation(
    client,
    db_session,
    make_item,
    make_bom,
    make_location,
):
    component = make_item(name="Reserved tube", process_type_code="TR")
    produced = make_item(name="Reserved output", process_type_code="PF")
    make_bom(produced.item_id, component.item_id, Decimal("1"))
    make_location(
        component.item_id,
        department=DepartmentEnum.TUBE,
        quantity=Decimal("2"),
    )
    request = ShippingRequest(
        base_pf_item_id=component.item_id,
        request_quantity=1,
        requested_by_name="production-check",
    )
    db_session.add(request)
    db_session.flush()
    db_session.add(
        ShippingAllocation(
            request_id=request.request_id,
            item_id=component.item_id,
            quantity=1,
            department=DepartmentEnum.TUBE.value,
            status="RESERVED",
        )
    )
    db_session.commit()

    response = client.get(
        f"/api/production/bom-check/{produced.item_id}?quantity=2"
    )

    assert response.status_code == 200
    [row] = response.json()["components"]
    assert row["current_stock"] == 2
    assert row["available"] == 1
    assert row["shortage"] == 1
    assert response.json()["can_produce"] is False
