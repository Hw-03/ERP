from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models import (
    ActivityAuditLog,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryOperation,
    InventoryLocation,
    IoBatch,
    IoBundle,
    IoLine,
    LocationStatusEnum,
    ShippingRequest,
    ShippingRequestStatusEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import shipping_actions as shipping_actions_svc
from app.services.pin_auth import DEFAULT_PIN_HASH


def _make_employee(
    db_session,
    *,
    code: str = "IO01",
    name: str = "IO Tester",
    department: DepartmentEnum = DepartmentEnum.ASSEMBLY,
    warehouse_role: str = "none",
    department_role: str = "none",
) -> Employee:
    employee = Employee(
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
    db_session.add(employee)
    db_session.flush()
    return employee


def _preview_internal_use(client, requester: Employee, item, *, to_department: str = "AS"):
    return client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": to_department,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "item_id": str(item.item_id),
                    "quantity": "3",
                }
            ],
        },
    )


def _preview_warehouse_adjust(
    client,
    requester: Employee,
    item,
    *,
    sub_type: str,
    quantity: int,
):
    return client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_adjust",
            "sub_type": sub_type,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "item_id": str(item.item_id),
                    "quantity": quantity,
                }
            ],
        },
    )


def _preview_department_single_adjustment(
    client,
    requester: Employee,
    item,
    *,
    sub_type: str,
    quantity: int = 1,
):
    return client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": sub_type,
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "targets": [
                {
                    "source_kind": "manual",
                    "item_id": str(item.item_id),
                    "quantity": quantity,
                }
            ],
        },
    )


def _internal_use_bundles(
    item,
    *,
    to_department: str = "AS",
    quantity: int = 1,
) -> list[dict]:
    return [
        {
            "bundle_id": str(uuid.uuid4()),
            "source_kind": "direct_item",
            "title": item.item_name,
            "source_item_id": str(item.item_id),
            "source_mes_code": item.mes_code,
            "quantity": quantity,
            "expanded_level": 1,
            "lines": [
                {
                    "line_id": str(uuid.uuid4()),
                    "item_id": str(item.item_id),
                    "item_name": item.item_name,
                    "mes_code": item.mes_code,
                    "unit": item.unit,
                    "direction": "out",
                    "from_bucket": "warehouse",
                    "from_department": None,
                    "to_bucket": "none",
                    "to_department": to_department,
                    "quantity": quantity,
                    "included": True,
                    "origin": "direct",
                }
            ],
        }
    ]


def _approve_stock_request(client, request_id, approver: Employee):
    return client.post(
        f"/api/stock-requests/{request_id}/approve",
        json={"actor_employee_id": str(approver.employee_id), "pin": "0000"},
    )


def _approve_department_request(client, request_id, approver: Employee):
    return client.post(
        f"/api/stock-requests/{request_id}/department-approve",
        json={"actor_employee_id": str(approver.employee_id), "pin": "0000"},
    )


def _reject_department_request(client, request_id, approver: Employee):
    return client.post(
        f"/api/stock-requests/{request_id}/department-reject",
        json={
            "actor_employee_id": str(approver.employee_id),
            "pin": "0000",
            "reason": "재입고 반려",
        },
    )


def test_shipping_request_id_is_rejected_for_new_io_submission_and_draft(
    client, db_session, make_bom, make_item, make_location
):
    af = make_item(name="Shipping linked AF", process_type_code="AF", model_symbol="7", serial_no=1)
    pa = make_item(name="Shipping linked PA", process_type_code="PA", model_symbol="7", serial_no=1)
    pf = make_item(name="Shipping linked PF", process_type_code="PF", model_symbol="7", serial_no=2)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    make_location(pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    requester = _make_employee(db_session, code="SHIP-LINKED-IO")
    request = shipping_actions_svc.create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "invoice_number": "SHIP-LINKED-IO-001",
        },
        requester,
    )
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "produce",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "item_id": str(pf.item_id),
                    "quantity": 1,
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.text

    payload = {
        "requester_employee_id": str(requester.employee_id),
        "work_type": "process",
        "sub_type": "produce",
        "to_department": DepartmentEnum.ASSEMBLY.value,
        "shipping_request_id": str(request.request_id),
        "bundles": preview.json()["bundles"],
    }
    submitted = client.post("/api/io/submit", json=payload)
    drafted = client.put("/api/io/draft", json=payload)

    assert submitted.status_code == 422, submitted.text
    assert "shipping_request_id" in submitted.text
    assert drafted.status_code == 422, drafted.text
    assert "shipping_request_id" in drafted.text
    assert db_session.query(IoBatch).count() == 0
    assert db_session.query(TransactionLog).count() == 0


def test_shipping_request_id_is_rejected_regardless_of_request_status(
    client, db_session, make_bom, make_item, make_location
):
    af = make_item(name="Shipping context AF", process_type_code="AF", model_symbol="7", serial_no=3)
    pa = make_item(name="Shipping context PA", process_type_code="PA", model_symbol="7", serial_no=4)
    pf = make_item(name="Shipping context PF", process_type_code="PF", model_symbol="7", serial_no=5)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    make_location(pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    requester = _make_employee(db_session, code="SHIP-CONTEXT-STATE")
    request = shipping_actions_svc.create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "invoice_number": "SHIP-CONTEXT-STATE-001",
        },
        requester,
    )
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "produce",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "item_id": str(pf.item_id),
                    "quantity": 1,
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.text

    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "produce",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "shipping_request_id": str(request.request_id),
            "bundles": preview.json()["bundles"],
        },
    )

    assert submitted.status_code == 422, submitted.text
    assert "shipping_request_id" in submitted.text
    assert "폐기" in submitted.text


def test_legacy_shipping_linked_draft_is_readable_but_cannot_be_updated_submitted_or_deleted(
    client, db_session, make_item
):
    pf = make_item(name="Legacy linked draft PF", process_type_code="PF")
    requester = _make_employee(db_session, code="LEGACY-LINKED-DRAFT")
    shipping_request = ShippingRequest(
        base_pf_item_id=pf.item_id,
        status=ShippingRequestStatusEnum.PREPARING,
    )
    db_session.add(shipping_request)
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "produce",
            "to_department": DepartmentEnum.SHIPPING.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "item_id": str(pf.item_id),
                    "quantity": 1,
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.text
    payload = {
        "requester_employee_id": str(requester.employee_id),
        "work_type": "process",
        "sub_type": "produce",
        "to_department": DepartmentEnum.SHIPPING.value,
        "bundles": preview.json()["bundles"],
    }
    saved = client.put("/api/io/draft", json=payload)
    assert saved.status_code == 200, saved.text
    batch_id = saved.json()["batch_id"]
    batch = db_session.query(IoBatch).filter(IoBatch.batch_id == uuid.UUID(batch_id)).one()
    batch.shipping_request_id = shipping_request.request_id
    db_session.commit()

    readable = client.get(f"/api/io/{batch_id}")
    assert readable.status_code == 200, readable.text
    assert readable.json()["shipping_request_id"] == str(shipping_request.request_id)

    update_payload = {**payload, "batch_id": batch_id}
    updated = client.put("/api/io/draft", json=update_payload)
    assert updated.status_code == 422, updated.text
    assert "조회만" in updated.text

    submitted = client.post(
        f"/api/io/draft/{batch_id}/submit",
        params={"requester_employee_id": str(requester.employee_id)},
    )
    assert submitted.status_code == 422, submitted.text
    assert "조회만" in submitted.text

    deleted = client.delete(
        f"/api/io/draft/{batch_id}",
        params={"requester_employee_id": str(requester.employee_id)},
    )
    assert deleted.status_code == 422, deleted.text
    assert "조회만" in deleted.text

    db_session.refresh(batch)
    assert batch.status == "draft"
    assert db_session.query(TransactionLog).count() == 0


@pytest.mark.parametrize(
    ("path", "method"),
    [("/api/io/draft", "put"), ("/api/io/submit", "post")],
)
def test_internal_use_unauthorized_write_rejected_without_preview(
    client, db_session, make_item, path, method
):
    item = make_item(name="미리보기 우회품", warehouse_qty=Decimal("5"))
    requester = _make_employee(db_session, code=f"IU-NO-{method}")
    db_session.commit()
    response = getattr(client, method)(
        path,
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": "AS",
            "bundles": _internal_use_bundles(item),
        },
    )
    assert response.status_code == 403, response.text


def test_internal_use_unauthorized_existing_draft_update_rejected(
    client, db_session, make_item
):
    item = make_item(name="권한 회수 임시저장품", warehouse_qty=Decimal("5"))
    requester = _make_employee(
        db_session,
        code="IU-UPDATE",
        department=DepartmentEnum.AS,
    )
    db_session.commit()
    payload = {
        "requester_employee_id": str(requester.employee_id),
        "work_type": "internal_use",
        "sub_type": "internal_use_out",
        "to_department": "AS",
        "bundles": _internal_use_bundles(item),
    }
    saved = client.put("/api/io/draft", json=payload)
    assert saved.status_code == 200, saved.text

    requester.department = DepartmentEnum.ASSEMBLY.value
    db_session.commit()
    payload["batch_id"] = saved.json()["batch_id"]
    updated = client.put("/api/io/draft", json=payload)
    assert updated.status_code == 403, updated.text


@pytest.mark.parametrize(
    ("work_type", "sub_type"),
    [("internal_use", "receive_supplier"), ("receive", "internal_use_out")],
)
def test_internal_use_fresh_submit_rejects_work_sub_type_tampering(
    client, db_session, make_item, work_type, sub_type
):
    item = make_item(name="작업유형 변조품", warehouse_qty=Decimal("5"))
    requester = _make_employee(
        db_session,
        code=f"IU-PAIR-{work_type}",
        department=DepartmentEnum.AS,
    )
    db_session.commit()
    response = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": work_type,
            "sub_type": sub_type,
            "to_department": "AS",
            "bundles": _internal_use_bundles(item),
        },
    )
    assert response.status_code == 422, response.text


def test_internal_use_fresh_submit_rejects_invalid_destination(
    client, db_session, make_item
):
    item = make_item(name="잘못된 부서 반출품", warehouse_qty=Decimal("5"))
    requester = _make_employee(
        db_session,
        code="IU-BAD-DEPT",
        department=DepartmentEnum.AS,
    )
    db_session.commit()
    response = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": "조립",
            "bundles": _internal_use_bundles(item, to_department="조립"),
        },
    )
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("warehouse_role", ["primary", "deputy"])
def test_internal_use_warehouse_manager_roles_can_preview_and_submit(
    client, db_session, make_item, warehouse_role
):
    item = make_item(name=f"창고 {warehouse_role} 반출품", warehouse_qty=Decimal("5"))
    requester = _make_employee(
        db_session,
        code=f"IU-{warehouse_role}",
        warehouse_role=warehouse_role,
    )
    db_session.commit()
    preview = _preview_internal_use(client, requester, item, to_department="연구")
    assert preview.status_code == 200, preview.text
    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": "연구",
            "bundles": preview.json()["bundles"],
        },
    )
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["status"] == "completed"
    assert submitted.json()["requires_approval"] is True

    request = db_session.query(StockRequest).one()
    assert request.request_type == StockRequestTypeEnum.INTERNAL_USE
    assert request.status == StockRequestStatusEnum.COMPLETED


