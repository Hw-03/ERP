"""Restored quarantine stock must be usable at its original physical cell."""

from collections.abc import Callable
from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    DefectInventoryMovement, DefectQuarantineRecord, DepartmentEnum, InventoryLocation,
    InventoryOperation, InventoryOperationRoleEnum, Item, LocationStatusEnum, SystemSetting, TransactionLog, TransactionTypeEnum,
)
from app.services import defect_actions, inv_transfer, stock_availability
from app.services.defect_statistics import get_defect_statistics
from tests.test_io_expectation_closure import _cells
from tests.test_io_v2 import _make_employee


@pytest.mark.parametrize("source", ["warehouse", "production"])
@pytest.mark.parametrize("mode", ["single_partial", "single_full", "bulk_two", "legacy_partial", "legacy_full"])
@pytest.mark.parametrize("category", ["DEFECT", "B_GRADE", "OBSOLETE"])
def test_restore_reuses_original_cell_preserves_occurrence_and_cancels_exactly(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], source: str, mode: str, category: str,
) -> None:
    """8.9-06: warehouse and department restore remain distinct and reversible."""
    actor = _make_employee(db_session, code="RESTORE-CELL", warehouse_role="primary")
    item = make_item(name="restore cell", process_type_code="TR", warehouse_qty=Decimal("10"))
    other = make_item(name="unselected restore item", process_type_code="VR", warehouse_qty=Decimal("9"))
    make_location(other.item_id, department=DepartmentEnum.VACUUM, quantity=Decimal("8"))
    make_location(other.item_id, department=DepartmentEnum.VACUUM,
                  status=LocationStatusEnum.DEFECTIVE, quantity=Decimal("1"))
    make_location(item.item_id, department=DepartmentEnum.TUBE, quantity=Decimal("5"))
    make_location(item.item_id, department=DepartmentEnum.RESEARCH, quantity=Decimal("7"))
    make_location(item.item_id, department=DepartmentEnum.RESEARCH,
                  status=LocationStatusEnum.DEFECTIVE, quantity=Decimal("1"))
    db_session.add(SystemSetting(setting_key="inventory_operation_cutover_at",
                                 setting_value="2026-01-01T00:00:00"))
    db_session.commit()
    department = DepartmentEnum.WAREHOUSE if source == "warehouse" else DepartmentEnum.TUBE
    for quantity in ([1, 1] if mode == "bulk_two" else [2]):
        payload = {"actor_employee_id": str(actor.employee_id), "item_id": str(item.item_id),
                   "qty": quantity, "source": source, "target_dept": department.value,
                   "reason_category": "외관 불량", "management_category": category}
        if source == "production":
            payload["source_dept"] = department.value
        response = client.post("/api/defects/quarantine", json=payload)
        assert response.status_code == 200, response.text
    records = db_session.query(DefectQuarantineRecord).filter_by(item_id=item.item_id).all()
    if mode.startswith("legacy"):
        records[0].is_legacy = True
        records[0].legacy_location_id = db_session.query(InventoryLocation).filter_by(
            item_id=item.item_id, department=department.value, status=LocationStatusEnum.DEFECTIVE,
        ).one().location_id
        db_session.commit()
    before = _cells(db_session)
    cell = (stock_availability.AvailabilityCell.warehouse(item.item_id) if source == "warehouse"
            else stock_availability.AvailabilityCell.location(item.item_id, department))
    available_before = stock_availability.figures_for_cells(db_session, [cell])[cell].available
    stats_before = get_defect_statistics(db_session, period="month", anchor=date.today())
    quantity = Decimal("1") if mode.endswith("partial") else Decimal("2")
    payload = {"actor_employee_id": str(actor.employee_id), "reason_category": "외관 불량",
               "reason_memo": "restore original cell"}
    if mode == "bulk_two":
        response = client.post("/api/defects/unquarantine/bulk", json={
            **payload, "lines": [{"record_id": str(record.record_id), "item_id": str(item.item_id),
                                   "department": department.value, "quantity": 1} for record in records],
        })
    else:
        response = client.post("/api/defects/unquarantine", json={
            **payload, "record_id": str(records[0].record_id), "item_id": str(item.item_id),
            "dept": department.value, "qty": str(quantity),
        })
    assert response.status_code == 200, response.text
    db_session.expire_all()
    expected = dict(before)
    normal_key = ((str(item.item_id), "warehouse") if source == "warehouse"
                  else (str(item.item_id), department.value, "PRODUCTION", "quantity"))
    expected[normal_key] += quantity
    expected[(str(item.item_id), department.value, "DEFECTIVE", "quantity")] -= quantity
    assert _cells(db_session) == expected
    assert stock_availability.figures_for_cells(db_session, [cell])[cell].available == available_before + quantity
    savepoint = db_session.begin_nested()
    try:
        if source == "warehouse":
            inv_transfer.consume_warehouse(db_session, item.item_id, available_before + quantity)
        else:
            inv_transfer.consume_from_department(db_session, item.item_id, available_before + quantity, department)
        assert stock_availability.figures_for_cells(db_session, [cell])[cell].available == 0
    finally:
        savepoint.rollback()
    db_session.expire_all()
    assert _cells(db_session) == expected
    assert sum(record.remaining_quantity for record in records) == 2 - quantity
    active = client.get("/api/defects/locations", params={"management_category": category})
    assert active.status_code == 200
    original_record_ids = {str(record.record_id) for record in records}
    assert {row["record_id"] for row in active.json() if row["record_id"] in original_record_ids} == {
        str(record.record_id) for record in records if record.remaining_quantity > 0
    }
    assert db_session.query(InventoryLocation).filter_by(
        item_id=item.item_id, department=DepartmentEnum.WAREHOUSE.value,
        status=LocationStatusEnum.PRODUCTION,
    ).count() == 0
    stats_after = get_defect_statistics(db_session, period="month", anchor=date.today())
    assert stats_after.summary.quantity == stats_before.summary.quantity
    assert stats_after.summary.record_count == stats_before.summary.record_count
    logs = db_session.query(TransactionLog).filter_by(transaction_type=TransactionTypeEnum.UNMARK_DEFECTIVE).all()
    assert len(logs) == (2 if mode == "bulk_two" else 1)
    assert {log.defect_quarantine_record_id for log in logs} == {record.record_id for record in records}
    if mode == "bulk_two":
        assert len({log.operation_id for log in logs}) == 1
        movements = db_session.query(DefectInventoryMovement).filter_by(operation_id=logs[0].operation_id).all()
        assert {movement.record_id for movement in movements} == {record.record_id for record in records}
    for log in logs:
        assert log.operation_role == InventoryOperationRoleEnum.PRIMARY
        effects = {(effect["scope"], effect.get("department"), effect.get("status")): effect["delta"]
                   for effect in log.inventory_effect}
        normal_cell = ("warehouse", None, None) if source == "warehouse" else ("location", department.value, "PRODUCTION")
        assert effects == {normal_cell: int(log.transfer_qty), ("location", department.value, "DEFECTIVE"): -int(log.transfer_qty)}
        assert log.quantity_before == log.quantity_after
        cancelled = client.post(f"/api/inventory/transactions/{log.log_id}/cancel", json={
            "employee_code": actor.employee_code, "pin": "0000", "reason": "reverse restore",
        })
        assert cancelled.status_code == (422 if mode == "bulk_two" and log is not logs[0] else 200), cancelled.text
    db_session.expire_all()
    assert _cells(db_session) == before
    assert sum(record.remaining_quantity for record in records) == 2
    originals = {log.log_id for log in logs}
    reversals = db_session.query(TransactionLog).filter(TransactionLog.reverses_log_id.in_(originals)).all()
    assert {log.reverses_log_id for log in reversals} == originals
    assert len(reversals) == len(logs)
    stats_cancelled = get_defect_statistics(db_session, period="month", anchor=date.today())
    assert stats_cancelled.summary.quantity == stats_before.summary.quantity
    assert stats_cancelled.summary.record_count == stats_before.summary.record_count


