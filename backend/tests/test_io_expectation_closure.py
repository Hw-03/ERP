"""Inventory-wide evidence for the approved IO expectation contracts.

These API tests use the existing isolated pytest database. A quantity assertion on
the touched cell alone cannot establish that every other cell stayed unchanged.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    DepartmentEnum, Employee, Inventory, InventoryLocation, InventoryOperation,
    InventoryOperationKindEnum, IoBatch, Item, LocationStatusEnum, Notification, StockRequest,
    StockRequestStatusEnum, SystemSetting, TransactionLog,
)
from tests.test_io_v2 import _make_active_supplier, _make_employee


def _cells(db: Session) -> dict[tuple[str, ...], Decimal]:
    """Capture all physical and reserved cells, including unrelated items."""
    db.flush()
    cells = {}
    for inventory in db.query(Inventory).all():
        item_id = str(inventory.item_id)
        cells[(item_id, "total")] = inventory.quantity
        cells[(item_id, "warehouse")] = inventory.warehouse_qty
        cells[(item_id, "warehouse_pending")] = inventory.pending_quantity
    for location in db.query(InventoryLocation).all():
        key = (str(location.item_id), str(location.department), location.status.value)
        cells[(*key, "quantity")] = location.quantity
        cells[(*key, "pending")] = location.pending_quantity
    return cells


def _seed_cells(
    db: Session, item: Item, make_location: Callable[..., InventoryLocation],
    *, department: DepartmentEnum,
) -> None:
    """Give the target and other departments nonzero normal/defective sentinels."""
    for current in (department, DepartmentEnum.RESEARCH):
        make_location(item.item_id, department=current, quantity=Decimal("7"))
        make_location(item.item_id, department=current,
                      status=LocationStatusEnum.DEFECTIVE, quantity=Decimal("3"))
    inventory = db.query(Inventory).filter_by(item_id=item.item_id).one()
    inventory.quantity = inventory.warehouse_qty + Decimal("20")
    db.flush()


def _submit(
    client: TestClient, requester: Employee, items: list[Item],
    *, work_type: str, sub_type: str, **extra: Any,
) -> dict[str, Any]:
    """Use the server's real preview routes and tokens to submit one work."""
    payload = {"requester_employee_id": str(requester.employee_id),
               "work_type": work_type, "sub_type": sub_type, **extra}
    preview = client.post("/api/io/preview", json={
        **payload, "targets": [{"source_kind": "manual" if sub_type.startswith("adjust") else "direct_item", "item_id": str(item.item_id),
                                 "quantity": 1} for item in items],
    })
    assert preview.status_code == 200, preview.text
    result = client.post("/api/io/submit", json={
        **payload, "notes": "closure memo", "bundles": preview.json()["bundles"],
    })
    assert result.status_code == 201, result.text
    return result.json()


def _cancel_once(
    client: TestClient, db: Session, actor: Employee,
    before: dict[tuple[str, ...], Decimal],
) -> dict[str, Any]:
    """Return observed cancellation facts for direct assertions in each test body."""
    original_logs = db.query(TransactionLog).all()
    original_ids = {log.log_id for log in original_logs}
    operation_ids = {log.operation_id for log in original_logs}
    assert len(operation_ids) == 1
    original_operation_id = next(iter(operation_ids))
    payload = {"employee_code": actor.employee_code, "pin": "0000", "reason": "closure reverse"}
    cancelled = client.post(f"/api/inventory/transactions/{original_logs[0].log_id}/cancel", json=payload)
    assert cancelled.status_code == 200, cancelled.text
    db.expire_all()
    assert _cells(db) == before
    inverse = db.query(InventoryOperation).filter_by(
        reverses_operation_id=original_operation_id,
    ).one()
    assert inverse.kind == InventoryOperationKindEnum.CANCELLATION
    assert inverse.actor_employee_id == actor.employee_id
    assert inverse.reason == "closure reverse"
    inverse_logs = db.query(TransactionLog).filter_by(operation_id=inverse.operation_id).all()
    assert {log.reverses_log_id for log in inverse_logs} == original_ids
    assert {log.log_id for log in db.query(TransactionLog).filter(TransactionLog.log_id.in_(original_ids))} == original_ids
    after_count = db.query(TransactionLog).count()
    retry = client.post(f"/api/inventory/transactions/{original_logs[0].log_id}/cancel", json=payload)
    assert retry.status_code == 422, retry.text
    db.expire_all()
    assert _cells(db) == before
    assert db.query(TransactionLog).count() == after_count
    assert db.query(InventoryOperation).filter_by(reverses_operation_id=original_operation_id).count() == 1
    return {
        "cells": _cells(db),
        "actor_employee_id": inverse.actor_employee_id,
        "reason": inverse.reason,
        "original_ids": original_ids,
        "reverse_original_ids": {log.reverses_log_id for log in inverse_logs},
        "preserved_original_ids": {log.log_id for log in db.query(TransactionLog).filter(TransactionLog.log_id.in_(original_ids))},
        "retry_status": retry.status_code,
        "log_count_before_retry": after_count,
        "log_count_after_retry": db.query(TransactionLog).count(),
        "inverse_count": db.query(InventoryOperation).filter_by(reverses_operation_id=original_operation_id).count(),
    }


