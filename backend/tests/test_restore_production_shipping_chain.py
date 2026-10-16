"""복귀 원재고를 실제 생산·출하에 사용하고 역순으로 복원한다.

일괄 부분 입력은 기존 UI 계약 밖이므로 단건 부분/전량과 일괄 전량만 사용한다.
"""

from collections.abc import Callable
from decimal import Decimal
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    DefectInventoryMovement, DefectQuarantineRecord, DepartmentEnum, Inventory, InventoryLocation, InventoryOperation, Item,
    LocationStatusEnum, ShippingAllocation, SystemSetting, TransactionLog, TransactionTypeEnum,
)
from app.services.inv_calc import _sync_total
from tests.test_io_expectation_closure import _cells
from tests.test_io_v2 import _make_employee


@pytest.mark.parametrize("source", ["warehouse", "튜브", "고압"])
@pytest.mark.parametrize("category", ["DEFECT", "B_GRADE", "OBSOLETE"])
def test_bulk_partial_restore_is_rejected_without_changing_any_cell_or_record(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], source: str, category: str,
) -> None:
    """일괄 전량 계약에 단건 부분 수량을 섞어도 먼저 유효한 행까지 반영하지 않는다."""
    department = DepartmentEnum.HIGH_VOLTAGE if source == "고압" else DepartmentEnum.TUBE
    restore_department = DepartmentEnum.WAREHOUSE if source == "warehouse" else department
    actor = _make_employee(db_session, code="BULK-PARTIAL-GUARD", department=DepartmentEnum.SHIPPING,
                           warehouse_role="primary", department_role="primary")
    item = make_item(name="bulk partial guard", process_type_code="HR" if source == "고압" else "TR",
                     warehouse_qty=Decimal(4 if source == "warehouse" else 0))
    make_location(item.item_id, department=department, quantity=Decimal(0 if source == "warehouse" else 4))
    make_location(item.item_id, department=restore_department, status=LocationStatusEnum.DEFECTIVE)
    other = make_item(name="untouched partial guard", process_type_code="VR", warehouse_qty=Decimal(9), pending=Decimal(1))
    sentinel = make_location(other.item_id, department=DepartmentEnum.RESEARCH, quantity=Decimal(7))
    sentinel.pending_quantity = Decimal(1)
    db_session.add(SystemSetting(setting_key="inventory_operation_cutover_at", setting_value="2026-01-01T00:00:00"))
    for inventory in db_session.query(Inventory).all():
        _sync_total(db_session, inventory)
    db_session.commit()
    for _ in range(2):
        payload = {"actor_employee_id": str(actor.employee_id), "item_id": str(item.item_id), "qty": 2,
                   "source": "warehouse" if source == "warehouse" else "production",
                   "target_dept": restore_department.value, "reason_category": "외관 불량",
                   "management_category": category}
        if source != "warehouse":
            payload["source_dept"] = department.value
        response = client.post("/api/defects/quarantine", json=payload)
        assert response.status_code == 200, response.text
    records = db_session.query(DefectQuarantineRecord).filter_by(item_id=item.item_id).all()
    assert len(records) == 2
    before_cells = _cells(db_session)
    before_remaining = {record.record_id: record.remaining_quantity for record in records}
    assert set(before_remaining.values()) == {2}
    before_counts = {model: db_session.query(model).count()
                     for model in (TransactionLog, InventoryOperation, DefectInventoryMovement)}
    response = client.post("/api/defects/unquarantine/bulk", json={
        "actor_employee_id": str(actor.employee_id), "reason_category": "검사 통과",
        "lines": [{"record_id": str(record.record_id), "item_id": str(item.item_id),
                   "department": restore_department.value, "quantity": quantity}
                  for record, quantity in zip(records, (2, 1), strict=True)],
    })
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == "VALIDATION_ERROR"
    assert "격리 기록 수량이 변경되었습니다" in response.json()["detail"]["message"]
    db_session.expire_all()
    assert _cells(db_session) == before_cells
    assert {record.record_id: record.remaining_quantity for record in records} == before_remaining
    assert {model: db_session.query(model).count() for model in before_counts} == before_counts


