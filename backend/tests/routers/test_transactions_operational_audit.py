from __future__ import annotations

from decimal import Decimal

from app.models import DepartmentEnum, Employee, EmployeeLevelEnum
from app.services.pin_auth import DEFAULT_PIN_HASH


def _make_employee(
    db_session,
    *,
    code: str,
    name: str,
    department: DepartmentEnum = DepartmentEnum.ASSEMBLY,
    warehouse_role: str = "none",
    department_role: str = "none",
) -> Employee:
    emp = Employee(
        employee_code=code,
        name=name,
        role=f"{department.value}/staff",
        department=department,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role=warehouse_role,
        department_role=department_role,
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(emp)
    db_session.flush()
    return emp


def _effect_by_cell(row: dict) -> dict[tuple[str, str | None, str | None], int]:
    return {
        (cell["scope"], cell.get("department"), cell.get("status")): int(cell["delta"])
        for cell in row["inventory_effect"]
    }


def test_history_exposes_request_actor_and_inventory_effect_for_approved_transfer(
    client,
    db_session,
    make_item,
):
    item = make_item(name="Audit Item", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="REQ1", name="Requester")
    approver = _make_employee(
        db_session,
        code="WH01",
        name="Warehouse",
        warehouse_role="primary",
    )
    db_session.commit()

    create_res = client.post(
        "/api/stock-requests",
        json={
            "requester_employee_id": str(requester.employee_id),
            "request_type": "warehouse_to_dept",
            "lines": [
                {
                    "item_id": str(item.item_id),
                    "quantity": "3",
                    "from_bucket": "warehouse",
                    "to_bucket": "production",
                    "to_department": DepartmentEnum.ASSEMBLY.value,
                }
            ],
        },
    )
    assert create_res.status_code == 201, create_res.text
    request_body = create_res.json()

    approve_res = client.post(
        f"/api/stock-requests/{request_body['request_id']}/approve",
        json={"actor_employee_id": str(approver.employee_id), "pin": "0000"},
    )
    assert approve_res.status_code == 200, approve_res.text

    history_res = client.get(f"/api/inventory/transactions?item_id={item.item_id}&limit=10")
    assert history_res.status_code == 200, history_res.text
    rows = history_res.json()
    assert len(rows) == 1

    row = rows[0]
    assert row["transaction_type"] == "TRANSFER_TO_PROD"
    assert row["reference_no"] == request_body["request_code"]
    assert row["requester_name"] == "Requester"
    assert row["approver_name"] == "Warehouse"
    assert row["quantity_change"] == 0

    effects = _effect_by_cell(row)
    assert effects[("warehouse", None, None)] == -3
    assert effects[("location", DepartmentEnum.ASSEMBLY.value, "PRODUCTION")] == 3