def test_internal_use_submit_reserves_then_approval_consumes_only_warehouse(
    client, db_session, make_item
):
    item = make_item(name="사내 사용품", warehouse_qty=Decimal("10"))
    requester = _make_employee(
        db_session,
        code="IU-AS",
        department=DepartmentEnum.AS,
    )
    db_session.commit()

    preview = _preview_internal_use(client, requester, item)
    assert preview.status_code == 200, preview.text
    assert preview.json()["requires_approval"] is True
    line = preview.json()["bundles"][0]["lines"][0]
    assert (
        line["direction"],
        line["from_bucket"],
        line["from_department"],
        line["to_bucket"],
        line["to_department"],
    ) == ("out", "warehouse", None, "none", "AS")

    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": "AS",
            "bundles": preview.json()["bundles"],
        },
    )
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["status"] == "reserved"
    assert submitted.json()["requires_approval"] is True

    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert inv.warehouse_qty == Decimal("10")
    assert inv.quantity == Decimal("10")
    assert inv.pending_quantity == Decimal("3")
    assert db_session.query(TransactionLog).count() == 0

    request = db_session.query(StockRequest).one()
    assert request.request_type == StockRequestTypeEnum.INTERNAL_USE
    assert request.status == StockRequestStatusEnum.RESERVED
    assert request.requires_warehouse_approval is True
    assert request.operation_batch_id is not None
    assert request.lines[0].from_bucket.value == "warehouse"
    assert request.lines[0].from_department is None
    assert request.lines[0].to_bucket.value == "none"
    assert request.lines[0].to_department == "AS"

    approver = _make_employee(
        db_session,
        code="IU-WH-APPROVER",
        name="Warehouse Approver",
        warehouse_role="primary",
    )
    db_session.commit()
    approved = _approve_stock_request(client, request.request_id, approver)
    assert approved.status_code == 200, approved.text

    db_session.expire_all()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert inv.warehouse_qty == Decimal("7")
    assert inv.quantity == Decimal("7")
    assert inv.pending_quantity == Decimal("0")
    assert (
        db_session.query(InventoryLocation)
        .filter(InventoryLocation.item_id == item.item_id)
        .count()
        == 0
    )
    log = db_session.query(TransactionLog).one()
    assert log.transaction_type == TransactionTypeEnum.INTERNAL_USE
    assert log.department == "AS"
    assert log.produced_by == requester.name
    assert log.producer_employee_id == requester.employee_id
    assert log.warehouse_qty_before == Decimal("10")
    assert log.warehouse_qty_after == Decimal("7")
    assert log.inventory_effect == [{"scope": "warehouse", "delta": -3}]


def test_internal_use_bom_preview_round_trips_mode_source_and_component_selection(
    client, db_session, make_item, make_bom
):
    parent = make_item(name="연구 사용 조립품", process_type_code="AF", warehouse_qty=Decimal("5"))
    child = make_item(name="연구 사용 하위품", process_type_code="HF", warehouse_qty=Decimal("10"))
    make_bom(parent.item_id, child.item_id, Decimal("2"))
    requester = _make_employee(db_session, code="IU-BOM-PREVIEW", department=DepartmentEnum.RESEARCH)
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": "연구",
            "targets": [
                {
                    "source_kind": "direct_item",
                    "source_location": "warehouse",
                    "item_id": str(parent.item_id),
                    "quantity": 1,
                    "internal_use_bom_mode": "parent_and_children",
                    "component_selections": [
                        {"item_id": str(child.item_id), "selected": False}
                    ],
                }
            ],
        },
    )

    assert preview.status_code == 200, preview.text
    bundle = preview.json()["bundles"][0]
    assert bundle["internal_use_bom_mode"] == "parent_and_children"
    assert bundle["source_location"] == "warehouse"
    returned = next(line for line in bundle["lines"] if line["item_id"] == str(child.item_id))
    assert returned["selected"] is False
    assert (returned["direction"], returned["from_bucket"], returned["to_bucket"]) == (
        "in",
        "none",
        "production",
    )


def test_internal_use_bom_preview_ignores_legacy_zero_for_unselected_no_change_child(
    client, db_session, make_item, make_bom
):
    parent = make_item(name="변동 없음 조립품", process_type_code="AF")
    child = make_item(name="변동 없음 하위품", process_type_code="AR")
    make_bom(parent.item_id, child.item_id, Decimal("2"))
    requester = _make_employee(
        db_session, code="IU-BOM-ZERO", department=DepartmentEnum.RESEARCH
    )
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": "연구",
            "targets": [
                {
                    "source_kind": "direct_item",
                    "item_id": str(parent.item_id),
                    "quantity": 1,
                    "internal_use_bom_mode": "children_only",
                    "component_selections": [
                        {"item_id": str(child.item_id), "quantity": 0, "selected": False}
                    ],
                }
            ],
        },
    )

    assert preview.status_code == 200, preview.text
    child_line = preview.json()["bundles"][0]["lines"][0]
    assert child_line["quantity"] == 0
    assert child_line["selected"] is False
    assert child_line["included"] is False


def test_internal_use_bom_draft_without_mode_keeps_unselected_child_as_no_change(
    client, db_session, make_item, make_bom
):
    parent = make_item(name="방식 미선택 조립품", warehouse_qty=Decimal("5"))
    child = make_item(name="방식 미선택 하위품", warehouse_qty=Decimal("10"))
    make_bom(parent.item_id, child.item_id, Decimal("2"))
    requester = _make_employee(
        db_session, code="IU-BOM-NO-MODE", department=DepartmentEnum.RESEARCH
    )
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "source_location": "warehouse",
                    "item_id": str(parent.item_id),
                    "quantity": 2,
                    "component_selections": [
                        {"item_id": str(child.item_id), "selected": False}
                    ],
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.text
    bundle = preview.json()["bundles"][0]
    child_line = bundle["lines"][0]
    assert bundle["internal_use_bom_mode"] is None
    assert child_line["quantity"] == 0
    assert child_line["included"] is False
    assert child_line["exclusion_note"] == "변동 없음"

    drafted = client.put(
        "/api/io/draft",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "bundles": [bundle],
        },
    )
    assert drafted.status_code == 200, drafted.text


def test_internal_use_bom_selection_openapi_has_no_quantity_field(client):
    schema = client.get("/openapi.json").json()
    component_selection = schema["components"]["schemas"]["IoComponentSelection"]

    assert component_selection["properties"] == {
        "item_id": {"type": "string", "format": "uuid", "title": "Item Id"},
        "selected": {"type": "boolean", "default": True, "title": "Selected"},
    }
    assert component_selection["required"] == ["item_id"]


def test_internal_use_bom_draft_allows_unselected_mode_but_fresh_submit_rejects_it(
    client, db_session, make_item, make_bom
):
    parent = make_item(name="모드 미선택 조립품", process_type_code="AF", warehouse_qty=Decimal("5"))
    child = make_item(name="모드 미선택 하위품", process_type_code="AR", warehouse_qty=Decimal("10"))
    make_bom(parent.item_id, child.item_id, Decimal("1"))
    requester = _make_employee(db_session, code="IU-BOM-DRAFT", department=DepartmentEnum.AS)
    db_session.commit()

    preview = _preview_internal_use(client, requester, parent)
    assert preview.status_code == 200, preview.text
    bundles = preview.json()["bundles"]
    assert bundles[0]["internal_use_bom_mode"] is None

    payload = {
        "requester_employee_id": str(requester.employee_id),
        "work_type": "internal_use",
        "sub_type": "internal_use_out",
        "to_department": "AS",
        "bundles": bundles,
    }
    saved = client.put("/api/io/draft", json=payload)
    assert saved.status_code == 200, saved.text
    assert saved.json()["bundles"][0]["internal_use_bom_mode"] is None

    submitted = client.post("/api/io/submit", json=payload)
    assert submitted.status_code == 422, submitted.text
    assert "차감 방식" in submitted.text


def test_internal_use_stock_exempt_bom_child_can_be_drafted_and_submitted(
    client, db_session, make_item, make_bom
):
    parent = make_item(
        name="재고 미반영 하위가 있는 조립품",
        process_type_code="AF",
        warehouse_qty=Decimal("5"),
    )
    child = make_item(
        name="재고 미반영 하위품",
        process_type_code="AR",
        warehouse_qty=Decimal("10"),
    )
    child.bom_stock_exempt = True
    make_bom(parent.item_id, child.item_id, Decimal("1"))
    requester = _make_employee(
        db_session,
        code="IU-BOM-STOCK-EXEMPT",
        department=DepartmentEnum.RESEARCH,
    )
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "source_location": "warehouse",
                    "item_id": str(parent.item_id),
                    "quantity": 1,
                    "internal_use_bom_mode": "parent_and_children",
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.text
    bundle = preview.json()["bundles"][0]
    exempt_line = next(
        line for line in bundle["lines"] if line["item_id"] == str(child.item_id)
    )
    assert exempt_line["bom_stock_exempt"] is True
    assert exempt_line["included"] is False
    assert exempt_line["selected"] is False

    drafted = client.put(
        "/api/io/draft",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "bundles": [bundle],
        },
    )
    assert drafted.status_code == 200, drafted.text

    submitted = client.post(
        f"/api/io/draft/{drafted.json()['batch_id']}/submit",
        params={"requester_employee_id": str(requester.employee_id)},
    )
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["status"] == "reserved"