def _assert_location_history(
    client: TestClient, log_id: str, *, department: str, before: int, after: int,
) -> list[tuple[int | float | None, int | float | None]]:
    """All PC/mobile list and detail readers receive the same per-cell snapshot."""
    legacy = client.get("/api/inventory/transactions")
    grouped = client.get("/api/inventory/transactions/display-groups")
    operations = client.get("/api/inventory/operations")
    assert legacy.status_code == grouped.status_code == operations.status_code == 200
    readers = [legacy.json(),
               [log for group in grouped.json()["groups"] for log in group["logs"]],
               [line["history_log"] for operation in operations.json()["items"]
                for line in operation["lines"]]]
    snapshots = []
    for rows in readers:
        row = next(row for row in rows if row["log_id"] == log_id)
        effect = next(cell for cell in row["inventory_effect"] if cell.get("department") == department)
        assert effect.get("quantity_before") == before
        assert effect.get("quantity_after") == after
        snapshots.append((effect.get("quantity_before"), effect.get("quantity_after")))
    return snapshots


@pytest.fixture(autouse=True)
def _operation_cutover(db_session: Session) -> None:
    """Exercise immutable operation reversal rather than legacy-only reversal."""
    db_session.add(SystemSetting(setting_key="inventory_operation_cutover_at",
                                 setting_value="2026-01-01T00:00:00"))
    db_session.flush()


@pytest.mark.parametrize("warehouse_role", ["none", "primary", "deputy"])
@pytest.mark.parametrize("sub_type", ["warehouse_to_dept", "dept_to_warehouse"])
def test_mixed_warehouse_transfer_preserves_all_other_cells_and_reverses_once(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], warehouse_role: str, sub_type: str,
) -> None:
    """8.24/8.25: two routes, reservation, approval, history and one inverse."""
    requester = _make_employee(db_session, code="CLOSURE-WH-RQ", name="Warehouse requester", warehouse_role=warehouse_role)
    approver = _make_employee(db_session, code="CLOSURE-WH-AP", name="Warehouse approver", warehouse_role="primary")
    tube = make_item(name="closure tube", process_type_code="TR", warehouse_qty=Decimal("10"))
    hv = make_item(name="closure high voltage", process_type_code="HR", warehouse_qty=Decimal("10"))
    for item, department in ((tube, DepartmentEnum.TUBE), (hv, DepartmentEnum.HIGH_VOLTAGE)):
        _seed_cells(db_session, item, make_location, department=department)
    before = _cells(db_session)
    db_session.commit()
    result = _submit(client, requester, [tube, hv], work_type="warehouse_io", sub_type=sub_type)
    request = db_session.query(StockRequest).one()
    assert request.requester_employee_id == requester.employee_id
    assert request.requester_name == requester.name
    assert request.requester_department == requester.department
    assert request.notes == "closure memo"
    assert {str(line.item_id): (line.to_department if sub_type == "warehouse_to_dept" else line.from_department) for line in request.lines} == {
        str(tube.item_id): DepartmentEnum.TUBE.value, str(hv.item_id): DepartmentEnum.HIGH_VOLTAGE.value,
    }
    if warehouse_role == "none":
        expected_pending = dict(before)
        for item, department in ((tube, DepartmentEnum.TUBE), (hv, DepartmentEnum.HIGH_VOLTAGE)):
            key = ((str(item.item_id), "warehouse_pending") if sub_type == "warehouse_to_dept"
                   else (str(item.item_id), department.value, "PRODUCTION", "pending"))
            expected_pending[key] += 1
        assert result["status"] == "reserved"
        assert _cells(db_session) == expected_pending
        assert db_session.query(TransactionLog).count() == 0
        approved = client.post(f"/api/stock-requests/{request.request_id}/approve",
                               json={"actor_employee_id": str(approver.employee_id), "pin": "0000"})
        assert approved.status_code == 200, approved.text
    else:
        assert result["status"] == "completed"
        assert request.approved_by_employee_id == requester.employee_id
    expected = dict(before)
    for item, department in ((tube, DepartmentEnum.TUBE), (hv, DepartmentEnum.HIGH_VOLTAGE)):
        delta = 1 if sub_type == "warehouse_to_dept" else -1
        expected[(str(item.item_id), "warehouse")] -= delta
        expected[(str(item.item_id), department.value, "PRODUCTION", "quantity")] += delta
    assert _cells(db_session) == expected
    assert request.status == StockRequestStatusEnum.COMPLETED
    assert db_session.query(TransactionLog).count() == 2
    assert client.get("/api/stock-requests/warehouse-queue").json() == []
    summary = client.get("/api/inventory/transactions/summary").json()
    assert (summary["total"], summary["warehouse_count"], summary["dept_count"], summary["adjust_count"]) == (1, 1, 0, 0)
    retry = client.post(f"/api/stock-requests/{request.request_id}/approve",
                        json={"actor_employee_id": str(approver.employee_id), "pin": "0000"})
    assert retry.status_code == 200, retry.text
    assert _cells(db_session) == expected
    assert db_session.query(TransactionLog).count() == 2
    cancelled = _cancel_once(client, db_session, requester, before)
    assert cancelled["cells"] == before
    assert (cancelled["actor_employee_id"], cancelled["reason"]) == (requester.employee_id, "closure reverse")
    assert cancelled["reverse_original_ids"] == cancelled["original_ids"] == cancelled["preserved_original_ids"]
    assert (cancelled["retry_status"], cancelled["log_count_after_retry"], cancelled["inverse_count"]) == (422, cancelled["log_count_before_retry"], 1)
    summary = client.get("/api/inventory/transactions/summary").json()
    assert (summary["total"], summary["warehouse_count"], summary["dept_count"], summary["adjust_count"]) == (2, 2, 0, 0)