@pytest.mark.parametrize("source", ["warehouse", "production"])
@pytest.mark.parametrize("bulk", [False, True])
def test_restore_late_failure_rolls_back_normal_defect_record_and_ledgers(
    db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], monkeypatch: pytest.MonkeyPatch,
    source: str, bulk: bool,
) -> None:
    """A failed single or later bulk effect cannot leave restored usable stock."""
    actor = _make_employee(db_session, code="RESTORE-ATOMIC")
    item = make_item(name="restore atomic", process_type_code="TR", warehouse_qty=Decimal("10"))
    department = DepartmentEnum.WAREHOUSE if source == "warehouse" else DepartmentEnum.TUBE
    make_location(item.item_id, department=DepartmentEnum.TUBE, quantity=Decimal("5"))
    make_location(item.item_id, department=DepartmentEnum.RESEARCH, quantity=Decimal("7"))
    db_session.add(SystemSetting(setting_key="inventory_operation_cutover_at",
                                 setting_value="2026-01-01T00:00:00"))
    db_session.commit()
    for _ in range(2 if bulk else 1):
        defect_actions.quarantine_inventory(
            db_session, item_id=item.item_id, qty=Decimal("1"), source=source,
            target_dept=department, source_dept=department if source == "production" else None,
            actor=actor, reason_category="atomic", reason_memo="quarantine", client_request_id=None,
        )
    records = db_session.query(DefectQuarantineRecord).all()
    before = _cells(db_session)
    counts = {model: db_session.query(model).count()
              for model in (TransactionLog, InventoryOperation, DefectInventoryMovement)}
    real_capture = defect_actions.inv_effect.capture_log_stock_snapshot
    calls = []

    def fail_after_real_change(db: Session, item_id: Any, cells_before: dict) -> dict:
        calls.append(item_id)
        if len(calls) == (2 if bulk else 1):
            assert _cells(db) != before
            raise RuntimeError("restore late failure")
        return real_capture(db, item_id, cells_before)

    monkeypatch.setattr(defect_actions.inv_effect, "capture_log_stock_snapshot", fail_after_real_change)
    with pytest.raises(RuntimeError, match="restore late failure"):
        if bulk:
            defect_actions.unquarantine_inventory_bulk(
                db_session, lines=[defect_actions.BulkUnquarantineLine(
                    record_id=record.record_id, item_id=item.item_id,
                    department=department, quantity=Decimal("1"),
                ) for record in records], actor=actor, reason_category="normal", reason_memo="restore",
            )
        else:
            defect_actions.unquarantine_inventory(
                db_session, record_id=records[0].record_id, item_id=item.item_id,
                qty=Decimal("1"), dept=department, actor=actor,
                reason_category="normal", reason_memo="restore",
            )
    assert len(calls) == (2 if bulk else 1)
    db_session.expire_all()
    assert _cells(db_session) == before
    assert {record.remaining_quantity for record in records} == {Decimal("1")}
    assert {model: db_session.query(model).count() for model in counts} == counts