def test_internal_use_parent_and_children_splits_outbound_and_return_approvals(
    client, db_session, make_item, make_bom, make_location
):
    parent = make_item(
        name="승인 분리 조립품",
        process_type_code="AF",
        warehouse_qty=Decimal("5"),
    )
    child = make_item(name="승인 분리 하위품", process_type_code="HF")
    make_bom(parent.item_id, child.item_id, Decimal("1"))
    child_location = make_location(
        child.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        quantity=Decimal("1"),
    )
    requester = _make_employee(
        db_session,
        code="IU-BOM-SPLIT",
        department=DepartmentEnum.RESEARCH,
    )
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "source_location": "warehouse",
                    "item_id": str(parent.item_id),
                    "quantity": 1,
                    "internal_use_bom_mode": "parent_and_children",
                    "component_selections": [
                        {
                            "item_id": str(child.item_id),
                            "quantity": 1,
                            "selected": False,
                        }
                    ],
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.text

    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "bundles": preview.json()["bundles"],
        },
    )

    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["status"] == "reserved"
    requests = db_session.query(StockRequest).order_by(StockRequest.created_at).all()
    assert len(requests) == 2
    outbound = next(
        request
        for request in requests
        if request.request_type == StockRequestTypeEnum.INTERNAL_USE
    )
    returned = next(
        request
        for request in requests
        if request.request_type == StockRequestTypeEnum.MANUAL_ADJUSTMENT
    )
    assert outbound.status == StockRequestStatusEnum.RESERVED
    assert returned.status == StockRequestStatusEnum.SUBMITTED
    assert returned.requester_department == DepartmentEnum.RESEARCH.value
    assert returned.approval_department == DepartmentEnum.HIGH_VOLTAGE.value
    assert returned.requires_department_approval is True

    parent_inventory = (
        db_session.query(Inventory).filter(Inventory.item_id == parent.item_id).one()
    )
    assert parent_inventory.warehouse_qty == Decimal("5")
    assert parent_inventory.pending_quantity == Decimal("1")
    db_session.refresh(child_location)
    assert child_location.quantity == Decimal("1")

    warehouse_approver = _make_employee(
        db_session,
        code="IU-BOM-WH-APP",
        warehouse_role="primary",
    )
    department_approver = _make_employee(
        db_session,
        code="IU-BOM-DEPT-APP",
        department=DepartmentEnum.HIGH_VOLTAGE,
        department_role="primary",
    )
    db_session.commit()

    approved_outbound = _approve_stock_request(
        client, outbound.request_id, warehouse_approver
    )
    assert approved_outbound.status_code == 200, approved_outbound.text
    db_session.expire_all()
    batch = db_session.query(IoBatch).one()
    assert batch.status == "partially_completed"
    parent_inventory = (
        db_session.query(Inventory).filter(Inventory.item_id == parent.item_id).one()
    )
    assert parent_inventory.warehouse_qty == Decimal("4")
    child_location = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == child.item_id,
            InventoryLocation.department == DepartmentEnum.HIGH_VOLTAGE,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .one()
    )
    assert child_location.quantity == Decimal("1")

    approved_return = _approve_department_request(
        client, returned.request_id, department_approver
    )
    assert approved_return.status_code == 200, approved_return.text
    db_session.expire_all()
    batch = db_session.query(IoBatch).one()
    assert batch.status == "completed"
    child_location = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == child.item_id,
            InventoryLocation.department == DepartmentEnum.HIGH_VOLTAGE,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .one()
    )
    assert child_location.quantity == Decimal("2")


def test_internal_use_rejects_bom_mode_changed_after_preview(
    client, db_session, make_item, make_bom
):
    parent = make_item(
        name="모드 변조 상위품",
        process_type_code="AF",
        warehouse_qty=Decimal("5"),
    )
    child = make_item(
        name="모드 변조 하위품",
        process_type_code="HF",
        warehouse_qty=Decimal("5"),
    )
    make_bom(parent.item_id, child.item_id, Decimal("1"))
    requester = _make_employee(
        db_session,
        code="IU-BOM-MODE-TAMPER",
        department=DepartmentEnum.RESEARCH,
    )
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "source_location": "warehouse",
                    "item_id": str(parent.item_id),
                    "quantity": 1,
                    "internal_use_bom_mode": "children_only",
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.text
    bundles = preview.json()["bundles"]
    bundles[0]["internal_use_bom_mode"] = "parent_and_children"

    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "bundles": bundles,
        },
    )

    assert submitted.status_code == 422, submitted.text
    assert "BOM" in submitted.text
    assert db_session.query(StockRequest).count() == 0


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("quantity", 7),
        ("bom_expected", 7),
        ("included", False),
        ("to_bucket", "warehouse"),
    ],
)
def test_internal_use_bom_draft_rejects_tampered_child_state(
    client, db_session, make_item, make_bom, field, value
):
    parent = make_item(name="하위 상태 변조 상위품", warehouse_qty=Decimal("5"))
    child = make_item(name="하위 상태 변조 하위품", warehouse_qty=Decimal("10"))
    make_bom(parent.item_id, child.item_id, Decimal("2"))
    requester = _make_employee(
        db_session,
        code=f"IU-BOM-TAMPER-{field}",
        department=DepartmentEnum.RESEARCH,
    )
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "source_location": "warehouse",
                    "item_id": str(parent.item_id),
                    "quantity": 2,
                    "internal_use_bom_mode": "children_only",
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.text
    bundles = preview.json()["bundles"]
    child_line = next(line for line in bundles[0]["lines"] if line["origin"] == "bom_auto")
    child_line[field] = value

    drafted = client.put(
        "/api/io/draft",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "bundles": bundles,
        },
    )

    assert drafted.status_code == 422, drafted.text
    assert db_session.query(IoBatch).count() == 0


@pytest.mark.parametrize("change", ["parent_line", "bundle_and_children"])
def test_internal_use_bom_draft_rejects_parent_quantity_inconsistent_with_bundle(
    client, db_session, make_item, make_bom, change
):
    parent = make_item(name="상위 수량 변조 조립품", warehouse_qty=Decimal("10"))
    child = make_item(name="상위 수량 변조 하위품", warehouse_qty=Decimal("10"))
    make_bom(parent.item_id, child.item_id, Decimal("2"))
    requester = _make_employee(
        db_session,
        code=f"IU-BOM-PARENT-QTY-{change}",
        department=DepartmentEnum.RESEARCH,
    )
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "source_location": "warehouse",
                    "item_id": str(parent.item_id),
                    "quantity": 2,
                    "internal_use_bom_mode": "parent_and_children",
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.text
    bundles = preview.json()["bundles"]
    bundle = bundles[0]
    parent_line = next(line for line in bundle["lines"] if line["origin"] == "direct")
    child_line = next(line for line in bundle["lines"] if line["origin"] == "bom_auto")
    if change == "parent_line":
        parent_line["quantity"] = 3
    else:
        bundle["quantity"] = 3
        child_line["quantity"] = 6
        child_line["bom_expected"] = 6

    drafted = client.put(
        "/api/io/draft",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "bundles": bundles,
        },
    )

    assert drafted.status_code == 422, drafted.text
    assert db_session.query(IoBatch).count() == 0


def test_internal_use_submit_rejects_tampered_child_quantity_without_creating_batch(
    client, db_session, make_item, make_bom
):
    parent = make_item(name="제출 하위 수량 변조 조립품", warehouse_qty=Decimal("5"))
    child = make_item(name="제출 하위 수량 변조 하위품", warehouse_qty=Decimal("10"))
    make_bom(parent.item_id, child.item_id, Decimal("2"))
    requester = _make_employee(
        db_session,
        code="IU-BOM-SUBMIT-CHILD-QTY",
        department=DepartmentEnum.RESEARCH,
    )
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "item_id": str(parent.item_id),
                    "quantity": 2,
                    "internal_use_bom_mode": "children_only",
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.text
    bundles = preview.json()["bundles"]
    bundles[0]["lines"][0]["quantity"] = 7

    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "bundles": bundles,
        },
    )

    assert submitted.status_code == 422, submitted.text
    assert db_session.query(IoBatch).count() == 0
    assert db_session.query(StockRequest).count() == 0


def test_internal_use_rejected_return_stays_unapplied_and_batch_is_partial(
    client, db_session, make_item, make_bom, make_location
):
    parent = make_item(
        name="재입고 반려 상위품",
        process_type_code="AF",
        warehouse_qty=Decimal("3"),
    )
    child = make_item(name="재입고 반려 하위품", process_type_code="HF")
    make_bom(parent.item_id, child.item_id, Decimal("1"))
    make_location(
        child.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        quantity=Decimal("1"),
    )
    requester = _make_employee(
        db_session,
        code="IU-BOM-RETURN-REJECT",
        department=DepartmentEnum.RESEARCH,
    )
    warehouse_approver = _make_employee(
        db_session,
        code="IU-BOM-RETURN-WH",
        warehouse_role="primary",
    )
    department_approver = _make_employee(
        db_session,
        code="IU-BOM-RETURN-DEPT",
        department=DepartmentEnum.HIGH_VOLTAGE,
        department_role="deputy",
    )
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "source_location": "warehouse",
                    "item_id": str(parent.item_id),
                    "quantity": 1,
                    "internal_use_bom_mode": "parent_and_children",
                    "component_selections": [
                        {
                            "item_id": str(child.item_id),
                            "quantity": 1,
                            "selected": False,
                        }
                    ],
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.text
    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "bundles": preview.json()["bundles"],
        },
    )
    assert submitted.status_code == 201, submitted.text
    requests = db_session.query(StockRequest).all()
    outbound = next(
        request
        for request in requests
        if request.request_type == StockRequestTypeEnum.INTERNAL_USE
    )
    returned = next(
        request
        for request in requests
        if request.request_type == StockRequestTypeEnum.MANUAL_ADJUSTMENT
    )

    approved = _approve_stock_request(client, outbound.request_id, warehouse_approver)
    assert approved.status_code == 200, approved.text
    rejected = _reject_department_request(
        client, returned.request_id, department_approver
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == StockRequestStatusEnum.REJECTED.value

    db_session.expire_all()
    batch = db_session.query(IoBatch).one()
    assert batch.status == "partially_completed"
    location = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == child.item_id,
            InventoryLocation.department == DepartmentEnum.HIGH_VOLTAGE,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .one()
    )
    assert location.quantity == Decimal("1")
    assert db_session.query(TransactionLog).count() == 1