@pytest.mark.parametrize("sub_type", ["warehouse_to_dept", "dept_to_warehouse"])
def test_legacy_admin_level_without_warehouse_role_cannot_self_approve(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], sub_type: str,
) -> None:
    """G01: an old in-memory grade never substitutes for an explicit IO role."""
    requester = _make_employee(db_session, code="CLOSURE-OLD-ADMIN", name="Old admin", warehouse_role="none")
    requester.level = "ADMIN"
    item = make_item(name="legacy grade transfer", process_type_code="TR", warehouse_qty=Decimal("10"))
    _seed_cells(db_session, item, make_location, department=DepartmentEnum.TUBE)
    before = _cells(db_session)
    db_session.commit()
    result = _submit(client, requester, [item], work_type="warehouse_io", sub_type=sub_type)
    request = db_session.query(StockRequest).one()
    expected_pending = dict(before)
    key = ((str(item.item_id), "warehouse_pending") if sub_type == "warehouse_to_dept"
           else (str(item.item_id), DepartmentEnum.TUBE.value, "PRODUCTION", "pending"))
    expected_pending[key] += 1
    assert result["status"] == "reserved"
    assert request.approved_by_employee_id is None
    assert _cells(db_session) == expected_pending
    assert db_session.query(TransactionLog).count() == 0
    approved = client.post(f"/api/stock-requests/{request.request_id}/approve", json={
        "actor_employee_id": str(requester.employee_id), "pin": "0000",
    })
    assert approved.status_code == 403, approved.text
    db_session.expire_all()
    assert request.status == StockRequestStatusEnum.RESERVED
    assert request.approved_by_employee_id is None
    assert _cells(db_session) == expected_pending
    assert db_session.query(TransactionLog).count() == 0


def test_department_receipt_pending_approval_and_inverse_keep_every_other_cell(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation],
) -> None:
    """8.2/8.23: approval alone adds one unit at the code department."""
    requester = _make_employee(db_session, code="CLOSURE-DEPT-RQ", name="Department requester")
    approver = _make_employee(db_session, code="CLOSURE-DEPT-AP", name="Department approver", department_role="deputy",
                              department=DepartmentEnum.RESEARCH)
    item = make_item(name="closure department", process_type_code="TR", warehouse_qty=Decimal("10"))
    _seed_cells(db_session, item, make_location, department=DepartmentEnum.TUBE)
    before = _cells(db_session)
    db_session.commit()
    result = _submit(client, requester, [item], work_type="process", sub_type="adjust_in")
    assert result["status"] == "submitted"
    assert _cells(db_session) == before
    assert db_session.query(TransactionLog).count() == 0
    request = db_session.query(StockRequest).one()
    assert request.requires_department_approval is True
    assert request.requires_warehouse_approval is False
    approved = client.post(f"/api/stock-requests/{request.request_id}/department-approve",
                           json={"actor_employee_id": str(approver.employee_id), "pin": "0000"})
    assert approved.status_code == 200, approved.text
    expected = dict(before)
    expected[(str(item.item_id), "total")] += 1
    expected[(str(item.item_id), DepartmentEnum.TUBE.value, "PRODUCTION", "quantity")] += 1
    assert _cells(db_session) == expected
    assert request.status == StockRequestStatusEnum.COMPLETED
    history = client.get("/api/inventory/transactions").json()
    assert len(history) == 1
    assert history[0]["requester_name"] == requester.name
    assert history[0]["approver_name"] == approver.name
    assert history[0]["notes"] == "closure memo"
    assert history[0]["department_qty_before"] == 14
    assert history[0]["department_qty_after"] == 15
    snapshots = _assert_location_history(client, history[0]["log_id"], department=DepartmentEnum.TUBE.value, before=7, after=8)
    assert snapshots == [(7, 8), (7, 8), (7, 8)]
    summary = client.get("/api/inventory/transactions/summary").json()
    assert (summary["total"], summary["warehouse_count"], summary["dept_count"], summary["adjust_count"]) == (1, 0, 1, 0)
    retry = client.post(f"/api/stock-requests/{request.request_id}/department-approve",
                        json={"actor_employee_id": str(approver.employee_id), "pin": "0000"})
    assert retry.status_code == 200, retry.text
    assert _cells(db_session) == expected
    assert db_session.query(TransactionLog).count() == 1
    cancelled = _cancel_once(client, db_session, requester, before)
    assert cancelled["cells"] == before
    assert (cancelled["actor_employee_id"], cancelled["reason"]) == (requester.employee_id, "closure reverse")
    assert cancelled["reverse_original_ids"] == cancelled["original_ids"] == cancelled["preserved_original_ids"]
    assert (cancelled["retry_status"], cancelled["log_count_after_retry"], cancelled["inverse_count"]) == (422, cancelled["log_count_before_retry"], 1)
    snapshots = _assert_location_history(client, history[0]["log_id"], department=DepartmentEnum.TUBE.value, before=7, after=8)
    assert snapshots == [(7, 8), (7, 8), (7, 8)]
    summary = client.get("/api/inventory/transactions/summary").json()
    assert (summary["total"], summary["warehouse_count"], summary["dept_count"], summary["adjust_count"]) == (2, 0, 2, 0)


