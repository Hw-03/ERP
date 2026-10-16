"""정상 복귀는 원래 정상재고 위치로 돌아가며 같은 위치에서 취소된다."""

from collections.abc import Callable
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    DefectQuarantineRecord, DepartmentEnum, Inventory, InventoryLocation, Item,
    LocationStatusEnum, SystemSetting, TransactionLog, TransactionTypeEnum,
)
from app.services import inv_effect, inv_transfer
from tests.test_defect_flow import _make_employee


@pytest.mark.parametrize("department", [DepartmentEnum.WAREHOUSE, DepartmentEnum.SHIPPING])
@pytest.mark.parametrize("category", ["DEFECT", "B_GRADE", "OBSOLETE"])
@pytest.mark.parametrize("mode", ["partial", "full", "bulk"])
def test_restore_uses_original_normal_cell_and_cancel_restores_quarantine(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation],
    department: DepartmentEnum, category: str, mode: str,
) -> None:
    """창고/공정의 부분·전량·일괄 복귀, 후속 사용, 효과 기록과 취소를 대조한다."""
    actor = _make_employee(db_session, code="RESTORE-LOCATION", name="복귀 검증", warehouse_role="primary")
    item = make_item(process_type_code="PR", warehouse_qty=Decimal("10"))
    make_location(item.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("5"))
    make_location(item.item_id, department=DepartmentEnum.VACUUM, quantity=Decimal("7"))
    db_session.add(SystemSetting(setting_key="inventory_operation_cutover_at",
                                 setting_value="2026-01-01T00:00:00"))
    db_session.commit()
    for quantity in ([1, 1] if mode == "bulk" else [2]):
        response = client.post("/api/defects/quarantine", json={
            "actor_employee_id": str(actor.employee_id), "item_id": str(item.item_id),
            "qty": quantity, "source": "warehouse" if department == DepartmentEnum.WAREHOUSE else "production",
            "source_dept": None if department == DepartmentEnum.WAREHOUSE else department.value,
            "target_dept": department.value,
            "reason_category": "외관 불량", "management_category": category,
        })
        assert response.status_code == 200, response.text
    records = db_session.query(DefectQuarantineRecord).filter_by(item_id=item.item_id).all()
    before = inv_effect.snapshot_cells(db_session, item.item_id)
    quantity = 1 if mode == "partial" else 2
    payload = {"actor_employee_id": str(actor.employee_id), "reason_category": "외관 불량"}
    if mode == "bulk":
        response = client.post("/api/defects/unquarantine/bulk", json={
            **payload, "lines": [{"record_id": str(record.record_id),
                "item_id": str(item.item_id), "department": department.value, "quantity": 1}
                for record in records],
        })
    else:
        response = client.post("/api/defects/unquarantine", json={
            **payload, "record_id": str(records[0].record_id), "item_id": str(item.item_id),
            "dept": department.value, "qty": quantity,
        })
    assert response.status_code == 200, response.text
    normal_key = ("warehouse", None, None) if department == DepartmentEnum.WAREHOUSE else (
        "location", department.value, "PRODUCTION")
    expected = dict(before)
    expected[normal_key] += quantity
    expected[("location", department.value, "DEFECTIVE")] -= quantity
    assert inv_effect.snapshot_cells(db_session, item.item_id) == expected
    assert db_session.query(InventoryLocation).filter_by(
        item_id=item.item_id, department=DepartmentEnum.WAREHOUSE,
        status=LocationStatusEnum.PRODUCTION,
    ).count() == 0
    assert sum(record.remaining_quantity for record in records) == 2 - quantity
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert inventory.quantity == 22
    savepoint = db_session.begin_nested()
    try:
        if department == DepartmentEnum.WAREHOUSE:
            inv_transfer.consume_warehouse(db_session, item.item_id, Decimal(expected[normal_key]))
        else:
            inv_transfer.consume_from_department(db_session, item.item_id, Decimal(expected[normal_key]), department)
        assert inv_effect.snapshot_cells(db_session, item.item_id)[normal_key] == 0
    finally:
        savepoint.rollback()
    logs = db_session.query(TransactionLog).filter_by(
        item_id=item.item_id, transaction_type=TransactionTypeEnum.UNMARK_DEFECTIVE,
    ).all()
    assert len(logs) == (2 if mode == "bulk" else 1)
    for log in logs:
        effect = {(entry["scope"], entry.get("department"), entry.get("status")): entry["delta"]
                  for entry in log.inventory_effect}
        assert effect == {normal_key: int(log.transfer_qty),
                          ("location", department.value, "DEFECTIVE"): -int(log.transfer_qty)}
    if mode == "bulk":
        assert len({log.operation_id for log in logs}) == 1
    for index, log in enumerate(reversed(logs)):
        cancelled = client.post(f"/api/inventory/transactions/{log.log_id}/cancel", json={
            "employee_code": actor.employee_code, "pin": "0000", "reason": "복귀 취소 검증",
        })
        assert cancelled.status_code == (422 if index else 200), cancelled.text
        db_session.expire_all()
        assert inv_effect.snapshot_cells(db_session, item.item_id) == before
        assert sum(record.remaining_quantity for record in records) == 2
    db_session.expire_all()
    assert inv_effect.snapshot_cells(db_session, item.item_id) == before
    assert sum(record.remaining_quantity for record in records) == 2
    original_ids = {log.log_id for log in logs}
    reversals = db_session.query(TransactionLog).filter(
        TransactionLog.reverses_log_id.in_(original_ids),
    ).all()
    assert len(reversals) == len(logs)
    assert {log.reverses_log_id for log in reversals} == original_ids
