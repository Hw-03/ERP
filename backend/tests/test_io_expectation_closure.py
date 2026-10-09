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
