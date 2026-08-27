from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Callable

import pytest
from sqlalchemy.orm import Session

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    ShippingRequest,
    ShippingRequestStatusEnum,
    TransactionLog,
)
from app.services.pin_auth import hash_pin


def _line(item, qty=1, stage="PA", *, included=True, origin="CUSTOM"):
    return {
        "parent_stage": stage,
        "child_item_id": str(item.item_id),
        "quantity": qty,
        "unit": "EA",
        "included": included,
        "origin": origin,
    }


def _employee(
    db_session,
    *,
    code: str,
    name: str,
    is_active: bool = True,
    department: DepartmentEnum = DepartmentEnum.ASSEMBLY,
) -> Employee:
    employee = Employee(
        employee_code=code,
        name=name,
        role="worker",
        department=department.value,
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active=is_active,
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def _submit_final_pf_production(
    client,
    *,
    requester_employee_id: str,
    final_pf_item_id: str,
    quantity: int,
) -> dict:
    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": requester_employee_id,
            "work_type": "process",
            "sub_type": "produce",
            "to_department": DepartmentEnum.SHIPPING.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "item_id": final_pf_item_id,
                    "quantity": quantity,
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.text
    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": requester_employee_id,
            "work_type": "process",
            "sub_type": "produce",
            "to_department": DepartmentEnum.SHIPPING.value,
            "bundles": preview.json()["bundles"],
        },
    )
    assert submitted.status_code == 201, submitted.text
    return submitted.json()


@pytest.fixture(autouse=True)
def _shipping_actor_header(client, db_session):
    actor = _employee(
        db_session,
        code="shipping-test-actor",
        name="출하 테스트 작업자",
        department=DepartmentEnum.ASSEMBLY,
    )
    db_session.commit()
    login = client.post(
        "/api/operator-session",
        json={"employee_id": str(actor.employee_id), "pin": "2468"},
    )
    assert login.status_code == 200, login.text
    yield actor