@pytest.mark.parametrize("invalid_actor", ["role_removed", "inactive", "wrong_pin"])
@pytest.mark.parametrize("work_type,sub_type,role,endpoint", [
    ("warehouse_io", "warehouse_to_dept", "warehouse_role", "approve"),
    ("process", "adjust_in", "department_role", "department-approve"),
])
def test_current_approver_guard_failure_preserves_request_stock_and_history(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], invalid_actor: str,
    work_type: str, sub_type: str, role: str, endpoint: str,
) -> None:
    """8.23/8.24: stale authority and bad PIN cannot change any request effect."""
    requester = _make_employee(db_session, code="CLOSURE-GUARD-RQ")
    approver = _make_employee(db_session, code="CLOSURE-GUARD-AP", **{role: "primary"})
    item = make_item(name="closure guard", process_type_code="TR", warehouse_qty=Decimal("10"))
    _seed_cells(db_session, item, make_location, department=DepartmentEnum.TUBE)
    db_session.commit()
    _submit(client, requester, [item], work_type=work_type, sub_type=sub_type)
    before = _cells(db_session)
    request = db_session.query(StockRequest).one()
    status_before = request.status
    if invalid_actor == "role_removed":
        setattr(approver, role, "none")
    elif invalid_actor == "inactive":
        approver.is_active = "false"
    db_session.commit()
    result = client.post(f"/api/stock-requests/{request.request_id}/{endpoint}", json={
        "actor_employee_id": str(approver.employee_id),
        "pin": "9999" if invalid_actor == "wrong_pin" else "0000",
    })
    assert result.status_code == 403, result.text
    db_session.expire_all()
    assert _cells(db_session) == before
    assert request.status == status_before
    assert request.approved_by_employee_id is None
    assert request.department_approved_by_employee_id is None
    assert db_session.query(TransactionLog).count() == 0
    assert db_session.query(InventoryOperation).count() == 0


def test_raw_receipt_supplier_snapshot_and_single_inverse_preserve_other_cells(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation],
) -> None:
    """8.17: original supplier and warehouse effect survive a master rename."""
    actor = _make_employee(db_session, code="CLOSURE-RAW", warehouse_role="primary")
    supplier = _make_active_supplier(db_session, name="Original closure supplier")
    item = make_item(name="closure raw", process_type_code="TR", warehouse_qty=Decimal("10"))
    _seed_cells(db_session, item, make_location, department=DepartmentEnum.TUBE)
    before = _cells(db_session)
    db_session.commit()
    _submit(client, actor, [item], work_type="receive", sub_type="receive_supplier",
            supplier_id=str(supplier.supplier_id))
    expected = dict(before)
    expected[(str(item.item_id), "warehouse")] += 1
    expected[(str(item.item_id), "total")] += 1
    assert _cells(db_session) == expected
    supplier.name = "Renamed closure supplier"
    db_session.commit()
    log = db_session.query(TransactionLog).one()
    assert log.supplier_name_snapshot == "Original closure supplier"
    history = client.get("/api/inventory/transactions").json()
    assert history[0]["supplier_name_snapshot"] == "Original closure supplier"
    assert history[0]["warehouse_qty_before"] == 10
    assert history[0]["warehouse_qty_after"] == 11
    cancelled = _cancel_once(client, db_session, actor, before)
    assert cancelled["cells"] == before
    assert (cancelled["actor_employee_id"], cancelled["reason"]) == (actor.employee_id, "closure reverse")
    assert cancelled["reverse_original_ids"] == cancelled["original_ids"] == cancelled["preserved_original_ids"]
    assert (cancelled["retry_status"], cancelled["log_count_after_retry"], cancelled["inverse_count"]) == (422, cancelled["log_count_before_retry"], 1)