def test_internal_use_children_only_consumes_selected_children_without_parent_change(
    client, db_session, make_item, make_bom
):
    parent = make_item(
        name="하위만 상위품",
        process_type_code="AF",
        warehouse_qty=Decimal("5"),
    )
    selected_child = make_item(
        name="선택 하위품",
        process_type_code="HF",
        warehouse_qty=Decimal("5"),
    )
    unselected_child = make_item(
        name="해제 하위품",
        process_type_code="VF",
        warehouse_qty=Decimal("5"),
    )
    make_bom(parent.item_id, selected_child.item_id, Decimal("1"))
    make_bom(parent.item_id, unselected_child.item_id, Decimal("1"))
    requester = _make_employee(
        db_session,
        code="IU-BOM-CHILDREN-ONLY",
        department=DepartmentEnum.RESEARCH,
    )
    approver = _make_employee(
        db_session,
        code="IU-BOM-CHILDREN-WH",
        warehouse_role="primary",
    )
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "source_location": "warehouse",
                    "item_id": str(parent.item_id),
                    "quantity": 1,
                    "internal_use_bom_mode": "children_only",
                    "component_selections": [
                        {
                            "item_id": str(selected_child.item_id),
                            "quantity": 1,
                            "selected": True,
                        },
                        {
                            "item_id": str(unselected_child.item_id),
                            "quantity": 1,
                            "selected": False,
                        },
                    ],
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.text
    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": DepartmentEnum.RESEARCH.value,
            "bundles": preview.json()["bundles"],
        },
    )
    assert submitted.status_code == 201, submitted.text
    request = db_session.query(StockRequest).one()
    assert [line.item_id for line in request.lines] == [selected_child.item_id]

    approved = _approve_stock_request(client, request.request_id, approver)
    assert approved.status_code == 200, approved.text
    db_session.expire_all()
    quantities = {
        inventory.item_id: inventory.warehouse_qty
        for inventory in db_session.query(Inventory)
        .filter(
            Inventory.item_id.in_(
                [parent.item_id, selected_child.item_id, unselected_child.item_id]
            )
        )
        .all()
    }
    assert quantities == {
        parent.item_id: Decimal("5"),
        selected_child.item_id: Decimal("4"),
        unselected_child.item_id: Decimal("5"),
    }
    assert db_session.query(IoBatch).one().status == "completed"


def test_internal_use_rejects_unauthorized_requester_and_tampered_line(
    client, db_session, make_item
):
    item = make_item(name="권한 검증품", warehouse_qty=Decimal("10"))
    unauthorized = _make_employee(db_session, code="IU-NO")
    manager = _make_employee(
        db_session,
        code="IU-WH",
        warehouse_role="primary",
    )
    db_session.commit()

    denied = _preview_internal_use(client, unauthorized, item)
    assert denied.status_code == 403, denied.text

    preview = _preview_internal_use(client, manager, item, to_department="연구")
    assert preview.status_code == 200, preview.text
    bundles = preview.json()["bundles"]
    bundles[0]["lines"][0]["from_department"] = "조립"
    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(manager.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": "연구",
            "bundles": bundles,
        },
    )
    assert submitted.status_code == 422, submitted.text
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert inv.warehouse_qty == Decimal("10")


def test_internal_use_manual_origin_still_requires_warehouse_approval(
    client, db_session, make_item
):
    item = make_item(name="수동 선택 사용품", warehouse_qty=Decimal("5"))
    requester = _make_employee(
        db_session,
        code="IU-MANUAL",
        department=DepartmentEnum.AS,
    )
    db_session.commit()
    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": "AS",
            "targets": [
                {"source_kind": "manual", "item_id": str(item.item_id), "quantity": 2}
            ],
        },
    )
    assert preview.status_code == 200, preview.text

    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": "AS",
            "bundles": preview.json()["bundles"],
        },
    )
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["status"] == "reserved"
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert inv.warehouse_qty == Decimal("5")
    assert inv.pending_quantity == Decimal("2")


def test_internal_use_saved_draft_rechecks_permission_at_submit(
    client, db_session, make_item
):
    item = make_item(name="임시 저장품", warehouse_qty=Decimal("10"))
    requester = _make_employee(
        db_session,
        code="IU-DRAFT",
        department=DepartmentEnum.RESEARCH,
    )
    db_session.commit()
    preview = _preview_internal_use(client, requester, item, to_department="연구")
    assert preview.status_code == 200, preview.text
    saved = client.put(
        "/api/io/draft",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": "연구",
            "bundles": preview.json()["bundles"],
        },
    )
    assert saved.status_code == 200, saved.text

    requester.department = DepartmentEnum.ASSEMBLY.value
    db_session.commit()
    submitted = client.post(
        f"/api/io/draft/{saved.json()['batch_id']}/submit",
        params={"requester_employee_id": str(requester.employee_id)},
    )
    assert submitted.status_code == 403, submitted.text


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


def test_io_submit_shortage_message_includes_contributing_parents(
    client, db_session, make_item, make_bom
):
    """회귀: 같은 자식 부품이 여러 BOM 부모에 등록돼 합산 시 재고 초과될 때,
    에러 메시지에 어느 부모가 얼마씩 기여했는지(상위 3개) 표시되는지 검증.
    개선 전: '재고 부족: X / 가능 52 / 요청 64' — 사용자가 어디서 줄여야 할지 모름."""
    shared_child = make_item(name="공통자식", warehouse_qty=Decimal("3"))
    parent_a = make_item(name="부모A", warehouse_qty=Decimal("0"))
    parent_b = make_item(name="부모B", warehouse_qty=Decimal("0"))
    make_bom(parent_a.item_id, shared_child.item_id, Decimal("2"))
    make_bom(parent_b.item_id, shared_child.item_id, Decimal("2"))
    requester = _make_employee(db_session, warehouse_role="primary")
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_io",
            "sub_type": "warehouse_to_dept",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "targets": [
                {"source_kind": "direct_item", "item_id": str(parent_a.item_id), "quantity": "1"},
                {"source_kind": "direct_item", "item_id": str(parent_b.item_id), "quantity": "1"},
            ],
        },
    )
    assert preview.status_code == 200, preview.json()
    # 각 부모 BOM 자식 2 + 2 = 4 요청, 재고 3 → 부족 1
    res = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_io",
            "sub_type": "warehouse_to_dept",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "bundles": preview.json()["bundles"],
        },
    )
    assert res.status_code == 422, res.json()
    detail = res.json().get("detail")
    detail_text = detail if isinstance(detail, str) else str(detail)
    assert "재고 부족" in detail_text
    assert "공통자식" in detail_text
    # 핵심: 합산에 기여한 부모 이름과 양이 표시돼야 함
    assert "부모A" in detail_text, f"contributor breakdown missing: {detail_text}"
    assert "부모B" in detail_text, f"contributor breakdown missing: {detail_text}"


def test_io_submit_warehouse_to_dept_links_all_logs_to_batch(
    client, db_session, make_item, make_bom
):
    """회귀: autoflush=False 환경에서 _link_stock_request 의 UPDATE 가
    마지막 라인의 TransactionLog 를 놓쳐 NULL 로 남던 버그(입출고 내역에서
    BOM 묶음의 마지막 자식이 solo row 로 분리되어 보이던 현상)."""
    parent = make_item(name="BomParent", warehouse_qty=Decimal("0"))
    # 마지막 라인까지 batch_id 가 박히는지 확인하려면 라인 ≥ 2 필요. 3개로 여유.
    children = [
        make_item(name=f"BomChild{i}", warehouse_qty=Decimal("100")) for i in range(3)
    ]
    for child in children:
        make_bom(parent.item_id, child.item_id, Decimal("1"))
    # 자가승인 가능한 창고 정 — 즉시 실행 경로(_execute_all_lines) 진입.
    requester = _make_employee(db_session, warehouse_role="primary")
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

    res = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_io",
            "sub_type": "warehouse_to_dept",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "bundles": preview.json()["bundles"],
        },
    )
    assert res.status_code == 201, res.json()
    assert res.json()["status"] == "completed"

    batch = db_session.query(IoBatch).one()
    logs = db_session.query(TransactionLog).all()
    assert len(logs) == len(children), f"expected {len(children)} logs, got {len(logs)}"
    # 핵심: 모든 로그가 batch.batch_id 로 묶여 있어야 함 (마지막 라인 포함).
    assert all(log.operation_batch_id == batch.batch_id for log in logs), (
        f"orphan logs found: "
        f"{[(str(l.item_id)[:8], l.operation_batch_id) for l in logs]}"
    )


def test_io_submit_draft_endpoint_replays_without_duplicate_effects(
    client, db_session, make_item, monkeypatch
):
    from app.routers import io as io_router

    item = make_item(name="Raw Draft", warehouse_qty=Decimal("0"))
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
                    "quantity": "7",
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.json()

    draft_res = client.put(
        "/api/io/draft",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "receive",
            "sub_type": "receive_supplier",
            "bundles": preview.json()["bundles"],
        },
    )
    assert draft_res.status_code == 200, draft_res.json()
    batch_id = draft_res.json()["batch_id"]

    drafts_before = client.get(
        f"/api/io/drafts?requester_employee_id={requester.employee_id}",
    )
    assert any(d["batch_id"] == batch_id for d in drafts_before.json())

    emitted_events: list[str] = []
    monkeypatch.setattr(
        io_router,
        "_evt_emit",
        lambda event, **_kwargs: emitted_events.append(event),
    )

    submit_res = client.post(
        f"/api/io/draft/{batch_id}/submit"
        f"?requester_employee_id={requester.employee_id}",
    )
    physical_counts_after_first = (
        db_session.query(TransactionLog).count(),
        db_session.query(InventoryOperation).count(),
        db_session.query(StockRequest).count(),
    )
    replay_res = client.post(
        f"/api/io/draft/{batch_id}/submit"
        f"?requester_employee_id={requester.employee_id}",
    )
    assert submit_res.status_code == 201, submit_res.json()
    assert replay_res.status_code == 201, replay_res.json()
    assert submit_res.json()["status"] == "completed"
    assert replay_res.json() == submit_res.json()

    detail = client.get(f"/api/io/{batch_id}")
    assert detail.status_code == 200
    assert detail.json()["status"] == "completed"

    drafts_after = client.get(
        f"/api/io/drafts?requester_employee_id={requester.employee_id}",
    )
    assert all(d["batch_id"] != batch_id for d in drafts_after.json())

    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.warehouse_qty == Decimal("7")
    assert db_session.query(IoBatch).count() == 1
    assert physical_counts_after_first[0] == 1
    assert physical_counts_after_first[1] <= 1
    assert physical_counts_after_first[2] == 0
    assert (
        db_session.query(TransactionLog).count(),
        db_session.query(InventoryOperation).count(),
        db_session.query(StockRequest).count(),
    ) == physical_counts_after_first
    assert emitted_events == ["io_submit"]
    assert (
        db_session.query(ActivityAuditLog)
        .filter(ActivityAuditLog.action_key == "http.post.io.draft.id.submit")
        .count()
        == 1
    )


