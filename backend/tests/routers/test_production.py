from __future__ import annotations

from decimal import Decimal

from app.models import DepartmentEnum


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