def test_department_internal_use_reserves_only_selected_location_then_reverses_once(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation],
) -> None:
    """8.15: a cross-department approver consumes only the selected source."""
    requester = _make_employee(db_session, code="CLOSURE-AS-RQ", name="AS requester", department=DepartmentEnum.AS)
    approver = _make_employee(db_session, code="CLOSURE-AS-AP", name="Shipping approver",
                              department=DepartmentEnum.SHIPPING, department_role="primary")
    item = make_item(name="closure selected location", process_type_code="TR", warehouse_qty=Decimal("10"))
    _seed_cells(db_session, item, make_location, department=DepartmentEnum.TUBE)
    before = _cells(db_session)
    db_session.commit()
    preview = client.post("/api/io/preview", json={
        "requester_employee_id": str(requester.employee_id), "work_type": "internal_use",
        "sub_type": "internal_use_out", "to_department": "AS",
        "targets": [{"source_kind": "direct_item", "source_location": "department",
                     "item_id": str(item.item_id), "quantity": 1}],
    })
    assert preview.status_code == 200, preview.text
    result = client.post("/api/io/submit", json={
        "requester_employee_id": str(requester.employee_id), "work_type": "internal_use",
        "sub_type": "internal_use_out", "to_department": "AS", "notes": "AS location memo",
        "bundles": preview.json()["bundles"],
    })
    assert result.status_code == 201, result.text
    expected_pending = dict(before)
    expected_pending[(str(item.item_id), DepartmentEnum.TUBE.value, "PRODUCTION", "pending")] += 1
    assert _cells(db_session) == expected_pending
    assert db_session.query(TransactionLog).count() == 0
    request = db_session.query(StockRequest).one()
    assert request.requires_department_approval is True
    assert request.requires_warehouse_approval is False
    assert request.lines[0].from_department == DepartmentEnum.TUBE.value
    assert request.lines[0].to_department == "AS"
    approved = client.post(f"/api/stock-requests/{request.request_id}/department-approve",
                           json={"actor_employee_id": str(approver.employee_id), "pin": "0000"})
    assert approved.status_code == 200, approved.text
    expected = dict(before)
    expected[(str(item.item_id), "total")] -= 1
    expected[(str(item.item_id), DepartmentEnum.TUBE.value, "PRODUCTION", "quantity")] -= 1
    assert _cells(db_session) == expected
    history = client.get("/api/inventory/transactions").json()
    assert history[0]["requester_name"] == requester.name
    assert history[0]["approver_name"] == approver.name
    assert history[0]["inventory_effect"][0]["department"] == DepartmentEnum.TUBE.value
    assert history[0]["history_batch"]["to_department"] == "AS"
    snapshots = _assert_location_history(client, history[0]["log_id"], department=DepartmentEnum.TUBE.value, before=7, after=6)
    assert snapshots == [(7, 6), (7, 6), (7, 6)]
    cancelled = _cancel_once(client, db_session, requester, before)
    assert cancelled["cells"] == before
    assert (cancelled["actor_employee_id"], cancelled["reason"]) == (requester.employee_id, "closure reverse")
    assert cancelled["reverse_original_ids"] == cancelled["original_ids"] == cancelled["preserved_original_ids"]
    assert (cancelled["retry_status"], cancelled["log_count_after_retry"], cancelled["inverse_count"]) == (422, cancelled["log_count_before_retry"], 1)


def test_custom_bom_six_children_only_keep_parent_and_excluded_item_completely_unchanged(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], make_bom: Callable[..., Any],
) -> None:
    """8.22: all six included children are one work; parent/excluded cells never move."""
    requester = _make_employee(db_session, code="CLOSURE-CUSTOM", name="Custom approver", department_role="primary")
    parent = make_item(name="closure custom parent", process_type_code="AF", warehouse_qty=Decimal("10"))
    _seed_cells(db_session, parent, make_location, department=DepartmentEnum.ASSEMBLY)
    children = []
    for index, code in enumerate(("TR", "TA", "TF", "HR", "HA", "HF", "AR")):
        child = make_item(name=f"closure custom child {index}", process_type_code=code, warehouse_qty=Decimal("10"))
        department = DepartmentEnum.TUBE if index < 3 else DepartmentEnum.HIGH_VOLTAGE if index < 6 else DepartmentEnum.ASSEMBLY
        _seed_cells(db_session, child, make_location, department=department)
        make_bom(parent.item_id, child.item_id, Decimal("1"))
        children.append((child, department))
    before = _cells(db_session)
    db_session.commit()
    preview = client.post("/api/io/preview", json={
        "requester_employee_id": str(requester.employee_id), "work_type": "process", "sub_type": "produce",
        "targets": [{"item_id": str(parent.item_id), "quantity": 1}],
    })
    assert preview.status_code == 200, preview.text
    bundles = preview.json()["bundles"]
    for line in bundles[0]["lines"]:
        if line["item_id"] == str(children[-1][0].item_id):
            line["included"] = False
        elif line["item_id"] == str(children[0][0].item_id):
            line["quantity"] = 2
    submitted = client.post("/api/io/submit", json={
        "requester_employee_id": str(requester.employee_id), "work_type": "process", "sub_type": "produce",
        "notes": "custom selected children", "bundles": bundles,
    })
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["status"] == "completed"
    expected = dict(before)
    for index, (child, department) in enumerate(children[:-1]):
        delta = 2 if index == 0 else 1
        expected[(str(child.item_id), "total")] += delta
        expected[(str(child.item_id), department.value, "PRODUCTION", "quantity")] += delta
    assert _cells(db_session) == expected
    logs = db_session.query(TransactionLog).all()
    assert {log.item_id for log in logs} == {child.item_id for child, _ in children[:-1]}
    assert len(logs) == 6
    assert len({log.operation_id for log in logs}) == 1
    assert db_session.query(StockRequest).filter(StockRequest.status.in_([
        StockRequestStatusEnum.SUBMITTED, StockRequestStatusEnum.RESERVED,
    ])).count() == 0
    cancelled = _cancel_once(client, db_session, requester, before)
    assert cancelled["cells"] == before
    assert (cancelled["actor_employee_id"], cancelled["reason"]) == (requester.employee_id, "closure reverse")
    assert cancelled["reverse_original_ids"] == cancelled["original_ids"] == cancelled["preserved_original_ids"]
    assert (cancelled["retry_status"], cancelled["log_count_after_retry"], cancelled["inverse_count"]) == (422, cancelled["log_count_before_retry"], 1)