def test_io_submit_draft_replay_fails_closed_for_actor_content_and_legacy_state(
    client, db_session, make_item
):
    item = make_item(name="Scoped Draft", warehouse_qty=Decimal("0"))
    requester = _make_employee(db_session, code="IO-DRAFT-SCOPE-1")
    other = _make_employee(db_session, code="IO-DRAFT-SCOPE-2")
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
                    "quantity": "2",
                }
            ],
        },
    )
    draft = client.put(
        "/api/io/draft",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "receive",
            "sub_type": "receive_supplier",
            "notes": "original",
            "bundles": preview.json()["bundles"],
        },
    )
    batch_id = draft.json()["batch_id"]
    route = f"/api/io/draft/{batch_id}/submit"
    first = client.post(
        route,
        params={"requester_employee_id": str(requester.employee_id)},
    )
    assert first.status_code == 201, first.json()
    physical_counts = (
        db_session.query(TransactionLog).count(),
        db_session.query(InventoryOperation).count(),
    )

    other_actor = client.post(
        route,
        params={"requester_employee_id": str(other.employee_id)},
        headers={"X-Actor-Employee-Id": str(other.employee_id)},
    )
    assert other_actor.status_code == 403, other_actor.json()

    batch = db_session.query(IoBatch).filter(IoBatch.batch_id == batch_id).one()
    batch.notes = "changed after submit"
    db_session.commit()
    changed = client.post(
        route,
        params={"requester_employee_id": str(requester.employee_id)},
    )
    assert changed.status_code == 409, changed.json()
    assert changed.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert changed.json()["detail"]["extra"]["reason"] == "fingerprint_mismatch"

    batch.notes = "original"
    batch.request_fingerprint = None
    db_session.commit()
    legacy = client.post(
        route,
        params={"requester_employee_id": str(requester.employee_id)},
    )
    assert legacy.status_code == 409, legacy.json()
    assert legacy.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert legacy.json()["detail"]["extra"]["reason"] == "legacy_fingerprint_missing"
    assert (
        db_session.query(TransactionLog).count(),
        db_session.query(InventoryOperation).count(),
    ) == physical_counts
    db_session.expire_all()
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert inventory.warehouse_qty == Decimal("2")


def test_io_draft_recomputes_department_shortage_with_pending(
    client, db_session, make_item, make_location
):
    item = make_item(name="Draft production pending")
    location = make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        quantity=Decimal("10"),
    )
    requester = _make_employee(db_session, code="IO-DRAFT-PEND")
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_io",
            "sub_type": "dept_to_warehouse",
            "from_department": DepartmentEnum.ASSEMBLY.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "item_id": str(item.item_id),
                    "quantity": "8",
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.json()
    assert preview.json()["bundles"][0]["lines"][0]["shortage"] == 0

    saved = client.put(
        "/api/io/draft",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_io",
            "sub_type": "dept_to_warehouse",
            "from_department": DepartmentEnum.ASSEMBLY.value,
            "bundles": preview.json()["bundles"],
        },
    )
    assert saved.status_code == 200, saved.json()

    location.pending_quantity = Decimal("3")
    db_session.commit()
    fetched = client.get(
        "/api/io/draft",
        params={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_io",
            "sub_type": "dept_to_warehouse",
        },
    )

    assert fetched.status_code == 200, fetched.json()
    assert fetched.json()["bundles"][0]["lines"][0]["shortage"] == 1


def test_io_submit_idempotent_with_client_request_id(client, db_session, make_item):
    """같은 client_request_id로 두 번 submit 시 같은 batch 멱등 반환, 재고 한 번만 차감."""
    item = make_item(name="Idem Raw", warehouse_qty=Decimal("0"))
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
                    "quantity": "4",
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.json()

    payload = {
        "requester_employee_id": str(requester.employee_id),
        "work_type": "receive",
        "sub_type": "receive_supplier",
        "client_request_id": "test-idem-key-001",
        "bundles": preview.json()["bundles"],
    }

    first = client.post("/api/io/submit", json=payload)
    assert first.status_code == 201, first.json()
    first_batch_id = first.json()["batch"]["batch_id"]

    # 같은 키로 재제출 (더블클릭 / 네트워크 retry 시나리오)
    second = client.post("/api/io/submit", json=payload)
    assert second.status_code == 201, second.json()
    assert second.json()["batch"]["batch_id"] == first_batch_id
    assert second.json() == first.json()

    # batch가 1건만 존재하고 재고도 4 한 번만 증가
    assert db_session.query(IoBatch).count() == 1
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.warehouse_qty == Decimal("4")
    assert (
        db_session.query(ActivityAuditLog)
        .filter(ActivityAuditLog.action_key == "http.post.io.submit")
        .count()
        == 1
    )


def test_io_submit_idempotent_replay_preserves_approval_response(
    client, db_session, make_item
):
    item = make_item(name="Idem approval raw", warehouse_qty=Decimal("10"))
    requester = _make_employee(
        db_session,
        code="IO-IDEM-APPROVAL",
        department=DepartmentEnum.AS,
    )
    db_session.commit()
    preview = _preview_internal_use(client, requester, item)
    assert preview.status_code == 200, preview.json()
    payload = {
        "requester_employee_id": str(requester.employee_id),
        "work_type": "internal_use",
        "sub_type": "internal_use_out",
        "to_department": "AS",
        "client_request_id": "test-idem-key-approval",
        "bundles": preview.json()["bundles"],
    }

    first = client.post("/api/io/submit", json=payload)
    second = client.post("/api/io/submit", json=payload)

    assert first.status_code == 201, first.json()
    assert second.status_code == 201, second.json()
    assert second.json() == first.json()
    assert first.json()["status"] == "reserved"
    assert len(first.json()["stock_requests"]) == 1
    assert first.json()["batch"]["stock_requests"] == first.json()["stock_requests"]
    assert db_session.query(IoBatch).count() == 1
    assert db_session.query(StockRequest).count() == 1
    db_session.expire_all()
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert inventory.warehouse_qty == Decimal("10")
    assert inventory.pending_quantity == Decimal("3")


def test_io_submit_same_key_changed_payload_conflicts_without_mutation(
    client, db_session, make_item
):
    item = make_item(name="Semantic Idem Raw", warehouse_qty=Decimal("0"))
    requester = _make_employee(db_session, code="IO-IDEM-CHANGED")
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
                    "quantity": "4",
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.json()
    payload = {
        "requester_employee_id": str(requester.employee_id),
        "work_type": "receive",
        "sub_type": "receive_supplier",
        "client_request_id": "test-idem-key-changed",
        "bundles": preview.json()["bundles"],
    }
    first = client.post("/api/io/submit", json=payload)
    assert first.status_code == 201, first.json()
    logs_before = db_session.query(TransactionLog).count()

    changed = {**payload, "notes": "different inventory command"}
    changed["bundles"] = [dict(bundle) for bundle in payload["bundles"]]
    changed["bundles"][0]["quantity"] = 5
    changed["bundles"][0]["lines"] = [
        {**line, "quantity": 5} for line in payload["bundles"][0]["lines"]
    ]
    conflict = client.post("/api/io/submit", json=changed)

    assert conflict.status_code == 409, conflict.json()
    assert conflict.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert conflict.json()["detail"]["extra"]["reason"] == "fingerprint_mismatch"
    assert db_session.query(IoBatch).count() == 1
    assert db_session.query(TransactionLog).count() == logs_before
    db_session.expire_all()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert inv.warehouse_qty == Decimal("4")


def test_io_submit_legacy_null_fingerprint_conflicts_without_mutation(
    client, db_session, make_item
):
    item = make_item(name="Legacy Idem Raw", warehouse_qty=Decimal("0"))
    requester = _make_employee(db_session, code="IO-IDEM-LEGACY")
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
                    "quantity": "2",
                }
            ],
        },
    )
    payload = {
        "requester_employee_id": str(requester.employee_id),
        "work_type": "receive",
        "sub_type": "receive_supplier",
        "client_request_id": "test-idem-key-legacy-null",
        "bundles": preview.json()["bundles"],
    }
    first = client.post("/api/io/submit", json=payload)
    assert first.status_code == 201, first.json()
    batch = db_session.query(IoBatch).one()
    batch.request_fingerprint = None
    db_session.commit()
    logs_before = db_session.query(TransactionLog).count()

    conflict = client.post("/api/io/submit", json=payload)

    assert conflict.status_code == 409, conflict.json()
    assert conflict.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert conflict.json()["detail"]["extra"]["reason"] == "legacy_fingerprint_missing"
    assert db_session.query(IoBatch).count() == 1
    assert db_session.query(TransactionLog).count() == logs_before


def test_io_submit_same_key_other_actor_and_route_conflict_without_mutation(
    client, db_session, make_item
):
    item = make_item(name="Scoped Idem Raw", warehouse_qty=Decimal("0"))
    requester = _make_employee(db_session, code="IO-IDEM-SCOPE-1")
    other = _make_employee(db_session, code="IO-IDEM-SCOPE-2")
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
                    "quantity": "3",
                }
            ],
        },
    )
    key = "test-idem-key-actor-route"
    payload = {
        "requester_employee_id": str(requester.employee_id),
        "work_type": "receive",
        "sub_type": "receive_supplier",
        "client_request_id": key,
        "bundles": preview.json()["bundles"],
    }
    first = client.post("/api/io/submit", json=payload)
    assert first.status_code == 201, first.json()
    logs_before = db_session.query(TransactionLog).count()

    actor_conflict = client.post(
        "/api/io/submit",
        json={**payload, "requester_employee_id": str(other.employee_id)},
    )
    route_conflict = client.post(
        "/api/stock-requests",
        json={
            "requester_employee_id": str(requester.employee_id),
            "request_type": "warehouse_to_dept",
            "client_request_id": key,
            "lines": [
                {
                    "item_id": str(item.item_id),
                    "quantity": 1,
                    "from_bucket": "warehouse",
                    "to_bucket": "production",
                    "to_department": DepartmentEnum.ASSEMBLY.value,
                }
            ],
        },
    )

    assert actor_conflict.status_code == 409, actor_conflict.json()
    assert actor_conflict.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert actor_conflict.json()["detail"]["extra"]["reason"] == "actor_mismatch"
    assert route_conflict.status_code == 409, route_conflict.json()
    assert route_conflict.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert route_conflict.json()["detail"]["extra"]["reason"] == "route_mismatch"
    assert db_session.query(IoBatch).count() == 1
    assert db_session.query(StockRequest).count() == 0
    assert db_session.query(TransactionLog).count() == logs_before


def test_io_immediate_adjust_in_increases_production_quantity(
    client, db_session, make_item, make_location
):
    item = make_item(name="Adj In", warehouse_qty=Decimal("0"))
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("0"))
    # adjust_in 은 Phase B 부터 부서 결재 정/부 권한자만 즉시 완료된다.
    requester = _make_employee(db_session, department_role="primary")
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "adjust_in",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "targets": [
                {
                    "source_kind": "manual",
                    "item_id": str(item.item_id),
                    "quantity": "4",
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.json()
    bundle = preview.json()["bundles"][0]
    assert len(bundle["lines"]) == 1
    line = bundle["lines"][0]
    assert line["direction"] == "adjust"
    assert line["to_bucket"] == "production"
    assert line["from_bucket"] == "none"

    res = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "adjust_in",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "notes": "adjust in test",
            "bundles": preview.json()["bundles"],
        },
    )
    assert res.status_code == 201, res.json()
    assert res.json()["status"] == "completed"

    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item.item_id,
            InventoryLocation.department == DepartmentEnum.ASSEMBLY,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    assert loc is not None and loc.quantity == Decimal("4")

    tx = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).all()
    assert len(tx) == 1
    assert tx[0].transaction_type == TransactionTypeEnum.ADJUST


