from __future__ import annotations

from decimal import Decimal

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    IoBatch,
    IoLine,
    StockRequest,
    StockRequestLine,
)
from app.services.pin_auth import DEFAULT_PIN_HASH


def _make_employee(
    db_session,
    *,
    code: str = "IO01",
    name: str = "IO Tester",
    department: DepartmentEnum = DepartmentEnum.ASSEMBLY,
    warehouse_role: str = "none",
) -> Employee:
    employee = Employee(
        employee_code=code,
        name=name,
        role=f"{department.value}/staff",
        department=department,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role=warehouse_role,
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def test_io_preview_receive_does_not_expand_bom(client, db_session, make_item, make_bom):
    parent = make_item(name="Parent", warehouse_qty=Decimal("0"))
    child = make_item(name="Child", warehouse_qty=Decimal("0"))
    make_bom(parent.item_id, child.item_id, Decimal("2"))
    requester = _make_employee(db_session)
    db_session.commit()

    res = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "receive",
            "sub_type": "receive_supplier",
            "targets": [
                {
                    "source_kind": "direct_item",
                    "item_id": str(parent.item_id),
                    "quantity": "3",
                }
            ],
        },
    )

    assert res.status_code == 200, res.json()
    body = res.json()
    assert len(body["bundles"]) == 1
    assert len(body["bundles"][0]["lines"]) == 1
    assert body["bundles"][0]["lines"][0]["item_id"] == str(parent.item_id)
    assert body["bundles"][0]["lines"][0]["origin"] == "direct"


def test_io_preview_warehouse_to_dept_expands_one_bom_level(client, db_session, make_item, make_bom):
    parent = make_item(name="Parent", warehouse_qty=Decimal("0"))
    child = make_item(name="Child", warehouse_qty=Decimal("10"))
    make_bom(parent.item_id, child.item_id, Decimal("2"))
    requester = _make_employee(db_session)
    db_session.commit()

    res = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_io",
            "sub_type": "warehouse_to_dept",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "item_id": str(parent.item_id),
                    "quantity": "3",
                }
            ],
        },
    )

    assert res.status_code == 200, res.json()
    line = res.json()["bundles"][0]["lines"][0]
    assert line["item_id"] == str(child.item_id)
    assert Decimal(str(line["quantity"])) == Decimal("6")
    assert line["origin"] == "bom_auto"
    assert line["from_bucket"] == "warehouse"
    assert line["to_bucket"] == "production"


def test_io_submit_approval_uses_only_included_lines(client, db_session, make_item, make_bom):
    parent = make_item(name="Parent", warehouse_qty=Decimal("0"))
    child_a = make_item(name="Child A", warehouse_qty=Decimal("10"))
    child_b = make_item(name="Child B", warehouse_qty=Decimal("10"))
    make_bom(parent.item_id, child_a.item_id, Decimal("1"))
    make_bom(parent.item_id, child_b.item_id, Decimal("1"))
    requester = _make_employee(db_session)
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_io",
            "sub_type": "warehouse_to_dept",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "item_id": str(parent.item_id),
                    "quantity": "1",
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.json()
    bundles = preview.json()["bundles"]
    bundles[0]["lines"][1]["included"] = False
    bundles[0]["lines"][1]["exclusion_note"] = "이번 작업 제외"

    res = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_io",
            "sub_type": "warehouse_to_dept",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "bundles": bundles,
        },
    )

    assert res.status_code == 201, res.json()
    assert res.json()["status"] == "reserved"
    assert db_session.query(StockRequest).count() == 1
    assert db_session.query(StockRequestLine).count() == 1
    assert db_session.query(IoLine).count() == 2
    assert db_session.query(IoLine).filter(IoLine.included.is_(False)).count() == 1
    inv_a = db_session.query(Inventory).filter(Inventory.item_id == child_a.item_id).first()
    inv_b = db_session.query(Inventory).filter(Inventory.item_id == child_b.item_id).first()
    assert inv_a.pending_quantity == Decimal("1")
    assert inv_b.pending_quantity == Decimal("0")


def test_io_submit_receive_is_immediate(client, db_session, make_item):
    item = make_item(name="Raw", warehouse_qty=Decimal("0"))
    requester = _make_employee(db_session)
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "receive",
            "sub_type": "receive_supplier",
            "targets": [
                {
                    "source_kind": "direct_item",
                    "item_id": str(item.item_id),
                    "quantity": "5",
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.json()

    res = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "receive",
            "sub_type": "receive_supplier",
            "bundles": preview.json()["bundles"],
        },
    )

    assert res.status_code == 201, res.json()
    assert res.json()["status"] == "completed"
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.warehouse_qty == Decimal("5")
    assert db_session.query(IoBatch).count() == 1