@pytest.mark.parametrize("work_type,sub_type,category", [
    ("warehouse_io", "warehouse_to_dept", "warehouse_count"),
    ("process", "adjust_in", "dept_count"),
])
def test_real_original_and_cancel_use_their_own_kst_month_without_double_count(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation],
    work_type: str, sub_type: str, category: str,
) -> None:
    """8.23/8.24/8.25: stock nets to zero, but each month retains one event."""
    actor = _make_employee(db_session, code="CLOSURE-PERIOD", warehouse_role="primary", department_role="primary")
    item = make_item(name="closure period", process_type_code="TR", warehouse_qty=Decimal("10"))
    _seed_cells(db_session, item, make_location, department=DepartmentEnum.TUBE)
    before = _cells(db_session)
    db_session.commit()
    _submit(client, actor, [item], work_type=work_type, sub_type=sub_type)
    cancelled = _cancel_once(client, db_session, actor, before)
    assert cancelled["cells"] == before
    assert (cancelled["actor_employee_id"], cancelled["reason"]) == (actor.employee_id, "closure reverse")
    assert cancelled["reverse_original_ids"] == cancelled["original_ids"] == cancelled["preserved_original_ids"]
    assert (cancelled["retry_status"], cancelled["log_count_after_retry"], cancelled["inverse_count"]) == (422, cancelled["log_count_before_retry"], 1)
    original = db_session.query(InventoryOperation).filter_by(kind=InventoryOperationKindEnum.BUSINESS).one()
    inverse = db_session.query(InventoryOperation).filter_by(reverses_operation_id=original.operation_id).one()
    original.effective_at = datetime(2026, 9, 30, 14, 59, 59)
    inverse.effective_at = datetime(2026, 9, 30, 15, 0, 0)
    batch = db_session.query(IoBatch).one()
    batch.created_at = batch.submitted_at = original.effective_at
    for log in db_session.query(TransactionLog).all():
        log.created_at = inverse.effective_at if log.operation_id == inverse.operation_id else original.effective_at
    db_session.commit()
    for month in ("09", "10"):
        result = client.get("/api/inventory/transactions/summary", params={
            "date_from": f"2026-{month}-01", "date_to": f"2026-{month}-30",
        })
        assert result.status_code == 200, result.text
        summary = result.json()
        assert summary["total"] == summary[category] == 1
        assert summary["adjust_count"] == 0
        assert summary["dept_count" if category == "warehouse_count" else "warehouse_count"] == 0
        listing = client.get("/api/inventory/transactions", params={
            "date_from": f"2026-{month}-01", "date_to": f"2026-{month}-30",
        })
        assert listing.status_code == 200, listing.text
        assert len(listing.json()) == 1
    calendar = client.get("/api/inventory/transactions/monthly-counts", params={"year": 2026})
    assert calendar.status_code == 200, calendar.text
    assert calendar.json()["2026-09"] == calendar.json()["2026-10"] == 1
    assert _cells(db_session) == before


def test_department_request_notifies_each_current_approver_once_and_only_one_queue_row(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
) -> None:
    """8.23-06: real submission delivers one pending item to current role holders."""
    requester = _make_employee(db_session, code="CLOSURE-NOTE-RQ", name="Notification requester")
    primary = _make_employee(db_session, code="CLOSURE-NOTE-DP", department_role="primary")
    deputy = _make_employee(db_session, code="CLOSURE-NOTE-DD", department_role="deputy")
    warehouse = _make_employee(db_session, code="CLOSURE-NOTE-WH", warehouse_role="primary")
    inactive = _make_employee(db_session, code="CLOSURE-NOTE-INACTIVE", department_role="primary")
    inactive.is_active = "false"
    bystander = _make_employee(db_session, code="CLOSURE-NOTE-NONE")
    item = make_item(name="closure notification item", process_type_code="TR")
    db_session.commit()
    _submit(client, requester, [item], work_type="process", sub_type="adjust_in")
    request = db_session.query(StockRequest).one()
    notes = db_session.query(Notification).filter_by(related_request_id=request.request_id, type="approval_request").all()
    assert sorted(str(note.recipient_employee_id) for note in notes) == sorted(
        str(actor.employee_id) for actor in (primary, deputy, warehouse)
    )
    assert all(note.target_section == "dept-queue" for note in notes)
    assert all(requester.name in note.body and item.item_name in note.body and "1" in note.body for note in notes)
    assert not {requester.employee_id, inactive.employee_id, bystander.employee_id}.intersection(
        note.recipient_employee_id for note in notes
    )
    for actor in (primary, deputy, warehouse):
        queue = client.get("/api/stock-requests/department-queue", params={"actor_employee_id": str(actor.employee_id)})
        assert queue.status_code == 200, queue.text
        assert [row["request_id"] for row in queue.json()].count(str(request.request_id)) == 1