def test_io_submit_merges_duplicate_manual_single_item_bundles(
    client, db_session, make_item, make_location
):
    item = make_item(name="Duplicate Adj In", warehouse_qty=Decimal("0"))
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("0"))
    requester = _make_employee(db_session, department_role="primary")
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "adjust_in",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "targets": [
                {
                    "source_kind": "manual",
                    "item_id": str(item.item_id),
                    "quantity": "1",
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.json()
    first_bundle = preview.json()["bundles"][0]
    duplicate_bundle = {
        **first_bundle,
        "bundle_id": str(uuid.uuid4()),
        "lines": [
            {
                **first_bundle["lines"][0],
                "line_id": str(uuid.uuid4()),
            }
        ],
    }

    response = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "adjust_in",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "notes": "duplicate merge",
            "bundles": [first_bundle, duplicate_bundle],
        },
    )

    assert response.status_code == 201, response.json()
    assert db_session.query(IoBundle).count() == 1
    assert db_session.query(IoLine).count() == 1
    persisted_bundle = db_session.query(IoBundle).one()
    persisted_line = db_session.query(IoLine).one()
    assert persisted_bundle.quantity == Decimal("2")
    assert persisted_line.quantity == Decimal("2")
    tx = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).all()
    assert len(tx) == 1
    assert tx[0].quantity_change == Decimal("2")


def test_io_draft_resave_and_submit_merges_duplicate_manual_single_item_bundles(
    client, db_session, make_item, make_location
):
    item = make_item(name="Draft Duplicate Adj In", warehouse_qty=Decimal("0"))
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("0"))
    requester = _make_employee(db_session, department_role="primary")
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "adjust_in",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "targets": [
                {
                    "source_kind": "manual",
                    "item_id": str(item.item_id),
                    "quantity": "1",
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.json()
    first_bundle = preview.json()["bundles"][0]
    duplicate_bundle = {
        **first_bundle,
        "bundle_id": str(uuid.uuid4()),
        "lines": [{**first_bundle["lines"][0], "line_id": str(uuid.uuid4())}],
    }

    saved = client.put(
        "/api/io/draft",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "adjust_in",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "notes": "draft duplicate merge",
            "bundles": [first_bundle, duplicate_bundle],
        },
    )
    assert saved.status_code == 200, saved.json()
    batch_id = saved.json()["batch_id"]

    fetched = client.get(
        "/api/io/draft",
        params={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "adjust_in",
        },
    )
    assert fetched.status_code == 200, fetched.json()
    fetched_bundles = fetched.json()["bundles"]
    assert len(fetched_bundles) == 1
    assert Decimal(str(fetched_bundles[0]["quantity"])) == Decimal("2")

    resaved = client.put(
        "/api/io/draft",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "adjust_in",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "batch_id": batch_id,
            "notes": "draft duplicate merge",
            "bundles": fetched_bundles,
        },
    )
    assert resaved.status_code == 200, resaved.json()
    assert resaved.json()["batch_id"] == batch_id

    submitted = client.post(
        f"/api/io/draft/{batch_id}/submit",
        params={"requester_employee_id": str(requester.employee_id)},
    )
    assert submitted.status_code == 201, submitted.json()
    assert db_session.query(IoBundle).count() == 1
    assert db_session.query(IoLine).count() == 1
    persisted_bundle = db_session.query(IoBundle).one()
    persisted_line = db_session.query(IoLine).one()
    assert persisted_bundle.quantity == Decimal("2")
    assert persisted_line.quantity == Decimal("2")
    tx = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).all()
    assert len(tx) == 1
    assert tx[0].quantity_change == Decimal("2")


def _manual_produce_payload(requester: Employee, item) -> dict:
    return {
        "requester_employee_id": str(requester.employee_id),
        "work_type": "process",
        "sub_type": "produce",
        "to_department": DepartmentEnum.ASSEMBLY.value,
        "bundles": [
            {
                "bundle_id": str(uuid.uuid4()),
                "source_kind": "manual",
                "title": item.item_name,
                "source_item_id": str(item.item_id),
                "quantity": 1,
                "lines": [
                    {
                        "line_id": str(uuid.uuid4()),
                        "item_id": str(item.item_id),
                        "item_name": item.item_name,
                        "unit": "EA",
                        "direction": "in",
                        "from_bucket": "none",
                        "to_bucket": "production",
                        "to_department": DepartmentEnum.ASSEMBLY.value,
                        "quantity": 1,
                        "origin": "manual",
                    }
                ],
            }
        ],
    }


def test_io_submit_rejects_manual_produce_payload(client, db_session, make_item):
    item = make_item(name="Manual Produce Submit", warehouse_qty=Decimal("0"))
    requester = _make_employee(db_session)
    db_session.commit()

    response = client.post("/api/io/submit", json=_manual_produce_payload(requester, item))

    assert response.status_code == 422, response.json()
    assert "수량보정 입고" in str(response.json())
    assert db_session.query(IoBatch).count() == 0
    assert db_session.query(TransactionLog).count() == 0


def test_io_draft_rejects_manual_produce_payload(client, db_session, make_item):
    item = make_item(name="Manual Produce Draft", warehouse_qty=Decimal("0"))
    requester = _make_employee(db_session)
    db_session.commit()

    response = client.put("/api/io/draft", json=_manual_produce_payload(requester, item))

    assert response.status_code == 422, response.json()
    assert "수량보정 입고" in str(response.json())
    assert db_session.query(IoBatch).count() == 0


def test_io_immediate_adjust_out_decreases_production_quantity(
    client, db_session, make_item, make_location
):
    item = make_item(name="Adj Out", warehouse_qty=Decimal("0"))
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("10"))
    db_session.flush()
    # 위치 합과 총량 동기화
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = Decimal("10")
    db_session.flush()
    # adjust_out 은 Phase B 부터 부서 결재 정/부 권한자만 즉시 완료된다.
    requester = _make_employee(db_session, department_role="primary")
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "adjust_out",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "targets": [
                {
                    "source_kind": "manual",
                    "item_id": str(item.item_id),
                    "quantity": "3",
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.json()
    line = preview.json()["bundles"][0]["lines"][0]
    assert line["direction"] == "adjust"
    assert line["from_bucket"] == "production"
    assert line["to_bucket"] == "none"

    res = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "adjust_out",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "notes": "adjust out test",
            "bundles": preview.json()["bundles"],
        },
    )
    assert res.status_code == 201, res.json()
    assert res.json()["status"] == "completed"

    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item.item_id,
            InventoryLocation.department == DepartmentEnum.ASSEMBLY,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    assert loc is not None and loc.quantity == Decimal("7")

    tx = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).all()
    assert len(tx) == 1
    # adjust_out 은 BACKFLUSH 가 아니라 ADJUST 로 남아야 한다
    assert tx[0].transaction_type == TransactionTypeEnum.ADJUST


def test_warehouse_adjust_in_immediately_increases_warehouse_stock(
    client, db_session, make_item
):
    item = make_item(name="Warehouse Adj In", warehouse_qty=Decimal("5"))
    requester = _make_employee(
        db_session,
        code="WH-ADJ-IN",
        warehouse_role="primary",
    )
    db_session.commit()

    preview = _preview_warehouse_adjust(
        client,
        requester,
        item,
        sub_type="warehouse_adjust_in",
        quantity=3,
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["requires_approval"] is False
    line = preview.json()["bundles"][0]["lines"][0]
    assert line["direction"] == "adjust"
    assert line["from_bucket"] == "none"
    assert line["to_bucket"] == "warehouse"
    assert line["from_department"] is None
    assert line["to_department"] is None
    assert line["origin"] == "direct"

    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_adjust",
            "sub_type": "warehouse_adjust_in",
            "bundles": preview.json()["bundles"],
        },
    )

    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["status"] == "completed"
    assert submitted.json()["requires_approval"] is False
    assert submitted.json()["stock_request_id"] is None
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert inventory.warehouse_qty == Decimal("8")
    assert db_session.query(StockRequest).count() == 0
    log = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).one()
    assert log.transaction_type == TransactionTypeEnum.ADJUST
    assert log.quantity_change == Decimal("3")
    assert log.department == "창고"
    assert log.warehouse_qty_before == Decimal("5")
    assert log.warehouse_qty_after == Decimal("8")
    assert log.department_qty_before == Decimal("0")
    assert log.department_qty_after == Decimal("0")

    history = client.get(
        "/api/inventory/transactions",
        params={"department": "창고", "transaction_types": "ADJUST"},
    )
    assert history.status_code == 200, history.text
    assert [row["log_id"] for row in history.json()] == [str(log.log_id)]
    assert history.json()[0]["warehouse_qty_before"] == 5
    assert history.json()[0]["warehouse_qty_after"] == 8
    assert history.json()[0]["department_qty_before"] == 0
    assert history.json()[0]["department_qty_after"] == 0

    warehouse_history = client.get(
        "/api/inventory/transactions",
        params={"operation_keys": "warehouse"},
    )
    process_history = client.get(
        "/api/inventory/transactions",
        params={"operation_keys": "process"},
    )
    assert warehouse_history.status_code == 200, warehouse_history.text
    assert process_history.status_code == 200, process_history.text
    assert [row["log_id"] for row in warehouse_history.json()] == [str(log.log_id)]
    assert process_history.json() == []


def test_warehouse_adjust_out_immediately_decreases_warehouse_stock(
    client, db_session, make_item
):
    item = make_item(name="Warehouse Adj Out", warehouse_qty=Decimal("8"))
    requester = _make_employee(
        db_session,
        code="WH-ADJ-OUT",
        warehouse_role="deputy",
    )
    db_session.commit()

    preview = _preview_warehouse_adjust(
        client,
        requester,
        item,
        sub_type="warehouse_adjust_out",
        quantity=3,
    )
    assert preview.status_code == 200, preview.text
    line = preview.json()["bundles"][0]["lines"][0]
    assert line["direction"] == "adjust"
    assert line["from_bucket"] == "warehouse"
    assert line["to_bucket"] == "none"

    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_adjust",
            "sub_type": "warehouse_adjust_out",
            "bundles": preview.json()["bundles"],
        },
    )

    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["status"] == "completed"
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert inventory.warehouse_qty == Decimal("5")
    log = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).one()
    assert log.transaction_type == TransactionTypeEnum.ADJUST
    assert log.quantity_change == Decimal("-3")