def _component_change_payload(
    db_session: Session,
    make_item: Callable[..., Any],
    make_bom: Callable[..., Any],
    make_location: Callable[..., Any],
) -> dict[str, object]:
    af = make_item(
        name="AF Main",
        process_type_code="AF",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=1,
    )
    cable = make_item(
        name="Cable",
        process_type_code="PR",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=2,
    )
    source_pa = make_item(
        name="Source PA",
        process_type_code="PA",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=3,
    )
    target_pa = make_item(
        name="Target PA",
        process_type_code="PA",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=4,
    )
    make_bom(source_pa.item_id, af.item_id, Decimal("1"))
    make_bom(target_pa.item_id, af.item_id, Decimal("1"))
    make_bom(target_pa.item_id, cable.item_id, Decimal("1"))
    make_location(source_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    make_location(cable.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    db_session.commit()
    return {
        "source_pa_item_id": str(source_pa.item_id),
        "target_pa_item_id": str(target_pa.item_id),
        "quantity": 1,
        "memo": "actor guard",
    }


def _prepared_shipping_component_change(
    client: Any,
    db_session: Session,
    make_item: Callable[..., Any],
    make_bom: Callable[..., Any],
    make_location: Callable[..., Any],
) -> tuple[str, dict[str, object]]:
    af = make_item(
        name="Request AF",
        process_type_code="AF",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=1,
    )
    pouch = make_item(
        name="Request Pouch",
        process_type_code="PR",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=2,
    )
    base_pa = make_item(
        name="Request Base PA",
        process_type_code="PA",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=3,
    )
    base_pf = make_item(
        name="Request Base PF",
        process_type_code="PF",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=4,
    )
    make_bom(base_pa.item_id, af.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    make_location(base_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    make_location(pouch.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    db_session.commit()

    created = client.post(
        "/api/shipping/requests",
        json={
            "base_pf_item_id": str(base_pf.item_id),
            "requested_by_name": "출하 테스트 작업자",
            "custom_pa_name": "Request Changed PA",
            "custom_pf_name": "Request Changed PF",
            "request_quantity": 1,
            "bom_lines": [_line(af), _line(pouch)],
        },
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["request_id"]
    return request_id, {
        "source_pa_item_id": str(base_pa.item_id),
        "quantity": 1,
        "memo": "request actor guard",
    }



def test_shipping_request_api_full_pc_workflow(client, db_session, make_item, make_bom, make_location, _shipping_actor_header):
    component_change_actor = _shipping_actor_header
    af = make_item(name="AF Main", process_type_code="AF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=1)
    pouch = make_item(name="Pouch", process_type_code="PR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    carton = make_item(name="Carton", process_type_code="PR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    base_pa = make_item(name="Base PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    base_pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=5)
    make_bom(base_pa.item_id, af.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    make_location(base_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("2"))
    make_location(pouch.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("2"))
    make_location(carton.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("2"))
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
        json={
                "base_pf_item_id": str(base_pf.item_id),
                "requested_by_name": component_change_actor.name,
                "invoice_number": "workflow-001",
                "custom_pa_name": "Base PF with Pouch PA",
            "custom_pf_name": "Base PF with Pouch",
            "request_quantity": 2,
            "companion_lines": [{"item_id": str(carton.item_id), "quantity": 2, "unit": "EA"}],
            "bom_lines": [_line(af), _line(pouch)],
        },
    )
    assert create.status_code == 201, create.text
    request_id = create.json()["request_id"]
    assert create.json()["status"] == ShippingRequestStatusEnum.PREPARING.value
    assert create.json()["request_quantity"] == 2
    assert create.json()["final_pa_item_name"] == "Base PF with Pouch PA"
    assert create.json()["final_pf_item_name"] == "Base PF with Pouch"
    assert create.json()["companion_lines"][0]["item_name"] == "Carton"
    assert create.json()["companion_lines"][0]["quantity"] == 2
    assert len(create.json()["bom_lines"]) == 3
    assert create.json()["transaction_count"] == 0
    created_event = next(
        event
        for event in create.json()["events"]
        if event["event_type"] == "REQUEST_CREATED"
    )
    assert created_event["actor_employee_id"] == str(
        component_change_actor.employee_id
    )
    assert created_event["actor_employee_code"] == component_change_actor.employee_code
    assert created_event["actor_name"] == component_change_actor.name
    assert any(line["item_name"] == "Pouch" for line in create.json()["checklist_lines"])

    requested_filter = client.get(
        "/api/shipping/requests",
        params={"status": "REQUESTED"},
    )
    assert requested_filter.status_code == 422, requested_filter.text

    removed_transition = client.post(
        f"/api/shipping/requests/{request_id}/send-to-prep"
    )
    assert removed_transition.status_code in {404, 405}, removed_transition.text

    preview = client.get(
        f"/api/shipping/requests/{request_id}/component-change-preview",
        params={
            "source_pa_item_id": str(base_pa.item_id),
            "quantity": 2,
        },
    )
    assert preview.status_code == 200, preview.text
    pouch_line = [line for line in preview.json()["lines"] if line["item_name"] == "Pouch"][0]
    assert pouch_line["total_delta"] == 2
    assert pouch_line["shortage_quantity"] == 0

    component_change = client.post(
        f"/api/shipping/requests/{request_id}/component-change",
        json={"source_pa_item_id": str(base_pa.item_id), "quantity": 2, "memo": "출하 구성 전환"},
    )
    assert component_change.status_code == 200, component_change.text
    assert any(log["shipping_phase"] == "COMPONENT_CHANGE" for log in component_change.json()["transactions"])

    checklist_id = [line for line in create.json()["checklist_lines"] if line["item_name"] == "Pouch"][0]["item_id"]
    checked = client.patch(
        f"/api/shipping/requests/{request_id}/checklist",
        json={"checks": [{"item_id": checklist_id, "checked": True}]},
    )
    assert checked.status_code == 200, checked.text
    checked_line = [line for line in checked.json()["checklist_lines"] if line["item_id"] == checklist_id][0]
    assert checked_line["checked"] is True

    _submit_final_pf_production(
        client,
        requester_employee_id=str(component_change_actor.employee_id),
        final_pf_item_id=create.json()["final_pf_item_id"],
        quantity=2,
    )

    prepared = client.post(
        f"/api/shipping/requests/{request_id}/prepare-complete",
        json={"serial_numbers": "  SN-001\nSN-002  "},
    )
    assert prepared.status_code == 200, prepared.text
    assert prepared.json()["status"] == ShippingRequestStatusEnum.PREPARED.value
    assert prepared.json()["serial_numbers"] == "SN-001\nSN-002"
    assert prepared.json()["final_pf_item_name"] == "Base PF with Pouch"
    assert prepared.json()["companion_lines"][0]["item_name"] == "Carton"

    cancel = client.post(
        f"/api/shipping/requests/{request_id}/prepare-cancel",
        json={"reason": "change components"},
    )
    assert cancel.status_code == 200, cancel.text
    assert cancel.json()["status"] == ShippingRequestStatusEnum.PREPARING.value
    assert cancel.json()["serial_numbers"] == "SN-001\nSN-002"
    assert cancel.json()["final_pa_item_name"] == "Base PF with Pouch PA"

    prepared_again = client.post(
        f"/api/shipping/requests/{request_id}/prepare-complete",
        json={"serial_numbers": "SN-003"},
    )
    assert prepared_again.status_code == 200, prepared_again.text
    assert prepared_again.json()["serial_numbers"] == "SN-003"

    pickup = client.post(f"/api/shipping/requests/{request_id}/pickup-complete")
    assert pickup.status_code == 200, pickup.text
    assert pickup.json()["status"] == ShippingRequestStatusEnum.PICKED_UP.value

    history = client.get("/api/shipping/history")
    assert history.status_code == 200, history.text
    history_row = history.json()["requests"][0]
    assert history_row["request_id"] == request_id
    assert history_row["transaction_count"] >= 2
    assert history_row["transaction_count"] == len(history_row["transactions"])
    assert any(
        log["shipping_phase"] == "COMPONENT_CHANGE"
        for log in history_row["transactions"]
    )
    assert not any(log["shipping_phase"] == "PREPARE" for log in history_row["transactions"])
    assert any(log["shipping_phase"] == "PICKUP" for log in history_row["transactions"])
    assert any(
        log["shipping_phase"] == "PICKUP" and log["transaction_type"] == "SHIP"
        for log in history_row["transactions"]
    )

    clear_after_pickup = client.post(f"/api/shipping/requests/{request_id}/checklist/clear")
    assert clear_after_pickup.status_code == 422, clear_after_pickup.text

    pickup_cancel = client.post(f"/api/shipping/requests/{request_id}/pickup-cancel")
    assert pickup_cancel.status_code == 200, pickup_cancel.text
    assert pickup_cancel.json()["status"] == ShippingRequestStatusEnum.PREPARED.value
    assert pickup_cancel.json()["picked_up_at"] is None
    assert pickup_cancel.json()["serial_numbers"] == "SN-003"
    assert any(event["event_type"] == "PICKUP_CANCELLED" for event in pickup_cancel.json()["events"])

    repeated_cancel = client.post(f"/api/shipping/requests/{request_id}/pickup-cancel")
    assert repeated_cancel.status_code == 422, repeated_cancel.text


def test_shipping_request_component_change_attributes_all_logs_to_executor(
    client, db_session, make_item, make_bom, make_location
):
    executor = _employee(
        db_session,
        code="shipping-request-component-executor",
        name="실제 전환 실행자",
    )
    request_id, payload = _prepared_shipping_component_change(
        client,
        db_session,
        make_item,
        make_bom,
        make_location,
    )

    response = client.post(
        f"/api/shipping/requests/{request_id}/component-change",
        headers={"X-MES-Employee-Code": executor.employee_code},
        json=payload,
    )

    assert response.status_code == 200, response.text
    logs = (
        db_session.query(TransactionLog)
        .filter(
            TransactionLog.shipping_request_id == uuid.UUID(request_id),
            TransactionLog.shipping_phase == "COMPONENT_CHANGE",
        )
        .all()
    )
    assert len(logs) == 3
    assert {log.produced_by for log in logs} == {executor.name}
    assert {log.producer_employee_id for log in logs} == {executor.employee_id}


def test_shipping_request_component_change_uses_session_without_employee_header(
    client, db_session, make_item, make_bom, make_location
):
    request_id, payload = _prepared_shipping_component_change(
        client,
        db_session,
        make_item,
        make_bom,
        make_location,
    )

    response = client.post(f"/api/shipping/requests/{request_id}/component-change", json=payload)

    assert response.status_code == 200, response.text


def test_shipping_request_component_change_rejects_unknown_actor_header(
    client, db_session, make_item, make_bom, make_location
):
    request_id, payload = _prepared_shipping_component_change(
        client,
        db_session,
        make_item,
        make_bom,
        make_location,
    )

    response = client.post(
        f"/api/shipping/requests/{request_id}/component-change",
        headers={"X-MES-Employee-Code": "missing-request-executor"},
        json=payload,
    )

    assert response.status_code == 403, response.text
    assert response.json()["detail"]["code"] == "ACTOR_MISMATCH"


def test_shipping_request_component_change_returns_403_for_inactive_header_employee(
    client, db_session, make_item, make_bom, make_location
):
    executor = _employee(
        db_session,
        code="inactive-shipping-request-component",
        name="비활성 출하 요청 전환자",
        is_active=False,
    )
    request_id, payload = _prepared_shipping_component_change(
        client,
        db_session,
        make_item,
        make_bom,
        make_location,
    )

    response = client.post(
        f"/api/shipping/requests/{request_id}/component-change",
        headers={"X-MES-Employee-Code": executor.employee_code},
        json=payload,
    )

    assert response.status_code == 403, response.text
    assert response.json()["detail"] == {
        "code": "EMPLOYEE_INACTIVE",
        "message": "비활성 직원입니다.",
    }


def test_shipping_request_duplicate_custom_pa_name_returns_readable_korean_error(client, db_session, make_item, make_bom):
    af = make_item(name="AF Main", process_type_code="AF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=1)
    pouch = make_item(name="Pouch", process_type_code="PR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    base_pa = make_item(name="Base PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    duplicate_pa = make_item(name="UI TEST", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    base_pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=5)
    make_bom(base_pa.item_id, af.item_id, Decimal("1"))
    make_bom(duplicate_pa.item_id, pouch.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
        json={
            "base_pf_item_id": str(base_pf.item_id),
            "requested_by_name": "출하 테스트 작업자",
            "custom_pa_name": "UI TEST",
            "custom_pf_name": "UI TEST PF",
            "bom_lines": [_line(af), _line(pouch)],
        },
    )

    assert create.status_code == 422, create.text
    assert create.json()["detail"]["message"] == "같은 이름의 PA 품목이 이미 있습니다: UI TEST"


def test_shipping_request_update_can_reuse_its_generated_pa_pf_names(client, db_session, make_item, make_bom):
    af = make_item(name="AF Main", process_type_code="AF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=1)
    pouch = make_item(name="Pouch", process_type_code="PR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    bracket = make_item(name="Bracket", process_type_code="PR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    base_pa = make_item(name="Base PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    base_pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=5)
    make_bom(base_pa.item_id, af.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
        json={
            "base_pf_item_id": str(base_pf.item_id),
            "requested_by_name": "출하 테스트 작업자",
            "custom_pa_name": "UI TEST",
            "custom_pf_name": "UI TEST",
            "bom_lines": [_line(af), _line(pouch)],
        },
    )
    assert create.status_code == 201, create.text
    request_id = create.json()["request_id"]
    final_pa_id = create.json()["final_pa_item_id"]
    final_pf_id = create.json()["final_pf_item_id"]

    update = client.patch(
        f"/api/shipping/requests/{request_id}",
        json={
            "custom_pa_name": "UI TEST",
            "custom_pf_name": "UI TEST",
            "bom_lines": [_line(af), _line(bracket)],
        },
    )

    assert update.status_code == 200, update.text
    assert update.json()["final_pa_item_id"] == final_pa_id
    assert update.json()["final_pf_item_id"] == final_pf_id
    assert {line["item_name"] for line in update.json()["bom_lines"] if line["parent_stage"] == "PA"} == {
        "AF Main",
        "Bracket",
    }


@pytest.mark.parametrize(
    "department",
    [DepartmentEnum.ASSEMBLY, DepartmentEnum.SHIPPING],
)
def test_component_change_api_runs_without_shipping_request(
    client, db_session, make_item, make_bom, make_location, department
):
    requester = _employee(
        db_session,
        code=f"shipping-component-actor-{department.name.lower()}",
        name="출하 전환 요청자",
        department=department,
    )
    af = make_item(name="AF Main", process_type_code="AF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=1)
    cable = make_item(name="Cable", process_type_code="PR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    source_pa = make_item(name="Source PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    target_pa = make_item(name="Target PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(source_pa.item_id, af.item_id, Decimal("1"))
    make_bom(target_pa.item_id, af.item_id, Decimal("1"))
    make_bom(target_pa.item_id, cable.item_id, Decimal("2"))
    make_location(source_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("2"))
    make_location(cable.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("4"))
    db_session.commit()

    preview = client.get(
        "/api/shipping/component-change-preview",
        params={
            "requester_employee_id": str(requester.employee_id),
            "source_pa_item_id": str(source_pa.item_id),
            "target_pa_item_id": str(target_pa.item_id),
            "quantity": 2,
        },
    )

    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["request_id"] is None
    assert body["source_item_name"] == "Source PA"
    assert body["target_item_name"] == "Target PA"
    assert [line["item_name"] for line in body["lines"]] == ["Cable"]
    assert body["lines"][0]["total_delta"] == 4

    executed = client.post(
        "/api/shipping/component-change",
        headers={"X-MES-Employee-Code": requester.employee_code},
        json={
            "source_pa_item_id": str(source_pa.item_id),
            "target_pa_item_id": str(target_pa.item_id),
            "quantity": 2,
            "memo": "sample change",
        },
    )

    assert executed.status_code == 200, executed.text
    done = executed.json()
    assert done["request_id"] is None
    assert done["source_item_name"] == "Source PA"
    assert done["target_item_name"] == "Target PA"
    assert done["quantity"] == 2
    assert done["memo"] == "sample change"
    assert len(done["transactions"]) == 3
    assert {log["shipping_phase"] for log in done["transactions"]} == {"COMPONENT_CHANGE"}
    assert {log["reference_no"] for log in done["transactions"]} == {done["reference_no"]}
    assert {log["produced_by"] for log in done["transactions"]} == {requester.name}
    logs = db_session.query(TransactionLog).filter(TransactionLog.reference_no == done["reference_no"]).all()
    assert {log.producer_employee_id for log in logs} == {requester.employee_id}


def test_component_change_api_rejects_other_department_preview_and_execute(
    client, db_session, make_item, make_bom, make_location
):
    requester = _employee(
        db_session,
        code="shipping-component-as",
        name="AS 전환 시도자",
        department=DepartmentEnum.AS,
    )
    payload = _component_change_payload(db_session, make_item, make_bom, make_location)

    preview = client.get(
        "/api/shipping/component-change-preview",
        params={
            "requester_employee_id": str(requester.employee_id),
            "source_pa_item_id": payload["source_pa_item_id"],
            "target_pa_item_id": payload["target_pa_item_id"],
            "quantity": payload["quantity"],
        },
    )
    assert preview.status_code == 403, preview.text

    executed = client.post(
        "/api/shipping/component-change",
        headers={"X-MES-Employee-Code": requester.employee_code},
        json=payload,
    )
    assert executed.status_code == 403, executed.text


def test_shipping_request_component_change_rejects_other_department_preview_and_execute(
    client, db_session, make_item, make_bom, make_location
):
    requester = _employee(
        db_session,
        code="shipping-request-component-as",
        name="AS 요청 전환 시도자",
        department=DepartmentEnum.AS,
    )
    request_id, payload = _prepared_shipping_component_change(
        client,
        db_session,
        make_item,
        make_bom,
        make_location,
    )

    preview = client.get(
        f"/api/shipping/requests/{request_id}/component-change-preview",
        params={
            "requester_employee_id": str(requester.employee_id),
            "source_pa_item_id": payload["source_pa_item_id"],
            "quantity": payload["quantity"],
        },
    )
    assert preview.status_code == 403, preview.text

    executed = client.post(
        f"/api/shipping/requests/{request_id}/component-change",
        headers={"X-MES-Employee-Code": requester.employee_code},
        json=payload,
    )
    assert executed.status_code == 403, executed.text


def test_independent_component_change_preview_requires_requester_employee_id(client):
    response = client.get(
        "/api/shipping/component-change-preview",
        params={
            "source_pa_item_id": "00000000-0000-0000-0000-000000000001",
            "target_pa_item_id": "00000000-0000-0000-0000-000000000002",
            "quantity": 1,
        },
    )

    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert isinstance(detail, list)
    assert any(row["loc"][-1] == "requester_employee_id" for row in detail)


def test_component_change_api_uses_session_without_employee_header(client, db_session, make_item, make_bom, make_location):
    payload = _component_change_payload(db_session, make_item, make_bom, make_location)

    response = client.post("/api/shipping/component-change", json=payload)

    assert response.status_code == 200, response.text


def test_component_change_api_rejects_unknown_actor_header(
    client, db_session, make_item, make_bom, make_location
):
    payload = _component_change_payload(db_session, make_item, make_bom, make_location)

    response = client.post(
        "/api/shipping/component-change",
        headers={"X-MES-Employee-Code": "missing-employee"},
        json=payload,
    )

    assert response.status_code == 403, response.text
    assert response.json()["detail"]["code"] == "ACTOR_MISMATCH"


def test_component_change_api_returns_403_for_inactive_header_employee(
    client, db_session, make_item, make_bom, make_location
):
    requester = _employee(
        db_session,
        code="inactive-shipping-component",
        name="비활성 출하 전환 요청자",
        is_active=False,
    )
    payload = _component_change_payload(db_session, make_item, make_bom, make_location)

    response = client.post(
        "/api/shipping/component-change",
        headers={"X-MES-Employee-Code": requester.employee_code},
        json=payload,
    )

    assert response.status_code == 403, response.text
    assert response.json()["detail"] == {
        "code": "EMPLOYEE_INACTIVE",
        "message": "비활성 직원입니다.",
    }


def test_item_conversion_api_supports_spec_and_bom_modes(client, db_session, make_item, make_bom, make_location):
    requester = _employee(db_session, code="item-conversion-spec", name="전환 요청자")
    source_leaf = make_item(name="Shared leaf", process_type_code="TR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=1)
    source_aa = make_item(name="Domestic AA", process_type_code="AA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    target_aa = make_item(name="Export AA", process_type_code="AA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    source_af = make_item(name="Domestic AF", process_type_code="AF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    target_af = make_item(name="Export AF", process_type_code="AF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=5)
    make_bom(source_aa.item_id, source_leaf.item_id, Decimal("2"))
    make_bom(target_aa.item_id, source_leaf.item_id, Decimal("2"))
    make_bom(source_af.item_id, source_aa.item_id, Decimal("1"))
    make_bom(target_af.item_id, target_aa.item_id, Decimal("1"))
    make_location(source_af.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("3"))
    db_session.commit()

    spec_preview = client.get(
        "/api/io/item-conversion-preview",
        params={
            "requester_employee_id": str(requester.employee_id),
            "source_item_id": str(source_af.item_id),
            "target_item_id": str(target_af.item_id),
            "quantity": 2,
            "requested_mode": "SPEC",
        },
    )

    assert spec_preview.status_code == 200, spec_preview.text
    spec_body = spec_preview.json()
    assert spec_body["requested_mode"] == "SPEC"
    assert spec_body["resolved_mode"] == "SPEC"
    assert spec_body["executable"] is True
    assert spec_body["lines"] == []

    executed = client.post(
        "/api/io/item-conversion",
        json={
            "source_item_id": str(source_af.item_id),
            "target_item_id": str(target_af.item_id),
            "quantity": 2,
            "requested_mode": "SPEC",
            "requester_employee_id": str(requester.employee_id),
        },
    )

    assert executed.status_code == 200, executed.text
    done = executed.json()
    assert done["resolved_mode"] == "SPEC"
    assert done["reference_no"].startswith("ITEM-CONV-")
    assert len(done["transactions"]) == 2

    added_leaf = make_item(name="Export-only leaf", process_type_code="TR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=6)
    source_pa = make_item(name="Source PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=7)
    target_pa = make_item(name="Target PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=8)
    make_bom(source_pa.item_id, source_af.item_id, Decimal("1"))
    make_bom(target_pa.item_id, source_af.item_id, Decimal("1"))
    make_bom(target_pa.item_id, added_leaf.item_id, Decimal("1"))
    make_location(source_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    make_location(added_leaf.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    db_session.commit()

    bom_preview = client.get(
        "/api/io/item-conversion-preview",
        params={
            "requester_employee_id": str(requester.employee_id),
            "source_item_id": str(source_pa.item_id),
            "target_item_id": str(target_pa.item_id),
            "quantity": 1,
            "requested_mode": "BOM",
        },
    )

    assert bom_preview.status_code == 200, bom_preview.text
    bom_body = bom_preview.json()
    assert bom_body["resolved_mode"] == "BOM"
    assert [line["item_name"] for line in bom_body["lines"]] == ["Export-only leaf"]
    assert bom_body["lines"][0]["total_delta"] == 1


def test_item_conversion_api_auto_resolves_mode_when_request_omits_mode(
    client, db_session, make_item, make_bom, make_location
):
    requester = _employee(db_session, code="item-conversion-auto", name="자동 판정 요청자")
    shared_leaf = make_item(name="Shared leaf", process_type_code="TR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=1)
    source_aa = make_item(name="Domestic AA", process_type_code="AA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    target_aa = make_item(name="Export AA", process_type_code="AA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    source_af = make_item(name="Domestic AF", process_type_code="AF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    target_af = make_item(name="Export AF", process_type_code="AF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=5)
    extra_leaf = make_item(name="Export-only leaf", process_type_code="TR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=6)
    source_pa = make_item(name="Source PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=7)
    target_pa = make_item(name="Target PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=8)
    make_bom(source_aa.item_id, shared_leaf.item_id, Decimal("2"))
    make_bom(target_aa.item_id, shared_leaf.item_id, Decimal("2"))
    make_bom(source_af.item_id, source_aa.item_id, Decimal("1"))
    make_bom(target_af.item_id, target_aa.item_id, Decimal("1"))
    make_bom(source_pa.item_id, source_af.item_id, Decimal("1"))
    make_bom(target_pa.item_id, source_af.item_id, Decimal("1"))
    make_bom(target_pa.item_id, extra_leaf.item_id, Decimal("1"))
    make_location(source_af.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("2"))
    make_location(source_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    make_location(extra_leaf.item_id, department=DepartmentEnum.TUBE, quantity=Decimal("1"))
    db_session.commit()

    spec_preview = client.get(
        "/api/io/item-conversion-preview",
        params={
            "requester_employee_id": str(requester.employee_id),
            "source_item_id": str(source_af.item_id),
            "target_item_id": str(target_af.item_id),
            "quantity": 1,
        },
    )
    assert spec_preview.status_code == 200, spec_preview.text
    assert spec_preview.json()["requested_mode"] == "SPEC"
    assert spec_preview.json()["resolved_mode"] == "SPEC"

    bom_preview = client.get(
        "/api/io/item-conversion-preview",
        params={
            "requester_employee_id": str(requester.employee_id),
            "source_item_id": str(source_pa.item_id),
            "target_item_id": str(target_pa.item_id),
            "quantity": 1,
        },
    )
    assert bom_preview.status_code == 200, bom_preview.text
    assert bom_preview.json()["requested_mode"] == "BOM"
    assert bom_preview.json()["resolved_mode"] == "BOM"
    assert [line["item_name"] for line in bom_preview.json()["lines"]] == ["Export-only leaf"]

    executed = client.post(
        "/api/io/item-conversion",
        json={
            "source_item_id": str(source_pa.item_id),
            "target_item_id": str(target_pa.item_id),
            "quantity": 1,
            "memo": "auto BOM conversion",
            "requester_employee_id": str(requester.employee_id),
        },
    )
    assert executed.status_code == 200, executed.text
    assert executed.json()["requested_mode"] == "BOM"
    assert executed.json()["resolved_mode"] == "BOM"


def test_item_conversion_api_requires_requester_employee_id(client):
    response = client.post(
        "/api/io/item-conversion",
        json={
            "source_item_id": str(uuid.uuid4()),
            "target_item_id": str(uuid.uuid4()),
            "quantity": 1,
        },
    )

    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert isinstance(detail, list)
    assert any(error["loc"][-1] == "requester_employee_id" for error in detail)

    preview = client.get(
        "/api/io/item-conversion-preview",
        params={
            "source_item_id": str(uuid.uuid4()),
            "target_item_id": str(uuid.uuid4()),
            "quantity": 1,
        },
    )
    assert preview.status_code == 422, preview.text
    assert any(
        error["loc"][-1] == "requester_employee_id"
        for error in preview.json()["detail"]
    )


def test_item_conversion_api_rejects_unknown_requester_claim(client):
    response = client.post(
        "/api/io/item-conversion",
        json={
            "source_item_id": str(uuid.uuid4()),
            "target_item_id": str(uuid.uuid4()),
            "quantity": 1,
            "requester_employee_id": str(uuid.uuid4()),
        },
    )

    assert response.status_code == 403, response.text
    assert response.json()["detail"]["code"] == "ACTOR_MISMATCH"


def test_item_conversion_api_returns_403_for_inactive_requester(client, db_session):
    requester = _employee(
        db_session,
        code="inactive-item-conversion",
        name="비활성 전환 요청자",
        is_active=False,
    )
    db_session.commit()

    response = client.post(
        "/api/io/item-conversion",
        json={
            "source_item_id": str(uuid.uuid4()),
            "target_item_id": str(uuid.uuid4()),
            "quantity": 1,
            "requester_employee_id": str(requester.employee_id),
        },
    )

    assert response.status_code == 403, response.text
    assert response.json()["detail"]["code"] == "EMPLOYEE_INACTIVE"


def test_item_conversion_api_allows_only_assembly_or_shipping_department(
    client, db_session
):
    requester = _employee(
        db_session,
        code="item-conversion-as",
        name="AS 전환 요청자",
        department=DepartmentEnum.AS,
    )
    db_session.commit()
    params = {
        "requester_employee_id": str(requester.employee_id),
        "source_item_id": str(uuid.uuid4()),
        "target_item_id": str(uuid.uuid4()),
        "quantity": 1,
    }

    preview = client.get("/api/io/item-conversion-preview", params=params)
    assert preview.status_code == 403, preview.text
    executed = client.post(
        "/api/io/item-conversion",
        json={
            "requester_employee_id": str(requester.employee_id),
            "source_item_id": params["source_item_id"],
            "target_item_id": params["target_item_id"],
            "quantity": 1,
        },
    )
    assert executed.status_code == 403, executed.text


def test_item_conversion_shipping_department_can_preview_and_execute(
    client, db_session, make_item, make_bom, make_location
):
    requester = _employee(
        db_session,
        code="item-conversion-shipping",
        name="출하 전환 요청자",
        department=DepartmentEnum.SHIPPING,
    )
    payload = _component_change_payload(db_session, make_item, make_bom, make_location)
    preview = client.get(
        "/api/io/item-conversion-preview",
        params={
            "requester_employee_id": str(requester.employee_id),
            "source_item_id": payload["source_pa_item_id"],
            "target_item_id": payload["target_pa_item_id"],
            "quantity": payload["quantity"],
        },
    )
    assert preview.status_code == 200, preview.text

    executed = client.post(
        "/api/io/item-conversion",
        json={
            "requester_employee_id": str(requester.employee_id),
            "source_item_id": payload["source_pa_item_id"],
            "target_item_id": payload["target_pa_item_id"],
            "quantity": payload["quantity"],
            "memo": payload["memo"],
        },
    )
    assert executed.status_code == 200, executed.text


def test_item_conversion_api_attributes_every_log_to_requester(
    client, db_session, make_item, make_bom, make_location
):
    requester = _employee(db_session, code="item-conversion-owner", name="김전환")
    recovered_part = make_item(
        name="Recovered part",
        process_type_code="TR",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=1,
    )
    consumed_part = make_item(
        name="Consumed part",
        process_type_code="TR",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=2,
    )
    source_pa = make_item(
        name="Source PA",
        process_type_code="PA",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=3,
    )
    target_pa = make_item(
        name="Target PA",
        process_type_code="PA",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=4,
    )
    make_bom(source_pa.item_id, recovered_part.item_id, Decimal("1"))
    make_bom(target_pa.item_id, consumed_part.item_id, Decimal("1"))
    make_location(source_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    make_location(consumed_part.item_id, department=DepartmentEnum.TUBE, quantity=Decimal("1"))
    db_session.commit()

    response = client.post(
        "/api/io/item-conversion",
        json={
            "source_item_id": str(source_pa.item_id),
            "target_item_id": str(target_pa.item_id),
            "quantity": 1,
            "memo": "요청자 귀속 확인",
            "requester_employee_id": str(requester.employee_id),
        },
    )

    assert response.status_code == 200, response.text
    reference_no = response.json()["reference_no"]
    logs = db_session.query(TransactionLog).filter(TransactionLog.reference_no == reference_no).all()
    assert len(logs) == 4
    assert {log.produced_by for log in logs} == {requester.name}
    assert {log.producer_employee_id for log in logs} == {requester.employee_id}


def test_item_conversion_api_blocks_wrong_level_and_spec_with_bom_difference(
    client, db_session, make_item, make_bom, make_location
):
    requester = _employee(db_session, code="item-conversion-block", name="차단 검증자")
    leaf_a = make_item(name="Leaf A", process_type_code="TR", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    leaf_b = make_item(name="Leaf B", process_type_code="TR", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=2)
    source_pa = make_item(name="Source PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    target_pa = make_item(name="Target PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    source_af = make_item(name="Source AF", process_type_code="AF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=5)
    make_bom(source_pa.item_id, leaf_a.item_id, Decimal("1"))
    make_bom(target_pa.item_id, leaf_b.item_id, Decimal("1"))
    make_bom(source_af.item_id, leaf_a.item_id, Decimal("1"))
    make_location(source_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    db_session.commit()

    wrong_level = client.get(
        "/api/io/item-conversion-preview",
        params={
            "requester_employee_id": str(requester.employee_id),
            "source_item_id": str(source_pa.item_id),
            "target_item_id": str(source_af.item_id),
            "quantity": 1,
            "requested_mode": "BOM",
        },
    )
    assert wrong_level.status_code == 422, wrong_level.text

    spec_with_diff = client.get(
        "/api/io/item-conversion-preview",
        params={
            "requester_employee_id": str(requester.employee_id),
            "source_item_id": str(source_pa.item_id),
            "target_item_id": str(target_pa.item_id),
            "quantity": 1,
            "requested_mode": "SPEC",
        },
    )
    assert spec_with_diff.status_code == 200, spec_with_diff.text
    body = spec_with_diff.json()
    assert body["resolved_mode"] == "BOM"
    assert body["executable"] is False
    assert "구성 전환" in body["blocking_reason"]

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
            json={"base_pf_item_id": str(pf.item_id), "requested_by_name": "출하 테스트 작업자", "invoice_number": "prepared-delete-001"},
    )
    assert create.status_code == 201, create.text
    request_id = create.json()["request_id"]

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
            "requested_by_name": "출하 테스트 작업자",
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
    # 클라이언트가 DEFAULT라고 보내도 실제 기본 BOM에 없는 수동 행은 서버가 CUSTOM으로 정규화한다.
    assert excluded["origin"] == "CUSTOM"
    assert all(line["item_id"] != str(cable.item_id) for line in body["checklist_lines"])

    request_id = body["request_id"]

    update = client.patch(
        f"/api/shipping/requests/{request_id}",
        json={
            "finalization_mode": "CREATE_NEW",
            "custom_pa_name": "Bracket PA",
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
    assert match.json()["base_pf_matches"] is False
    assert [candidate["pf_item_id"] for candidate in match.json()["pf_candidates"]] == [update.json()["final_pf_item_id"]]


def test_preparing_shipping_requests_can_be_deleted(client, db_session, make_item, make_bom):
    af = make_item(name="AF Main", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    pa = make_item(name="Base PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
            json={"base_pf_item_id": str(pf.item_id), "requested_by_name": "출하 테스트 작업자", "invoice_number": "shortage-001"},
    )
    assert create.status_code == 201, create.text
    request_id = create.json()["request_id"]

    delete_preparing = client.delete(f"/api/shipping/requests/{request_id}")
    assert delete_preparing.status_code == 204, delete_preparing.text

    rows = client.get("/api/shipping/requests")
    assert rows.status_code == 200, rows.text
    assert all(row["request_id"] != request_id for row in rows.json())

def test_prepared_and_picked_up_shipping_requests_cannot_be_deleted(client, db_session, make_item, make_bom, make_location):
    af = make_item(name="AF Main", process_type_code="AF", warehouse_qty=Decimal("2"), model_symbol="4", serial_no=1)
    pa = make_item(name="Base PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    make_location(pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
        json={"base_pf_item_id": str(pf.item_id), "requested_by_name": "출하 테스트 작업자", "invoice_number": "prepared-delete-001"},
    )
    assert create.status_code == 201, create.text
    request_id = create.json()["request_id"]
    requester = db_session.query(Employee).filter(Employee.employee_code == "shipping-test-actor").one()
    _submit_final_pf_production(
        client,
        requester_employee_id=str(requester.employee_id),
        final_pf_item_id=create.json()["final_pf_item_id"],
        quantity=1,
    )
    prepared = client.post(f"/api/shipping/requests/{request_id}/prepare-complete", json={"serial_numbers": "SN-001", "companion_lines": []})
    assert prepared.status_code == 200, prepared.text

    delete_prepared = client.delete(f"/api/shipping/requests/{request_id}")
    assert delete_prepared.status_code == 422, delete_prepared.text

    picked_up = client.post(f"/api/shipping/requests/{request_id}/pickup-complete")
    assert picked_up.status_code == 200, picked_up.text

    delete_picked_up = client.delete(f"/api/shipping/requests/{request_id}")
    assert delete_picked_up.status_code == 422, delete_picked_up.text


def test_shipping_prepare_complete_requires_final_pf_shipping_department_stock(client, db_session, make_item, make_bom):
    af = make_item(name="AF Main", process_type_code="AF", warehouse_qty=Decimal("5"), model_symbol="4", serial_no=1)
    pa = make_item(name="Base PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("5"), model_symbol="4", serial_no=3)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
        json={"base_pf_item_id": str(pf.item_id), "requested_by_name": "출하 테스트 작업자", "invoice_number": "shortage-001"},
    )
    assert create.status_code == 201, create.text
    request_id = create.json()["request_id"]
    prepared = client.post(f"/api/shipping/requests/{request_id}/prepare-complete", json={"serial_numbers": "SN-001", "companion_lines": []})

    assert prepared.status_code == 422, prepared.text
    body = prepared.text
    assert "출하 준비 재고 부족" in body
    assert pf.mes_code in body
    assert DepartmentEnum.SHIPPING.value in body


def test_shipping_prepare_complete_accepts_preproduced_pf_in_shipping_department(
    client, db_session, make_item, make_bom, make_location
):
    af = make_item(name="Shipping stock AF", process_type_code="AF", model_symbol="4", serial_no=8)
    pa = make_item(name="Shipping stock PA", process_type_code="PA", model_symbol="4", serial_no=9)
    pf = make_item(name="Shipping stock PF", process_type_code="PF", model_symbol="4", serial_no=10)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    make_location(pf.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
        json={"base_pf_item_id": str(pf.item_id), "requested_by_name": "출하 테스트 작업자", "invoice_number": "shipping-stock-001"},
    )
    assert create.status_code == 201, create.text
    request_id = create.json()["request_id"]
    prepared = client.post(
        f"/api/shipping/requests/{request_id}/prepare-complete",
        json={"serial_numbers": "SN-001"},
    )

    assert prepared.status_code == 200, prepared.text
    body = prepared.json()
    assert body["status"] == ShippingRequestStatusEnum.PREPARED.value
    assert any(
        allocation["item_id"] == str(pf.item_id)
        and allocation["quantity"] == 1
        and allocation["status"] == "RESERVED"
        for allocation in body["allocations"]
    )


def test_shipping_prepare_actor_is_snapshotted_cleared_and_used_for_pickup_logs(
    client, db_session, make_item, make_bom, make_location
):
    af = make_item(name="Prepared actor AF", process_type_code="AF", model_symbol="4", serial_no=21)
    pa = make_item(name="Prepared actor PA", process_type_code="PA", model_symbol="4", serial_no=22)
    pf = make_item(name="Prepared actor PF", process_type_code="PF", model_symbol="4", serial_no=23)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    make_location(pf.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    actor = (
        db_session.query(Employee)
        .filter(Employee.employee_code == "shipping-test-actor")
        .one()
    )
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
        json={
            "base_pf_item_id": str(pf.item_id),
            "requested_by_name": actor.name,
            "invoice_number": "prepared-actor-001",
        },
    )
    assert create.status_code == 201, create.text
    request_id = create.json()["request_id"]
    prepared = client.post(
        f"/api/shipping/requests/{request_id}/prepare-complete",
        json={"serial_numbers": "SN-ACTOR-001"},
    )
    assert prepared.status_code == 200, prepared.text
    assert prepared.json()["prepared_by_employee_id"] == str(actor.employee_id)
    assert prepared.json()["prepared_by_name"] == actor.name

    cancelled = client.post(
        f"/api/shipping/requests/{request_id}/prepare-cancel",
        json={"reason": "prepare again"},
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["prepared_by_employee_id"] is None
    assert cancelled.json()["prepared_by_name"] is None

    prepared_again = client.post(
        f"/api/shipping/requests/{request_id}/prepare-complete",
        json={"serial_numbers": "SN-ACTOR-002"},
    )
    assert prepared_again.status_code == 200, prepared_again.text
    picked_up = client.post(f"/api/shipping/requests/{request_id}/pickup-complete")
    assert picked_up.status_code == 200, picked_up.text

    pickup_logs = (
        db_session.query(TransactionLog)
        .filter(
            TransactionLog.shipping_request_id == uuid.UUID(request_id),
            TransactionLog.shipping_phase == "PICKUP",
        )
        .all()
    )
    assert pickup_logs
    assert {log.produced_by for log in pickup_logs} == {actor.name}
    assert {log.producer_employee_id for log in pickup_logs} == {actor.employee_id}


@pytest.mark.parametrize(
    ("actor_mode", "expected_status"),
    [("inactive", 403)],
)
def test_shipping_prepare_complete_rejects_invalid_actor_without_state_changes(
    client,
    db_session,
    make_item,
    make_bom,
    make_location,
    actor_mode,
    expected_status,
):
    af = make_item(name=f"Prepare guard {actor_mode} AF", process_type_code="AF", model_symbol="4", serial_no=31)
    pa = make_item(name=f"Prepare guard {actor_mode} PA", process_type_code="PA", model_symbol="4", serial_no=32)
    pf = make_item(name=f"Prepare guard {actor_mode} PF", process_type_code="PF", model_symbol="4", serial_no=33)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    make_location(pf.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
        json={
            "base_pf_item_id": str(pf.item_id),
            "invoice_number": f"prepare-guard-{actor_mode}",
        },
    )
    assert create.status_code == 201, create.text
    request_id = create.json()["request_id"]
    if actor_mode == "missing":
        client.headers.pop("X-MES-Employee-Code", None)
    else:
        inactive = _employee(
            db_session,
            code="inactive-prepare-actor",
            name="Inactive prepare actor",
            is_active=False,
            department=DepartmentEnum.SHIPPING,
        )
        db_session.commit()
        client.headers["X-MES-Employee-Code"] = inactive.employee_code

    response = client.post(
        f"/api/shipping/requests/{request_id}/prepare-complete",
        json={"serial_numbers": "SN-GUARD-001"},
    )
    assert response.status_code == expected_status, response.text

    db_session.expire_all()
    request = (
        db_session.query(ShippingRequest)
        .filter(ShippingRequest.request_id == uuid.UUID(request_id))
        .one()
    )
    assert request.status is ShippingRequestStatusEnum.PREPARING
    assert request.prepared_at is None
    assert request.prepared_by_employee_id is None
    assert request.prepared_by_name is None
    assert request.allocations == []


def test_shipping_prepare_complete_requires_nonblank_serial_numbers_without_state_changes(
    client, db_session, make_item, make_bom
):
    af = make_item(name="SN API AF", process_type_code="AF", model_symbol="4", serial_no=5)
    pa = make_item(name="SN API PA", process_type_code="PA", model_symbol="4", serial_no=6)
    pf = make_item(name="SN API PF", process_type_code="PF", model_symbol="4", serial_no=7)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
        json={"base_pf_item_id": str(pf.item_id), "invoice_number": "SN-API-001"},
    )
    assert create.status_code == 201, create.text
    request_id = create.json()["request_id"]
    before = db_session.query(ShippingRequest).filter(ShippingRequest.request_id == request_id).one()
    event_count = len(before.events)

    missing = client.post(f"/api/shipping/requests/{request_id}/prepare-complete", json={})
    assert missing.status_code == 422, missing.text
    assert "serial_numbers" in missing.text
    blank = client.post(
        f"/api/shipping/requests/{request_id}/prepare-complete",
        json={"serial_numbers": " \n\t "},
    )
    assert blank.status_code == 422, blank.text
    assert "SN" in blank.text

    db_session.expire_all()
    reloaded = db_session.query(ShippingRequest).filter(ShippingRequest.request_id == request_id).one()
    assert reloaded.status is ShippingRequestStatusEnum.PREPARING
    assert len(reloaded.events) == event_count
    assert reloaded.serial_numbers is None


def test_shipping_preparing_response_includes_stock_shortages(client, db_session, make_item, make_bom):
    af = make_item(name="AF Main", process_type_code="AF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=1)
    pa = make_item(name="Short PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    companion = make_item(name="Companion Box", process_type_code="PR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    create = client.post(
        "/api/shipping/requests",
        json={
            "base_pf_item_id": str(pf.item_id),
            "requested_by_name": "출하 테스트 작업자",
            "companion_lines": [{"item_id": str(companion.item_id), "quantity": 2, "unit": "EA"}],
        },
    )
    assert create.status_code == 201, create.text
    shortages = create.json()["stock_shortages"]
    assert {line["item_name"] for line in shortages} == {"Short PA", "AF Main", "Companion Box"}
    assert {line["item_name"]: line["shortage_quantity"] for line in shortages} == {
        "Short PA": 1,
        "AF Main": 1,
        "Companion Box": 2,
    }
    assert all(line["phase"] == "PREPARE" for line in shortages)


def test_shipping_invoice_revision_and_cancel_are_attributed_and_retained(client, db_session, make_item, make_bom):
    actor = _employee(
        db_session,
        code="shipping-sales-actor",
        name="영업 담당자",
        department=DepartmentEnum.SALES,
    )
    af = make_item(name="Invoice AF", process_type_code="AF", model_symbol="4", serial_no=1)
    pa = make_item(name="Invoice PA", process_type_code="PA", model_symbol="4", serial_no=2)
    pf = make_item(name="Invoice PF", process_type_code="PF", model_symbol="4", serial_no=3)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()
    headers = {"X-MES-Employee-Code": actor.employee_code}

    created = client.post(
        "/api/shipping/requests",
        headers=headers,
        json={"base_pf_item_id": str(pf.item_id), "invoice_number": " inv-001 "},
    )

    assert created.status_code == 201, created.text
    request_id = created.json()["request_id"]
    assert created.json()["invoice_number"] == "INV-001"

    changed = client.patch(
        f"/api/shipping/requests/{request_id}",
        headers=headers,
        json={"notes": "출하 메모"},
    )
    assert changed.status_code == 200, changed.text

    revisions = client.get(f"/api/shipping/requests/{request_id}/revisions")
    assert revisions.status_code == 200, revisions.text
    assert revisions.json()[0]["edited_by_employee_id"] == str(actor.employee_id)
    assert revisions.json()[0]["affects_preparation"] is True
    assert revisions.json()[0]["changes"] == [
        {"field": "notes", "before": None, "after": "출하 메모"}
    ]

    invoice = client.patch(
        f"/api/shipping/requests/{request_id}/invoice",
        headers=headers,
        json={"invoice_number": "inv-002"},
    )
    assert invoice.status_code == 200, invoice.text
    assert invoice.json()["invoice_number"] == "INV-002"
    assert invoice.json()["latest_preparation_revision"]["affects_preparation"] is True
    revisions_after_invoice = client.get(f"/api/shipping/requests/{request_id}/revisions").json()
    assert revisions_after_invoice[0]["affects_preparation"] is False

    no_op = client.patch(
        f"/api/shipping/requests/{request_id}/invoice",
        headers=headers,
        json={"invoice_number": "INV-002"},
    )
    assert no_op.status_code == 200, no_op.text
    assert len(client.get(f"/api/shipping/requests/{request_id}/revisions").json()) == 2

    cancelled = client.delete(f"/api/shipping/requests/{request_id}", headers=headers)
    assert cancelled.status_code == 204, cancelled.text
    active = client.get("/api/shipping/requests")
    assert request_id not in {row["request_id"] for row in active.json()}
    duplicate = client.post(
        "/api/shipping/requests",
        headers=headers,
        json={"base_pf_item_id": str(pf.item_id), "invoice_number": "inv-002"},
    )
    assert duplicate.status_code == 201, duplicate.text
    assert duplicate.json()["invoice_number"] == "INV-002"
    history = client.get("/api/shipping/history", params={"q": "inv-002"})
    assert history.status_code == 200, history.text
    assert history.json()["requests"][0]["status"] == "CANCELLED"

    second = client.post(
        "/api/shipping/requests",
        headers=headers,
        json={"base_pf_item_id": str(pf.item_id), "invoice_number": "inv-003"},
    )
    assert second.status_code == 201, second.text
    duplicate_update = client.patch(
        f"/api/shipping/requests/{second.json()['request_id']}",
        headers=headers,
        json={"invoice_number": " inv-002 "},
    )
    assert duplicate_update.status_code == 200, duplicate_update.text
    assert duplicate_update.json()["invoice_number"] == "INV-002"
    assert client.delete(f"/api/shipping/requests/{second.json()['request_id']}", headers=headers).status_code == 204
    paged = client.get("/api/shipping/history", params={"q": "INV-", "limit": 1})
    assert paged.status_code == 200, paged.text
    assert paged.json()["has_more"] is True
    next_page = client.get("/api/shipping/history", params={"q": "INV-", "limit": 1, "cursor": paged.json()["next_cursor"]})
    assert next_page.status_code == 200, next_page.text
    assert len(next_page.json()["requests"]) == 1
    months = client.get("/api/shipping/history/months", params={"status": "CANCELLED"})
    assert months.status_code == 200, months.text
    assert sum(row["count"] for row in months.json()) == 2


def test_shipping_session_allows_missing_header_and_rejects_spoofed_actors(client, db_session, make_item, make_bom):
    af = make_item(name="Actor AF", process_type_code="AF", model_symbol="4", serial_no=1)
    pa = make_item(name="Actor PA", process_type_code="PA", model_symbol="4", serial_no=2)
    pf = make_item(name="Actor PF", process_type_code="PF", model_symbol="4", serial_no=3)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()
    created = client.post(
        "/api/shipping/requests",
        json={"base_pf_item_id": str(pf.item_id), "invoice_number": "ACTOR-HEADER"},
    )
    assert created.status_code == 201, created.text
    path = f"/api/shipping/requests/{created.json()['request_id']}"

    assert client.patch(path, json={"notes": "session actor"}).status_code == 200
    assert client.patch(
        path,
        headers={"X-MES-Employee-Code": "unknown-actor"},
        json={"notes": "unknown"},
    ).status_code == 403
    inactive = _employee(
        db_session,
        code="inactive-shipping-actor",
        name="Inactive actor",
        is_active=False,
    )
    db_session.commit()
    assert client.patch(
        path,
        headers={"X-MES-Employee-Code": inactive.employee_code},
        json={"notes": "inactive"},
    ).status_code == 403


def test_shipping_history_uses_kst_month_boundaries(client, db_session, make_item, make_bom):
    af = make_item(name="KST AF", process_type_code="AF", model_symbol="4", serial_no=1)
    pa = make_item(name="KST PA", process_type_code="PA", model_symbol="4", serial_no=2)
    pf = make_item(name="KST PF", process_type_code="PF", model_symbol="4", serial_no=3)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    created_ids = []
    for invoice in ("KST-JAN", "KST-FEB"):
        response = client.post(
            "/api/shipping/requests",
            json={"base_pf_item_id": str(pf.item_id), "invoice_number": invoice},
        )
        assert response.status_code == 201, response.text
        created_ids.append(response.json()["request_id"])
    rows = [db_session.get(ShippingRequest, request_id) for request_id in created_ids]
    rows[0].status = ShippingRequestStatusEnum.CANCELLED
    rows[0].cancelled_at = datetime(2026, 1, 31, 14, 59)
    rows[1].status = ShippingRequestStatusEnum.CANCELLED
    rows[1].cancelled_at = datetime(2026, 1, 31, 15, 0)
    db_session.commit()

    months = client.get("/api/shipping/history/months", params={"year": 2026, "status": "CANCELLED"})
    assert months.status_code == 200, months.text
    assert months.json() == [
        {"year": 2026, "month": 2, "count": 1},
        {"year": 2026, "month": 1, "count": 1},
    ]
    february = client.get("/api/shipping/history", params={"year": 2026, "month": 2})
    assert february.status_code == 200, february.text
    assert [row["invoice_number"] for row in february.json()["requests"]] == ["KST-FEB"]


def test_shipping_history_search_ignores_spaces_and_separators(client, db_session, make_item):
    pf = make_item(name="Base History PF", process_type_code="PF", model_symbol="4", serial_no=1)
    request = ShippingRequest(
        base_pf_item_id=pf.item_id,
        status=ShippingRequestStatusEnum.CANCELLED,
        invoice_number="INV- 12/3",
        custom_pf_name="History- PF/01",
        cancelled_at=datetime.utcnow(),
    )
    db_session.add(request)
    db_session.commit()

    invoice_response = client.get("/api/shipping/history", params={"q": "inv123"})
    pf_name_response = client.get("/api/shipping/history", params={"q": "historypf01"})

    assert invoice_response.status_code == 200, invoice_response.text
    assert [row["request_id"] for row in invoice_response.json()["requests"]] == [str(request.request_id)]
    assert pf_name_response.status_code == 200, pf_name_response.text
    assert [row["request_id"] for row in pf_name_response.json()["requests"]] == [str(request.request_id)]


def test_shipping_revision_snapshots_item_identity_and_detail_endpoint_restores_cancelled_request(
    client, db_session, make_item, make_bom
):
    af = make_item(name="Snapshot AF", process_type_code="AF", model_symbol="4", serial_no=1)
    pa = make_item(name="Snapshot PA", process_type_code="PA", model_symbol="4", serial_no=2)
    pf = make_item(name="Snapshot PF", process_type_code="PF", model_symbol="4", serial_no=3)
    companion = make_item(name="Snapshot Box", process_type_code="PR", model_symbol="4", serial_no=4)
    extra = make_item(name="Snapshot Extra", process_type_code="PR", model_symbol="4", serial_no=5)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()
    created = client.post(
        "/api/shipping/requests",
        json={
            "base_pf_item_id": str(pf.item_id),
            "invoice_number": "DETAIL-RESTORE",
            "companion_lines": [{"item_id": str(companion.item_id), "quantity": 1, "unit": "EA"}],
        },
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["request_id"]

    companion.item_name = "Snapshot Box Renamed"
    af.item_name = "Snapshot AF Renamed"
    db_session.commit()
    no_op = client.patch(
        f"/api/shipping/requests/{request_id}",
        json={"companion_lines": [{"item_id": str(companion.item_id), "quantity": 1, "unit": "EA"}]},
    )
    assert no_op.status_code == 200, no_op.text
    assert client.get(f"/api/shipping/requests/{request_id}/revisions").json() == []

    changed = client.patch(
        f"/api/shipping/requests/{request_id}",
        json={
            "custom_pa_name": "Snapshot custom PA",
            "custom_pf_name": "Snapshot custom PF",
            "bom_lines": [
                {"parent_stage": "PF", "child_item_id": str(pa.item_id), "quantity": 1, "unit": "EA"},
                {"parent_stage": "PA", "child_item_id": str(af.item_id), "quantity": 1, "unit": "EA"},
                {"parent_stage": "PA", "child_item_id": str(extra.item_id), "quantity": 1, "unit": "EA"},
            ],
            "companion_lines": [],
        },
    )
    assert changed.status_code == 200, changed.text
    revision = client.get(f"/api/shipping/requests/{request_id}/revisions").json()[0]
    changes = {change["field"]: change for change in revision["changes"]}
    bom_before = next(line for line in changes["bom_lines"]["before"] if line["child_item_id"] == str(af.item_id))
    bom_after = next(line for line in changes["bom_lines"]["after"] if line["child_item_id"] == str(extra.item_id))
    companion_before = changes["companion_lines"]["before"][0]
    assert bom_before["item_name"] == "Snapshot AF Renamed"
    assert bom_before["mes_code"] == af.mes_code
    assert bom_after["item_name"] == "Snapshot Extra"
    assert bom_after["mes_code"] == extra.mes_code
    assert companion_before["item_name"] == "Snapshot Box Renamed"
    assert companion_before["mes_code"] == companion.mes_code

    cancelled = client.delete(f"/api/shipping/requests/{request_id}")
    assert cancelled.status_code == 204, cancelled.text
    detail = client.get(f"/api/shipping/requests/{request_id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["status"] == "CANCELLED"
    assert detail.json()["latest_preparation_revision"]["revision_id"] == revision["revision_id"]
    missing = client.get(f"/api/shipping/requests/{uuid.uuid4()}")
    assert missing.status_code == 404, missing.text