@pytest.mark.parametrize("sub_type,delta", [("warehouse_adjust_in", 1), ("warehouse_adjust_out", -1)])
def test_warehouse_adjust_retry_keeps_one_effect_and_one_correct_summary(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], sub_type: str, delta: int,
) -> None:
    """8.16: repeated client command changes warehouse once and counts one work."""
    actor = _make_employee(db_session, code="CLOSURE-ADJUST", warehouse_role="primary")
    item = make_item(name="closure adjustment", process_type_code="TR", warehouse_qty=Decimal("10"))
    _seed_cells(db_session, item, make_location, department=DepartmentEnum.TUBE)
    before = _cells(db_session)
    db_session.commit()
    first = _submit(client, actor, [item], work_type="warehouse_adjust", sub_type=sub_type,
                    client_request_id="closure-adjust-command")
    second = _submit(client, actor, [item], work_type="warehouse_adjust", sub_type=sub_type,
                     client_request_id="closure-adjust-command")
    assert first["batch"]["batch_id"] == second["batch"]["batch_id"]
    assert first["status"] == second["status"] == "completed"
    expected = dict(before)
    expected[(str(item.item_id), "warehouse")] += delta
    expected[(str(item.item_id), "total")] += delta
    assert _cells(db_session) == expected
    log = db_session.query(TransactionLog).one()
    assert log.quantity_change == delta
    assert log.notes == "closure memo"
    assert log.producer_employee_id == actor.employee_id
    summary = client.get("/api/inventory/transactions/summary").json()
    assert (summary["total"], summary["warehouse_count"], summary["dept_count"], summary["adjust_count"]) == (1, 1, 0, 1)


@pytest.mark.parametrize("shortage", [False, True])
def test_item_conversion_scales_net_bom_differences_atomically_and_reverses_once(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], make_bom: Callable[..., Any], shortage: bool,
) -> None:
    """8.16-10/11/13/14: one failed child leaves all cells and ledgers unchanged."""
    actor = _make_employee(db_session, code="CLOSURE-CONVERT")
    source = make_item(name="closure source", process_type_code="AF", warehouse_qty=Decimal("10"))
    target = make_item(name="closure target", process_type_code="AF", warehouse_qty=Decimal("10"))
    common = make_item(name="closure recovered difference", process_type_code="AR", warehouse_qty=Decimal("10"))
    added = make_item(name="closure consumed difference", process_type_code="AR", warehouse_qty=Decimal("10"))
    for item in (source, target, common, added):
        _seed_cells(db_session, item, make_location, department=DepartmentEnum.ASSEMBLY)
    make_bom(source.item_id, common.item_id, Decimal("3"))
    make_bom(target.item_id, common.item_id, Decimal("1"))
    make_bom(target.item_id, added.item_id, Decimal("2"))
    if shortage:
        location = db_session.query(InventoryLocation).filter_by(
            item_id=added.item_id, department=DepartmentEnum.ASSEMBLY.value,
            status=LocationStatusEnum.PRODUCTION,
        ).one()
        location.quantity = 1
        db_session.query(Inventory).filter_by(item_id=added.item_id).one().quantity -= 6
    before = _cells(db_session)
    db_session.commit()
    payload = {"requester_employee_id": str(actor.employee_id), "source_item_id": str(source.item_id),
               "target_item_id": str(target.item_id), "quantity": 2, "requested_mode": "BOM", "memo": "closure conversion"}
    preview = client.get("/api/io/item-conversion-preview", params=payload)
    assert preview.status_code == 200, preview.text
    assert {line["item_id"]: line["total_delta"] for line in preview.json()["lines"]} == {
        str(common.item_id): -4, str(added.item_id): 4,
    }
    assert preview.json()["executable"] is (not shortage)
    result = client.post("/api/io/item-conversion", json=payload)
    if shortage:
        assert result.status_code == 422, result.text
        assert _cells(db_session) == before
        assert db_session.query(TransactionLog).count() == 0
        assert db_session.query(InventoryOperation).count() == 0
        return
    assert result.status_code == 200, result.text
    expected = dict(before)
    for item, delta in ((source, -2), (target, 2), (common, 4), (added, -4)):
        expected[(str(item.item_id), "total")] += delta
        expected[(str(item.item_id), DepartmentEnum.ASSEMBLY.value, "PRODUCTION", "quantity")] += delta
    assert _cells(db_session) == expected
    logs = db_session.query(TransactionLog).all()
    assert len(logs) == 4
    assert len({log.operation_id for log in logs}) == 1
    cancelled = _cancel_once(client, db_session, actor, before)
    assert cancelled["cells"] == before
    assert (cancelled["actor_employee_id"], cancelled["reason"]) == (actor.employee_id, "closure reverse")
    assert cancelled["reverse_original_ids"] == cancelled["original_ids"] == cancelled["preserved_original_ids"]
    assert (cancelled["retry_status"], cancelled["log_count_after_retry"], cancelled["inverse_count"]) == (422, cancelled["log_count_before_retry"], 1)