def test_warehouse_adjust_handles_multiple_direct_items_without_bom_expansion(
    client, db_session, make_item
):
    first = make_item(name="Warehouse Adj Multi A", warehouse_qty=Decimal("1"))
    second = make_item(name="Warehouse Adj Multi B", warehouse_qty=Decimal("2"))
    requester = _make_employee(
        db_session,
        code="WH-ADJ-MULTI",
        warehouse_role="primary",
    )
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_adjust",
            "sub_type": "warehouse_adjust_in",
            "targets": [
                {
                    "source_kind": "direct_item",
                    "item_id": str(first.item_id),
                    "quantity": 3,
                },
                {
                    "source_kind": "direct_item",
                    "item_id": str(second.item_id),
                    "quantity": 4,
                },
            ],
        },
    )
    assert preview.status_code == 200, preview.text
    bundles = preview.json()["bundles"]
    assert len(bundles) == 2
    assert all(bundle["source_kind"] == "direct_item" for bundle in bundles)
    assert all(len(bundle["lines"]) == 1 for bundle in bundles)

    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_adjust",
            "sub_type": "warehouse_adjust_in",
            "bundles": bundles,
        },
    )

    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["status"] == "completed"
    inventories = {
        row.item_id: row.warehouse_qty
        for row in db_session.query(Inventory)
        .filter(Inventory.item_id.in_([first.item_id, second.item_id]))
        .all()
    }
    assert inventories == {
        first.item_id: Decimal("4"),
        second.item_id: Decimal("6"),
    }
    assert db_session.query(IoBatch).count() == 1
    assert db_session.query(TransactionLog).count() == 2


def test_warehouse_adjust_rejects_non_warehouse_manager_on_all_write_paths(
    client, db_session, make_item
):
    item = make_item(name="Warehouse Adj Forbidden", warehouse_qty=Decimal("5"))
    manager = _make_employee(
        db_session,
        code="WH-ADJ-MGR",
        warehouse_role="primary",
    )
    requester = _make_employee(db_session, code="WH-ADJ-NONE")
    db_session.commit()

    forbidden_preview = _preview_warehouse_adjust(
        client,
        requester,
        item,
        sub_type="warehouse_adjust_in",
        quantity=1,
    )
    assert forbidden_preview.status_code == 403, forbidden_preview.text

    manager_preview = _preview_warehouse_adjust(
        client,
        manager,
        item,
        sub_type="warehouse_adjust_in",
        quantity=1,
    )
    assert manager_preview.status_code == 200, manager_preview.text
    payload = {
        "requester_employee_id": str(requester.employee_id),
        "work_type": "warehouse_adjust",
        "sub_type": "warehouse_adjust_in",
        "bundles": manager_preview.json()["bundles"],
    }

    drafted = client.put("/api/io/draft", json=payload)
    submitted = client.post("/api/io/submit", json=payload)

    assert drafted.status_code == 403, drafted.text
    assert submitted.status_code == 403, submitted.text
    assert db_session.query(IoBatch).count() == 0
    assert db_session.query(TransactionLog).count() == 0


def test_warehouse_adjust_out_rejects_stock_shortage_without_partial_change(
    client, db_session, make_item
):
    item = make_item(
        name="Warehouse Adj Shortage",
        warehouse_qty=Decimal("5"),
        pending=Decimal("4"),
    )
    requester = _make_employee(
        db_session,
        code="WH-ADJ-SHORT",
        warehouse_role="primary",
    )
    db_session.commit()

    preview = _preview_warehouse_adjust(
        client,
        requester,
        item,
        sub_type="warehouse_adjust_out",
        quantity=2,
    )
    assert preview.status_code == 200, preview.text
    assert Decimal(str(preview.json()["bundles"][0]["lines"][0]["shortage"])) == Decimal("1")

    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_adjust",
            "sub_type": "warehouse_adjust_out",
            "bundles": preview.json()["bundles"],
        },
    )

    assert submitted.status_code == 422, submitted.text
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert inventory.warehouse_qty == Decimal("5")
    assert inventory.pending_quantity == Decimal("4")
    assert db_session.query(TransactionLog).count() == 0


def test_io_produce_component_sources_from_home_dept(
    client, db_session, make_item, make_location, make_bom
):
    """생산 시 BOM 부품은 작업 부서가 아니라 부품의 소속 공정에서 차감되어야 한다.
    조립이 NF(튜닝) 보드를 부품으로 갖는 완제품을 생산할 때, 보드 재고가 튜닝에만 있어도
    재고 부족으로 막히지 않고 튜닝에서 차감된다."""
    parent = make_item(name="완제품", process_type_code="AF", warehouse_qty=Decimal("0"))
    board = make_item(name="튜닝 보드", process_type_code="NF", warehouse_qty=Decimal("0"))
    # 보드는 튜닝 PRODUCTION 에만 있고 조립엔 0.
    make_location(board.item_id, department=DepartmentEnum.TUNING, quantity=Decimal("10"))
    db_session.flush()
    inv = db_session.query(Inventory).filter(Inventory.item_id == board.item_id).first()
    inv.quantity = Decimal("10")  # 위치 합과 총량 동기화
    make_bom(parent.item_id, board.item_id, Decimal("1"))
    requester = _make_employee(db_session)  # 생산은 결재 비대상 — 일반 직원으로 즉시 완료
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "produce",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "targets": [
                {"source_kind": "direct_item", "item_id": str(parent.item_id), "quantity": "2"}
            ],
        },
    )
    assert preview.status_code == 200, preview.json()
    lines = preview.json()["bundles"][0]["lines"]
    board_line = next(l for l in lines if l["item_id"] == str(board.item_id))
    # 핵심: 차감 출처가 조립이 아니라 보드의 소속 공정(튜닝) — 재고 부족 없음.
    assert board_line["from_department"] == DepartmentEnum.TUNING.value
    assert board_line["from_bucket"] == "production"
    assert board_line["origin"] == "bom_auto"
    assert Decimal(str(board_line["shortage"])) == Decimal("0")

    res = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "produce",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "bundles": preview.json()["bundles"],
        },
    )
    assert res.status_code == 201, res.json()
    assert res.json()["status"] == "completed"

    # 튜닝 보드는 튜닝에서 2 차감 → 8.
    tuning_loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == board.item_id,
            InventoryLocation.department == DepartmentEnum.TUNING,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    assert tuning_loc is not None and tuning_loc.quantity == Decimal("8")

    # 완제품은 작업 부서(조립) PRODUCTION 에 2 적재.
    parent_loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == parent.item_id,
            InventoryLocation.department == DepartmentEnum.ASSEMBLY,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    assert parent_loc is not None and parent_loc.quantity == Decimal("2")


def test_io_submit_adjust_out_blocks_on_shortage(
    client, db_session, make_item, make_location
):
    item = make_item(name="Adj Short", warehouse_qty=Decimal("0"))
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("2"))
    db_session.flush()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = Decimal("2")
    db_session.flush()
    requester = _make_employee(db_session)
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "adjust_out",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "targets": [
                {
                    "source_kind": "manual",
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
            "work_type": "process",
            "sub_type": "adjust_out",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "notes": "shortage validation",
            "bundles": preview.json()["bundles"],
        },
    )
    assert res.status_code == 422, res.json()
    body = res.json()
    detail = body.get("detail")
    detail_text = detail if isinstance(detail, str) else str(detail)
    assert "재고 부족" in detail_text

    # 재고 변동 없음
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item.item_id,
            InventoryLocation.department == DepartmentEnum.ASSEMBLY,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    assert loc.quantity == Decimal("2")
    assert db_session.query(TransactionLog).count() == 0


def test_io_submit_without_client_request_id_skips_idempotency(client, db_session, make_item):
    """client_request_id 미전송 시 매번 신규 batch 생성 — 기존 클라이언트 호환성 보장."""
    item = make_item(name="No Idem Raw", warehouse_qty=Decimal("0"))
    requester = _make_employee(db_session)
    db_session.commit()

    def _fresh_payload():
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
                        "quantity": "2",
                    }
                ],
            },
        )
        return {
            "requester_employee_id": str(requester.employee_id),
            "work_type": "receive",
            "sub_type": "receive_supplier",
            "bundles": preview.json()["bundles"],
        }

    first = client.post("/api/io/submit", json=_fresh_payload())
    second = client.post("/api/io/submit", json=_fresh_payload())
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["batch"]["batch_id"] != second.json()["batch"]["batch_id"]
    assert db_session.query(IoBatch).count() == 2


# ---------------------------------------------------------------------------
# F5 — 임시저장 누적(새 슬롯) / batch_id 기반 in-place 갱신
# ---------------------------------------------------------------------------


def _preview_receive_bundles(client, requester, item, qty: str = "3"):
    res = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "receive",
            "sub_type": "receive_supplier",
            "targets": [
                {"source_kind": "direct_item", "item_id": str(item.item_id), "quantity": qty}
            ],
        },
    )
    assert res.status_code == 200, res.json()
    return res.json()["bundles"]


def _put_receive_draft(client, requester, bundles, batch_id=None):
    body = {
        "requester_employee_id": str(requester.employee_id),
        "work_type": "receive",
        "sub_type": "receive_supplier",
        "bundles": bundles,
    }
    if batch_id is not None:
        body["batch_id"] = batch_id
    return client.put("/api/io/draft", json=body)


