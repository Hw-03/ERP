from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import DepartmentEnum, Employee
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
    item = make_item(name="Audit Item", process_type_code="AR", warehouse_qty=Decimal("10"))
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
    assert row["executor_name"] == "Warehouse"
    assert row["quantity_change"] == 0

    effects = _effect_by_cell(row)
    assert effects[("warehouse", None, None)] == -3
    assert effects[("location", DepartmentEnum.ASSEMBLY.value, "PRODUCTION")] == 3


def test_8_22_10_history_keeps_self_approval_and_executor_roles(
    client,
    db_session,
    make_item,
):
    """자가승인도 목록 중복 표시는 피하되 상세 감사 데이터에서는 역할을 보존한다."""
    item = make_item(name="Self Audit Item", process_type_code="AR", warehouse_qty=Decimal("5"))
    requester = _make_employee(
        db_session,
        code="SELF1",
        name="Self Approver",
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
                    "quantity": "1",
                    "from_bucket": "warehouse",
                    "to_bucket": "production",
                    "to_department": DepartmentEnum.ASSEMBLY.value,
                }
            ],
        },
    )
    assert create_res.status_code == 201, create_res.text
    assert create_res.json()["status"] == "completed"

    history_res = client.get(f"/api/inventory/transactions?item_id={item.item_id}&limit=10")
    assert history_res.status_code == 200, history_res.text
    row = history_res.json()[0]
    assert row["requester_name"] == "Self Approver"
    assert row["approver_name"] == "Self Approver"
    assert row["executor_name"] == "Self Approver"


@pytest.mark.parametrize("destination", ["AS", "연구"])
def test_as_research_history_preserves_actual_special_approver(
    client, db_session, make_item, make_location, destination,
):
    """실제 특별 승인 완료 후 사용출고 이력에 승인자와 승인 시각이 남는다."""
    item = make_item(name="Special audit", process_type_code="AR", warehouse_qty=Decimal("0"))
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("7"))
    requester = _make_employee(db_session, code="ASREQ", name="AS requester", department=DepartmentEnum.AS)
    approver = _make_employee(db_session, code="ASAPP", name="Special approver", department=DepartmentEnum.RESEARCH)
    approver.as_research_approver = True
    db_session.commit()
    payload = {"requester_employee_id": str(requester.employee_id), "work_type": "internal_use",
               "sub_type": "internal_use_out", "to_department": destination}
    preview = client.post("/api/io/preview", json={**payload, "targets": [{
        "source_kind": "manual", "source_location": "department", "item_id": str(item.item_id), "quantity": 1,
    }]})
    assert preview.status_code == 200, preview.text
    submitted = client.post("/api/io/submit", json={**payload, "bundles": preview.json()["bundles"]})
    assert submitted.status_code == 201, submitted.text
    request_id = submitted.json()["stock_requests"][0]["stock_request_id"]
    approved = client.post(f"/api/stock-requests/{request_id}/as-research-approve", json={
        "actor_employee_id": str(approver.employee_id), "pin": "0000",
    })
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "completed"
    history = client.get("/api/inventory/transactions", params={"item_id": str(item.item_id)})
    assert history.status_code == 200, history.text
    assert len(history.json()) == 1
    row = history.json()[0]
    assert row["requester_name"] == requester.name
    assert row["approver_name"] == approver.name
    assert row["approved_at"] == approved.json()["as_research_approved_at"]
    assert row["history_batch"]["to_department"] == destination
    assert _effect_by_cell(row) == {("location", "조립", "PRODUCTION"): -1}