@pytest.mark.parametrize("source", ["warehouse", "튜브", "고압"])
@pytest.mark.parametrize("category", ["DEFECT", "B_GRADE", "OBSOLETE"])
@pytest.mark.parametrize("mode", ["single_partial", "single_full", "bulk_full"])
def test_restored_cells_feed_real_production_and_shipping_then_reverse_exactly(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], make_bom: Callable[..., Any],
    source: str, category: str, mode: str,
) -> None:
    """복귀분 외 정상재고가 없는 셀에서만 생산하고 출하·예약·역순 취소를 전 셀로 확인한다."""
    department = DepartmentEnum.HIGH_VOLTAGE if source == "고압" else DepartmentEnum.TUBE
    restore_department = DepartmentEnum.WAREHOUSE if source == "warehouse" else department
    quantity = 1 if mode == "single_partial" else 2
    actor = _make_employee(db_session, code="RESTORE-CHAIN", department=DepartmentEnum.SHIPPING,
                           warehouse_role="primary", department_role="primary")
    component = make_item(name="restored component", process_type_code="HR" if source == "고압" else "TR",
                          warehouse_qty=Decimal(2 if source == "warehouse" else 0))
    pa = make_item(name="chain PA", process_type_code="PA")
    pf = make_item(name="chain PF", process_type_code="PF")
    other = make_item(name="untouched chain item", process_type_code="VR", warehouse_qty=Decimal(9), pending=Decimal(1))
    make_bom(pa.item_id, component.item_id, Decimal(1))
    make_bom(pf.item_id, pa.item_id, Decimal(1))
    make_location(component.item_id, department=department, quantity=Decimal(0 if source == "warehouse" else 2))
    make_location(component.item_id, department=restore_department, status=LocationStatusEnum.DEFECTIVE)
    sentinel = make_location(component.item_id, department=DepartmentEnum.RESEARCH, quantity=Decimal(7))
    sentinel.pending_quantity = Decimal(1)
    make_location(component.item_id, department=DepartmentEnum.RESEARCH,
                  status=LocationStatusEnum.DEFECTIVE, quantity=Decimal(1))
    make_location(pf.item_id, department=DepartmentEnum.SHIPPING)
    make_location(other.item_id, department=DepartmentEnum.VACUUM, quantity=Decimal(8))
    db_session.add(SystemSetting(setting_key="inventory_operation_cutover_at", setting_value="2026-01-01T00:00:00"))
    for inventory in db_session.query(Inventory).all():
        _sync_total(db_session, inventory)
    db_session.commit()
    headers = {"X-MES-Employee-Code": actor.employee_code}

    created = client.post("/api/shipping/requests", headers=headers, json={
        "base_pf_item_id": str(pf.item_id), "finalization_mode": "KEEP_BASE",
        "request_quantity": quantity, "invoice_number": "RESTORE-CHAIN", "companion_lines": [],
    })
    assert created.status_code == 201, created.text
    assert created.json()["final_pf_item_id"] == str(pf.item_id)
    request_id = created.json()["request_id"]
    initial = _cells(db_session)
    for amount in ([1, 1] if mode == "bulk_full" else [2]):
        payload = {"actor_employee_id": str(actor.employee_id), "item_id": str(component.item_id),
                   "qty": amount, "source": "warehouse" if source == "warehouse" else "production",
                   "target_dept": restore_department.value, "reason_category": "외관 불량",
                   "management_category": category}
        if source != "warehouse":
            payload["source_dept"] = department.value
        quarantined = client.post("/api/defects/quarantine", json=payload)
        assert quarantined.status_code == 200, quarantined.text
    records = db_session.query(DefectQuarantineRecord).filter_by(item_id=component.item_id).all()
    normal_key = ((str(component.item_id), "warehouse") if source == "warehouse"
                  else (str(component.item_id), department.value, "PRODUCTION", "quantity"))
    defect_key = (str(component.item_id), restore_department.value, "DEFECTIVE", "quantity")
    expected_quarantined = dict(initial)
    expected_quarantined[normal_key] -= 2
    expected_quarantined[defect_key] += 2
    assert _cells(db_session) == expected_quarantined
    production_payload = {"item_id": str(pf.item_id), "quantity": quantity,
                          "producer_employee_code": actor.employee_code}
    before_log_count = db_session.query(TransactionLog).count()
    unavailable = client.post("/api/production/receipt", json=production_payload)
    assert unavailable.status_code == 422, unavailable.text
    assert _cells(db_session) == expected_quarantined
    assert db_session.query(TransactionLog).count() == before_log_count

    restore_payload = {"actor_employee_id": str(actor.employee_id), "reason_category": "검사 통과"}
    if mode == "bulk_full":
        restored = client.post("/api/defects/unquarantine/bulk", json={**restore_payload, "lines": [
            {"record_id": str(record.record_id), "item_id": str(component.item_id),
             "department": restore_department.value, "quantity": 1} for record in records],
        })
    else:
        restored = client.post("/api/defects/unquarantine", json={**restore_payload,
            "record_id": str(records[0].record_id), "item_id": str(component.item_id),
            "dept": restore_department.value, "qty": quantity,
        })
    assert restored.status_code == 200, restored.text
    expected_restored = dict(expected_quarantined)
    expected_restored[normal_key] += quantity
    expected_restored[defect_key] -= quantity
    assert _cells(db_session) == expected_restored
    assert sum(record.remaining_quantity for record in records) == 2 - quantity
    restore_logs = db_session.query(TransactionLog).filter_by(transaction_type=TransactionTypeEnum.UNMARK_DEFECTIVE).all()
    assert len(restore_logs) == (2 if mode == "bulk_full" else 1)
    assert len({row.operation_id for row in restore_logs}) == 1
    assert {row.defect_quarantine_record_id for row in restore_logs} == {record.record_id for record in records}

    expected_ready = dict(expected_restored)
    transfer_log = None
    if source == "warehouse":
        # 현재 정책상 생산은 부서 셀을 사용하므로 정상 창고→부서 API 이동을 먼저 수행한다.
        context = {"requester_employee_id": str(actor.employee_id), "work_type": "warehouse_io", "sub_type": "warehouse_to_dept"}
        preview = client.post("/api/io/preview", json={**context, "targets": [
            {"source_kind": "direct_item", "item_id": str(component.item_id), "quantity": quantity}],
        })
        assert preview.status_code == 200, preview.text
        transferred = client.post("/api/io/submit", json={**context, "bundles": preview.json()["bundles"]})
        assert transferred.status_code == 201, transferred.text
        assert transferred.json()["status"] == "completed"
        expected_ready[normal_key] -= quantity
        expected_ready[(str(component.item_id), department.value, "PRODUCTION", "quantity")] += quantity
        assert _cells(db_session) == expected_ready
        transfer_log = db_session.query(TransactionLog).filter_by(transaction_type=TransactionTypeEnum.TRANSFER_TO_PROD).one()

    produced = client.post("/api/production/receipt", json=production_payload)
    assert produced.status_code == 201, produced.text
    expected_produced = dict(expected_ready)
    expected_produced[(str(component.item_id), "total")] -= quantity
    expected_produced[(str(component.item_id), department.value, "PRODUCTION", "quantity")] -= quantity
    expected_produced[(str(pf.item_id), "total")] += quantity
    expected_produced[(str(pf.item_id), DepartmentEnum.SHIPPING.value, "PRODUCTION", "quantity")] += quantity
    assert _cells(db_session) == expected_produced
    produced_logs = [db_session.get(TransactionLog, UUID(log_id)) for log_id in produced.json()["transaction_ids"]]
    assert {(row.item_id, row.transaction_type, row.quantity_change) for row in produced_logs} == {
        (component.item_id, TransactionTypeEnum.BACKFLUSH, -quantity),
        (pf.item_id, TransactionTypeEnum.PRODUCE, quantity),
    }
    assert next(row for row in produced_logs if row.item_id == component.item_id).department == department.value
    production_log = next(row for row in produced_logs if row.transaction_type == TransactionTypeEnum.PRODUCE)

    prepared = client.post(f"/api/shipping/requests/{request_id}/prepare-complete", headers=headers,
                           json={"serial_numbers": "\n".join(f"RESTORE-{index}" for index in range(quantity))})
    assert prepared.status_code == 200, prepared.text
    assert _cells(db_session) == expected_produced
    allocation = db_session.query(ShippingAllocation).filter_by(request_id=UUID(request_id), status="RESERVED").one()
    assert (allocation.item_id, allocation.department, allocation.quantity) == (pf.item_id, DepartmentEnum.SHIPPING.value, quantity)
    picked = client.post(f"/api/shipping/requests/{request_id}/pickup-complete", headers=headers)
    assert picked.status_code == 200, picked.text
    expected_picked = dict(expected_produced)
    expected_picked[(str(pf.item_id), "total")] -= quantity
    expected_picked[(str(pf.item_id), DepartmentEnum.SHIPPING.value, "PRODUCTION", "quantity")] -= quantity
    assert _cells(db_session) == expected_picked
    ship_logs = db_session.query(TransactionLog).filter_by(shipping_request_id=UUID(request_id), shipping_phase="PICKUP").all()
    assert [(row.item_id, row.quantity_change) for row in ship_logs] == [(pf.item_id, -quantity)]
    assert db_session.query(ShippingAllocation).filter_by(request_id=UUID(request_id), status="RESERVED").count() == 0

    cancelled_pickup = client.post(f"/api/shipping/requests/{request_id}/pickup-cancel", headers=headers)
    assert cancelled_pickup.status_code == 200, cancelled_pickup.text
    assert _cells(db_session) == expected_produced
    allocation = db_session.query(ShippingAllocation).filter_by(request_id=UUID(request_id), status="RESERVED").one()
    assert (allocation.item_id, allocation.department, allocation.quantity) == (pf.item_id, DepartmentEnum.SHIPPING.value, quantity)
    cancelled_prepare = client.post(f"/api/shipping/requests/{request_id}/prepare-cancel", headers=headers, json={"reason": "reverse chain"})
    assert cancelled_prepare.status_code == 200, cancelled_prepare.text
    assert _cells(db_session) == expected_produced
    assert db_session.query(ShippingAllocation).filter_by(request_id=UUID(request_id), status="RESERVED").count() == 0

    for log, expected in [(production_log, expected_ready), *([(transfer_log, expected_restored)] if transfer_log else []),
                          (restore_logs[0], expected_quarantined)]:
        inverse = client.post(f"/api/inventory/transactions/{log.log_id}/cancel", json={
            "employee_code": actor.employee_code, "pin": "0000", "reason": "reverse chain",
        })
        assert inverse.status_code == 200, inverse.text
        db_session.expire_all()
        assert _cells(db_session) == expected
    assert sum(record.remaining_quantity for record in records) == 2
    assert _cells(db_session) == expected_quarantined
    assert db_session.query(InventoryLocation).filter_by(item_id=component.item_id,
        department=DepartmentEnum.WAREHOUSE.value, status=LocationStatusEnum.PRODUCTION).count() == 0