def test_io_draft_reads_recalculate_shortage_from_current_inventory(
    client, db_session, make_item, make_location, make_bom
):
    """작성 중 응답은 저장 당시 부족값이 아니라 현재 출발 위치 재고를 사용한다."""
    parent = make_item(name="Draft live stock parent", process_type_code="AF")
    component = make_item(name="Draft live stock component", process_type_code="TR")
    make_bom(parent.item_id, component.item_id, Decimal("1"))
    requester = _make_employee(db_session)
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "produce",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "targets": [
                {
                    "source_kind": "direct_item",
                    "item_id": str(parent.item_id),
                    "quantity": "2",
                }
            ],
        },
    )
    assert preview.status_code == 200, preview.json()
    bundles = preview.json()["bundles"]
    preview_component = next(
        line
        for bundle in bundles
        for line in bundle["lines"]
        if line["item_id"] == str(component.item_id)
    )
    assert preview_component["from_department"] == DepartmentEnum.TUBE.value
    assert preview_component["shortage"] == 2

    saved = client.put(
        "/api/io/draft",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "produce",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "bundles": bundles,
        },
    )
    assert saved.status_code == 200, saved.json()
    batch_id = saved.json()["batch_id"]
    saved_line_id = preview_component["line_id"]
    saved_updated_at = (
        db_session.query(IoBatch).filter(IoBatch.batch_id == batch_id).one().updated_at
    )

    location = make_location(
        component.item_id,
        department=DepartmentEnum.TUBE,
        quantity=Decimal("2"),
    )
    component_inventory = (
        db_session.query(Inventory).filter(Inventory.item_id == component.item_id).one()
    )
    component_inventory.quantity = Decimal("2")
    db_session.commit()

    drafts = client.get(
        f"/api/io/drafts?requester_employee_id={requester.employee_id}"
    )
    assert drafts.status_code == 200, drafts.json()
    listed_line = next(
        line
        for draft in drafts.json()
        if draft["batch_id"] == batch_id
        for bundle in draft["bundles"]
        for line in bundle["lines"]
        if line["line_id"] == saved_line_id
    )
    assert listed_line["shortage"] == 0

    draft = client.get(
        "/api/io/draft",
        params={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "produce",
        },
    )
    assert draft.status_code == 200, draft.json()
    fetched_line = next(
        line
        for bundle in draft.json()["bundles"]
        for line in bundle["lines"]
        if line["line_id"] == saved_line_id
    )
    assert fetched_line["shortage"] == 0

    db_session.expire_all()
    persisted_line = db_session.query(IoLine).filter(IoLine.line_id == saved_line_id).one()
    persisted_batch = db_session.query(IoBatch).filter(IoBatch.batch_id == batch_id).one()
    assert persisted_line.shortage == Decimal("2")
    assert persisted_batch.updated_at == saved_updated_at

    location.quantity = Decimal("0")
    component_inventory.quantity = Decimal("0")
    db_session.commit()
    depleted = client.get(
        f"/api/io/drafts?requester_employee_id={requester.employee_id}"
    )
    assert depleted.status_code == 200, depleted.json()
    depleted_line = next(
        line
        for draft_row in depleted.json()
        if draft_row["batch_id"] == batch_id
        for bundle in draft_row["bundles"]
        for line in bundle["lines"]
        if line["line_id"] == saved_line_id
    )
    assert depleted_line["shortage"] == 2


def test_io_draft_save_stacks_new_slots(client, db_session, make_item):
    """batch_id 없이 저장하면 같은 (work_type, sub_type)라도 새 슬롯이 누적된다."""
    item_a = make_item(name="Draft A", warehouse_qty=Decimal("0"))
    item_b = make_item(name="Draft B", warehouse_qty=Decimal("0"))
    requester = _make_employee(db_session)
    db_session.commit()

    r1 = _put_receive_draft(client, requester, _preview_receive_bundles(client, requester, item_a))
    assert r1.status_code == 200, r1.json()
    r2 = _put_receive_draft(client, requester, _preview_receive_bundles(client, requester, item_b))
    assert r2.status_code == 200, r2.json()

    assert r1.json()["batch_id"] != r2.json()["batch_id"]
    drafts = client.get(
        f"/api/io/drafts?requester_employee_id={requester.employee_id}"
    ).json()
    assert len(drafts) == 2


def test_io_draft_save_with_batch_id_updates_in_place(client, db_session, make_item):
    """batch_id를 실어 보내면 해당 draft만 갱신되고 슬롯 수는 늘지 않는다."""
    item = make_item(name="Draft Inplace", warehouse_qty=Decimal("0"))
    requester = _make_employee(db_session)
    db_session.commit()

    bundles = _preview_receive_bundles(client, requester, item)
    first = _put_receive_draft(client, requester, bundles)
    assert first.status_code == 200, first.json()
    batch_id = first.json()["batch_id"]

    again = _put_receive_draft(client, requester, bundles, batch_id=batch_id)
    assert again.status_code == 200, again.json()
    assert again.json()["batch_id"] == batch_id

    drafts = client.get(
        f"/api/io/drafts?requester_employee_id={requester.employee_id}"
    ).json()
    assert len(drafts) == 1
    assert drafts[0]["batch_id"] == batch_id


def test_io_draft_update_others_batch_forbidden(client, db_session, make_item):
    """타인의 draft batch_id로 갱신 시도 시 403."""
    item = make_item(name="Draft Owner", warehouse_qty=Decimal("0"))
    owner = _make_employee(db_session, code="OWN1", name="Owner")
    other = _make_employee(db_session, code="OTH1", name="Other")
    db_session.commit()

    first = _put_receive_draft(client, owner, _preview_receive_bundles(client, owner, item))
    batch_id = first.json()["batch_id"]

    res = _put_receive_draft(
        client, other, _preview_receive_bundles(client, other, item), batch_id=batch_id
    )
    assert res.status_code == 403, res.json()


def test_io_draft_update_unknown_batch_unprocessable(client, db_session, make_item):
    """존재하지 않는 batch_id로 갱신 시도 시 422."""
    item = make_item(name="Draft Unknown", warehouse_qty=Decimal("0"))
    requester = _make_employee(db_session)
    db_session.commit()

    res = _put_receive_draft(
        client,
        requester,
        _preview_receive_bundles(client, requester, item),
        batch_id=str(uuid.uuid4()),
    )
    assert res.status_code == 422, res.json()


# ---------------------------------------------------------------------------
# 원자성 회귀 — io 제출 실패 시 부분 상태 없음
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("sub_type", ["adjust_in", "adjust_out"])
@pytest.mark.parametrize("notes", [None, "", " \t "])
def test_io_submit_requires_memo_for_department_single_adjustment(
    client, db_session, make_item, make_location, sub_type, notes
):
    item = make_item(name=f"Memo required {sub_type}", warehouse_qty=Decimal("0"))
    if sub_type == "adjust_out":
        make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("3"))
        db_session.flush()
        db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one().quantity = Decimal("3")
    requester = _make_employee(db_session, department_role="primary")
    db_session.commit()

    preview = _preview_department_single_adjustment(
        client, requester, item, sub_type=sub_type
    )
    assert preview.status_code == 200, preview.text
    payload = {
        "requester_employee_id": str(requester.employee_id),
        "work_type": "process",
        "sub_type": sub_type,
        "to_department": DepartmentEnum.ASSEMBLY.value,
        "bundles": preview.json()["bundles"],
    }
    if notes is not None:
        payload["notes"] = notes

    response = client.post("/api/io/submit", json=payload)

    assert response.status_code == 422, response.json()
    assert "메모" in str(response.json())
    assert db_session.query(IoBatch).count() == 0
    assert db_session.query(StockRequest).count() == 0
    assert db_session.query(TransactionLog).count() == 0


def test_io_submit_with_memo_keeps_department_approval_request_and_notes(
    client, db_session, make_item, make_location
):
    item = make_item(name="Memo approval request", warehouse_qty=Decimal("0"))
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("0"))
    requester = _make_employee(db_session)
    db_session.commit()

    preview = _preview_department_single_adjustment(
        client, requester, item, sub_type="adjust_in"
    )
    assert preview.status_code == 200, preview.text

    response = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "process",
            "sub_type": "adjust_in",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "notes": "awaiting department approval",
            "bundles": preview.json()["bundles"],
        },
    )

    assert response.status_code == 201, response.json()
    assert response.json()["status"] == "submitted"
    assert response.json()["requires_approval"] is True
    batch = db_session.query(IoBatch).one()
    request = db_session.query(StockRequest).one()
    assert batch.notes == "awaiting department approval"
    assert request.notes == "awaiting department approval"
    assert request.status == StockRequestStatusEnum.SUBMITTED
    assert request.department_approved_by_employee_id is None
    assert db_session.query(TransactionLog).count() == 0


def test_io_draft_submission_requires_memo_without_changing_draft(
    client, db_session, make_item, make_location
):
    item = make_item(name="Draft memo required", warehouse_qty=Decimal("0"))
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("0"))
    requester = _make_employee(db_session, department_role="primary")
    db_session.commit()

    preview = _preview_department_single_adjustment(
        client, requester, item, sub_type="adjust_in"
    )
    assert preview.status_code == 200, preview.text
    payload = {
        "requester_employee_id": str(requester.employee_id),
        "work_type": "process",
        "sub_type": "adjust_in",
        "to_department": DepartmentEnum.ASSEMBLY.value,
        "bundles": preview.json()["bundles"],
    }

    drafted = client.put("/api/io/draft", json=payload)
    assert drafted.status_code == 200, drafted.text
    batch_id = drafted.json()["batch_id"]

    rejected = client.post(
        f"/api/io/draft/{batch_id}/submit",
        params={"requester_employee_id": str(requester.employee_id)},
    )

    assert rejected.status_code == 422, rejected.json()
    db_session.expire_all()
    draft = db_session.query(IoBatch).filter(IoBatch.batch_id == batch_id).one()
    assert draft.status == "draft"
    assert draft.submitted_at is None
    assert db_session.query(StockRequest).count() == 0
    assert db_session.query(TransactionLog).count() == 0

    updated = client.put(
        "/api/io/draft",
        json={**payload, "batch_id": batch_id, "notes": "재고 실사 차이"},
    )
    assert updated.status_code == 200, updated.text
    submitted = client.post(
        f"/api/io/draft/{batch_id}/submit",
        params={"requester_employee_id": str(requester.employee_id)},
    )
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["status"] == "completed"
    db_session.expire_all()
    assert db_session.query(IoBatch).filter(IoBatch.batch_id == batch_id).one().notes == "재고 실사 차이"
    assert db_session.query(TransactionLog).one().notes == "재고 실사 차이"


def test_io_submit_rolls_back_fully_on_shortage(client, db_session, make_item, make_bom):
    """원자성 회귀: 제출이 재고 부족으로 422가 나면 batch/stock_request/재고 어느 것도
    영속되지 않는다(라우터 except ValueError → db.rollback). '성공 전엔 커밋 안 함'
    설계의 증명 — 누가 성급한 commit을 서비스 층에 넣으면 이 테스트가 깨진다."""
    parent = make_item(name="Parent", warehouse_qty=Decimal("0"))
    child = make_item(name="Child", warehouse_qty=Decimal("1"))  # 요청 6 > 가용 1 → 부족
    make_bom(parent.item_id, child.item_id, Decimal("2"))
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
                {"source_kind": "direct_item", "item_id": str(parent.item_id), "quantity": "3"}
            ],
        },
    )
    assert preview.status_code == 200, preview.json()

    res = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_io",
            "sub_type": "warehouse_to_dept",
            "to_department": DepartmentEnum.ASSEMBLY.value,
            "bundles": preview.json()["bundles"],
        },
    )
    assert res.status_code == 422, res.json()  # 재고 부족

    # 원자성: 실패한 제출은 아무 것도 남기지 않는다.
    assert db_session.query(IoBatch).count() == 0
    assert db_session.query(StockRequest).count() == 0
    inv_child = db_session.query(Inventory).filter(Inventory.item_id == child.item_id).first()
    assert inv_child.warehouse_qty == Decimal("1")   # 차감 없음
    assert inv_child.pending_quantity == Decimal("0")  # 예약 없음