def test_internal_use_multiple_shortages_preview_all_rows_and_reject_every_effect(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
) -> None:
    """8.15-07: preview exposes both errors; direct submit cannot partially reserve."""
    actor = _make_employee(db_session, code="CLOSURE-ERRORS", department=DepartmentEnum.AS)
    items = [make_item(name=f"closure shortage {index}", warehouse_qty=Decimal("1")) for index in range(2)]
    before = _cells(db_session)
    db_session.commit()
    payload = {"requester_employee_id": str(actor.employee_id), "work_type": "internal_use",
               "sub_type": "internal_use_out", "to_department": "AS"}
    preview = client.post("/api/io/preview", json={
        **payload, "targets": [{"item_id": str(item.item_id), "quantity": 2} for item in items],
    })
    assert preview.status_code == 200, preview.text
    assert [bundle["lines"][0]["shortage"] for bundle in preview.json()["bundles"]] == [1, 1]
    submitted = client.post("/api/io/submit", json={**payload, "bundles": preview.json()["bundles"]})
    assert submitted.status_code == 422, submitted.text
    assert _cells(db_session) == before
    assert db_session.query(StockRequest).count() == 0
    assert db_session.query(TransactionLog).count() == 0
    assert db_session.query(IoBatch).count() == 0


@pytest.mark.parametrize("phase", ["default_submission", "custom_cancellation"])
def test_bom_late_failure_rolls_back_every_cell_and_partial_ledger(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], make_bom: Callable[..., Any],
    monkeypatch: pytest.MonkeyPatch, phase: str,
) -> None:
    """8.22-01/12: prove actual partial execution precedes an all-or-nothing rollback."""
    from app.services import inv_effect, inventory_operation_cancellation

    actor = _make_employee(db_session, code="CLOSURE-BOM-ATOMIC", department_role="primary")
    parent = make_item(name="closure atomic parent", process_type_code="AF", warehouse_qty=Decimal("10"))
    children = [make_item(name=f"closure atomic child {index}", process_type_code="AR",
                          warehouse_qty=Decimal("10")) for index in range(2)]
    for item in [parent, *children]:
        _seed_cells(db_session, item, make_location, department=DepartmentEnum.ASSEMBLY)
    for child in children:
        make_bom(parent.item_id, child.item_id, Decimal("1"))
    before = _cells(db_session)
    db_session.commit()
    payload = {"requester_employee_id": str(actor.employee_id), "work_type": "process", "sub_type": "produce"}
    preview = client.post("/api/io/preview", json={
        **payload, "targets": [{"item_id": str(parent.item_id), "quantity": 1}],
    })
    assert preview.status_code == 200, preview.text
    bundles = preview.json()["bundles"]
    calls = []
    if phase == "default_submission":
        real_capture = inv_effect.capture_log_stock_snapshot

        def fail_second_capture(db: Session, item_id: Any, cells_before: dict) -> dict:
            calls.append(item_id)
            if len(calls) == 2:
                assert _cells(db) != before
                raise RuntimeError("closure second BOM effect failure")
            return real_capture(db, item_id, cells_before)

        monkeypatch.setattr(inv_effect, "capture_log_stock_snapshot", fail_second_capture)
        with pytest.raises(RuntimeError, match="closure second BOM effect failure"):
            client.post("/api/io/submit", json={**payload, "bundles": bundles})
        expected_log_count = expected_operation_count = 0
    else:
        for line in bundles[0]["lines"]:
            if line["item_id"] == str(children[0].item_id):
                line["quantity"] = 2
        submitted = client.post("/api/io/submit", json={**payload, "notes": "atomic custom", "bundles": bundles})
        assert submitted.status_code == 201, submitted.text
        before = _cells(db_session)
        log = db_session.query(TransactionLog).first()
        real_reverse = inventory_operation_cancellation._reverse_log

        def fail_second_reverse(*args: Any, **kwargs: Any) -> Any:
            calls.append(1)
            if len(calls) == 2:
                assert _cells(db_session) != before
                raise RuntimeError("closure second BOM effect failure")
            return real_reverse(*args, **kwargs)

        monkeypatch.setattr(inventory_operation_cancellation, "_reverse_log", fail_second_reverse)
        with pytest.raises(RuntimeError, match="closure second BOM effect failure"):
            client.post(f"/api/inventory/transactions/{log.log_id}/cancel", json={
                "employee_code": actor.employee_code, "pin": "0000", "reason": "atomic failure",
            })
        expected_log_count, expected_operation_count = 2, 1
    assert len(calls) == 2
    db_session.expire_all()
    assert _cells(db_session) == before
    assert db_session.query(TransactionLog).count() == expected_log_count
    assert db_session.query(InventoryOperation).count() == expected_operation_count
    assert db_session.query(InventoryOperation).filter_by(kind=InventoryOperationKindEnum.CANCELLATION).count() == 0
