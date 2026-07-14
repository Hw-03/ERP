from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    IoBatch,
    IoBundle,
    IoLine,
    LocationStatusEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
)
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


def test_io_submit_draft_endpoint_completes_batch(client, db_session, make_item):
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

    submit_res = client.post(
        f"/api/io/draft/{batch_id}/submit"
        f"?requester_employee_id={requester.employee_id}",
    )
    assert submit_res.status_code == 201, submit_res.json()
    assert submit_res.json()["status"] == "completed"

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

    # batch가 1건만 존재하고 재고도 4 한 번만 증가
    assert db_session.query(IoBatch).count() == 1
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.warehouse_qty == Decimal("4")


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
