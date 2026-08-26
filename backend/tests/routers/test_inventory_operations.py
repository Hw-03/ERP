"""작업 중심 이력·취소 API 계약."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
import uuid

import pytest

from app.models import (
    DefectInventoryMovement,
    DefectQuarantineRecord,
    DefectQuarantineReconstructionAllocation,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    InventoryOperation,
    InventoryOperationEffectKindEnum,
    InventoryOperationKindEnum,
    InventoryOperationRoleEnum,
    InventoryLocation,
    IoBatch,
    LocationStatusEnum,
    ShippingAllocation,
    ShippingRequest,
    ShippingRequestStatusEnum,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    SystemSetting,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import inv_effect
from app.services import inventory as inventory_svc
from app.services import inventory_operation_cancellation as operation_cancellation_svc
from app.services import legacy_inventory_operation_adoption as legacy_adoption_svc
from app.services import inventory_operations as operation_svc
from app.services.pin_auth import DEFAULT_PIN_HASH


def _seed_operation(db_session, make_item):
    item = make_item(name="작업 API 입고", warehouse_qty=Decimal("0"))
    actor = Employee(
        employee_code="OP-API",
        name="작업 API 관리자",
        role="창고/관리자",
        department="창고",
        level=EmployeeLevelEnum.ADMIN,
        warehouse_role="primary",
        department_role="none",
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(actor)
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.flush()
    operation = operation_svc.create_business_operation(
        db_session,
        domain="inventory_io",
        action="receive",
        display_label="부서 입출고",
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
        department="창고",
    )
    before = inv_effect.snapshot_cells(db_session, item.item_id)
    inventory_svc.receive_confirmed(
        db_session,
        item.item_id,
        Decimal("7"),
        bucket="warehouse",
    )
    inventory = inventory_svc.get_or_create_inventory(db_session, item.item_id)
    log = operation_svc.attach_transaction(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=Decimal("7"),
            quantity_before=Decimal("0"),
            quantity_after=inventory.quantity,
            produced_by=actor.name,
            producer_employee_id=actor.employee_id,
            department="창고",
            **inv_effect.capture_log_stock_snapshot(db_session, item.item_id, before),
        ),
        operation,
        InventoryOperationRoleEnum.PRIMARY,
    )
    db_session.add(log)
    db_session.commit()
    return item, actor, operation, log


def _seed_legacy_actor(db_session, *, code: str) -> Employee:
    actor = Employee(
        employee_code=code,
        name=f"{code} 관리자",
        role="고압/관리자",
        department=DepartmentEnum.HIGH_VOLTAGE,
        level=EmployeeLevelEnum.ADMIN,
        warehouse_role="primary",
        department_role="primary",
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(actor)
    db_session.flush()
    return actor


def _activate_legacy_adoption(db_session) -> None:
    db_session.add(
        SystemSetting(
            setting_key=operation_svc.CUTOVER_SETTING_KEY,
            setting_value=(datetime.utcnow() - timedelta(minutes=30)).isoformat(),
        )
    )


def test_operation_list_preview_cancel_and_summary(client, db_session, make_item) -> None:
    item, actor, operation, original_log = _seed_operation(db_session, make_item)

    listing = client.get(f"/api/inventory/operations?item_id={item.item_id}")
    assert listing.status_code == 200, listing.text
    assert listing.json()["items"][0]["operation_id"] == str(operation.operation_id)
    assert listing.json()["items"][0]["effective_status"] == "active"
    assert listing.json()["items"][0]["can_cancel"] is True
    assert listing.json()["items"][0]["cancel_blockers"] == []
    assert listing.json()["items"][0]["lines"][0]["quantity_change"] == "7"
    assert listing.json()["items"][0]["effects"] == []

    preview = client.post(
        f"/api/inventory/operations/{operation.operation_id}/cancel/preview"
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["can_cancel"] is True
    assert preview.json()["cells"][0]["quantity_after"] == 0

    cancelled = client.post(
        f"/api/inventory/operations/{operation.operation_id}/cancel",
        json={
            "reason": "입고 취소",
            "employee_code": actor.employee_code,
            "pin": "0000",
            "plan_hash": preview.json()["plan_hash"],
        },
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["kind"] == InventoryOperationKindEnum.CANCELLATION.value
    assert cancelled.json()["lines"][0]["quantity_change"] == "-7"
    assert cancelled.json()["lines"][0]["reverses_log_id"] == str(original_log.log_id)

    listing = client.get(f"/api/inventory/operations?item_id={item.item_id}")
    assert listing.status_code == 200
    assert [row["effective_status"] for row in listing.json()["items"]] == [
        "cancellation",
        "cancelled",
    ]
    assert [row["can_cancel"] for row in listing.json()["items"]] == [False, False]
    summary = client.get("/api/inventory/operations/summary")
    assert summary.status_code == 200
    assert summary.json()["total"] == 2
    assert summary.json()["business_count"] == 1
    assert summary.json()["cancellation_count"] == 1


def test_legacy_log_cancel_endpoint_delegates_new_logs_to_operation_reversal(
    client, db_session, make_item
) -> None:
    item, actor, operation, original_log = _seed_operation(db_session, make_item)

    response = client.post(
        f"/api/inventory/transactions/{original_log.log_id}/cancel",
        json={
            "reason": "기존 화면 취소",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 200, response.text
    assert db_session.query(InventoryOperation).count() == 2
    db_session.refresh(original_log)
    assert original_log.cancelled is False
    reversal = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.reverses_log_id == original_log.log_id)
        .one()
    )
    assert reversal.quantity_change == Decimal("-7")
    inventory = inventory_svc.get_or_create_inventory(db_session, item.item_id)
    assert inventory.warehouse_qty == Decimal("0")


def test_same_week_legacy_production_batch_is_adopted_before_cancellation(
    client, db_session, make_item
) -> None:
    parent = make_item(name="레거시 생산 완제품", warehouse_qty=Decimal("0"))
    component = make_item(name="레거시 생산 구성품", warehouse_qty=Decimal("0"))
    actor = Employee(
        employee_code="LEGACY-PRODUCE",
        name="레거시 생산 관리자",
        role="고압/관리자",
        department=DepartmentEnum.HIGH_VOLTAGE,
        level=EmployeeLevelEnum.ADMIN,
        warehouse_role="none",
        department_role="primary",
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(actor)
    db_session.flush()
    batch = IoBatch(
        work_type="process",
        sub_type="produce",
        status="completed",
        requester_employee_id=actor.employee_id,
        requester_name=actor.name,
        requester_department=DepartmentEnum.HIGH_VOLTAGE.value,
        requires_approval=False,
    )
    db_session.add(batch)
    db_session.flush()
    stock_request = StockRequest(
        requester_employee_id=actor.employee_id,
        requester_name=actor.name,
        requester_department=DepartmentEnum.HIGH_VOLTAGE.value,
        request_type=StockRequestTypeEnum.MANUAL_ADJUSTMENT,
        status=StockRequestStatusEnum.COMPLETED,
        requires_warehouse_approval=False,
        operation_batch_id=batch.batch_id,
    )
    db_session.add(stock_request)
    db_session.flush()
    batch.stock_request_id = stock_request.request_id

    inventory_svc.receive_confirmed(
        db_session,
        component.item_id,
        Decimal("20"),
        bucket="production",
        dept=DepartmentEnum.HIGH_VOLTAGE,
    )
    component_before = inv_effect.snapshot_cells(db_session, component.item_id)
    inventory_svc.consume_from_department(
        db_session,
        component.item_id,
        Decimal("7"),
        DepartmentEnum.HIGH_VOLTAGE,
    )
    component_inventory = inventory_svc.get_or_create_inventory(
        db_session, component.item_id
    )

    parent_before = inv_effect.snapshot_cells(db_session, parent.item_id)
    inventory_svc.receive_confirmed(
        db_session,
        parent.item_id,
        Decimal("7"),
        bucket="production",
        dept=DepartmentEnum.HIGH_VOLTAGE,
    )
    parent_inventory = inventory_svc.get_or_create_inventory(db_session, parent.item_id)
    legacy_at = datetime.utcnow() - timedelta(hours=1)
    component_log = TransactionLog(
        item_id=component.item_id,
        transaction_type=TransactionTypeEnum.BACKFLUSH,
        quantity_change=Decimal("-7"),
        quantity_before=Decimal("20"),
        quantity_after=component_inventory.quantity,
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        operation_batch_id=batch.batch_id,
        department=DepartmentEnum.HIGH_VOLTAGE.value,
        created_at=legacy_at,
        **inv_effect.capture_log_stock_snapshot(
            db_session, component.item_id, component_before
        ),
    )
    parent_log = TransactionLog(
        item_id=parent.item_id,
        transaction_type=TransactionTypeEnum.PRODUCE,
        quantity_change=Decimal("7"),
        quantity_before=Decimal("0"),
        quantity_after=parent_inventory.quantity,
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        operation_batch_id=batch.batch_id,
        department=DepartmentEnum.HIGH_VOLTAGE.value,
        created_at=legacy_at,
        **inv_effect.capture_log_stock_snapshot(db_session, parent.item_id, parent_before),
    )
    db_session.add_all([component_log, parent_log])
    db_session.add(
        SystemSetting(
            setting_key=operation_svc.CUTOVER_SETTING_KEY,
            setting_value=(datetime.utcnow() - timedelta(minutes=30)).isoformat(),
        )
    )
    db_session.commit()

    before_summary = client.get("/api/inventory/transactions/summary")
    assert before_summary.status_code == 200, before_summary.text
    assert before_summary.json()["total"] == 1

    response = client.post(
        f"/api/inventory/transactions/{parent_log.log_id}/cancel",
        json={
            "reason": "레거시 생산 취소",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["operation_kind"] == InventoryOperationKindEnum.BUSINESS.value
    assert response.json()["operation_effective_status"] == "cancelled"
    assert response.json()["reversal_operation_id"] is not None
    operations = db_session.query(InventoryOperation).all()
    assert len(operations) == 2
    original = next(
        operation
        for operation in operations
        if operation.kind == InventoryOperationKindEnum.BUSINESS
    )
    cancellation = next(
        operation
        for operation in operations
        if operation.kind == InventoryOperationKindEnum.CANCELLATION
    )
    assert cancellation.reverses_operation_id == original.operation_id
    assert original.display_label == "부서 입출고"
    assert cancellation.display_label == "부서 입출고 취소"
    assert original.idempotency_key == f"legacy-cancel-source:batch:{batch.batch_id}"
    assert original.effective_at == legacy_at
    assert original.actor_employee_id == actor.employee_id
    assert original.actor_name == actor.name
    assert original.department == DepartmentEnum.HIGH_VOLTAGE.value
    db_session.refresh(component_log)
    db_session.refresh(parent_log)
    assert component_log.operation_id == original.operation_id
    assert component_log.operation_role == InventoryOperationRoleEnum.COMPONENT_INPUT
    assert parent_log.operation_id == original.operation_id
    assert parent_log.operation_role == InventoryOperationRoleEnum.PRODUCT_OUTPUT
    assert component_log.cancelled is False
    assert parent_log.cancelled is False
    reversal_logs = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.operation_id == cancellation.operation_id)
        .all()
    )
    assert {log.quantity_change for log in reversal_logs} == {
        Decimal("-7"),
        Decimal("7"),
    }
    assert {log.reverses_log_id for log in reversal_logs} == {
        component_log.log_id,
        parent_log.log_id,
    }
    db_session.refresh(batch)
    assert batch.status == "cancelled"
    db_session.refresh(stock_request)
    assert stock_request.status == StockRequestStatusEnum.CANCELLED
    assert inventory_svc.get_or_create_inventory(
        db_session, parent.item_id
    ).quantity == Decimal("0")
    assert inventory_svc.get_or_create_inventory(
        db_session, component.item_id
    ).quantity == Decimal("20")

    after_summary = client.get("/api/inventory/transactions/summary")
    assert after_summary.status_code == 200, after_summary.text
    assert after_summary.json()["total"] == 2

    groups = client.get("/api/inventory/transactions/display-groups").json()["groups"]
    assert [group["type"] for group in groups] == ["operation", "operation"]
    assert {group["logs"][0]["operation_kind"] for group in groups} == {
        InventoryOperationKindEnum.BUSINESS.value,
        InventoryOperationKindEnum.CANCELLATION.value,
    }


def test_legacy_defect_transaction_is_blocked_without_any_adoption(
    client, db_session, make_item
) -> None:
    item = make_item(name="레거시 불량", warehouse_qty=Decimal("5"))
    actor = _seed_legacy_actor(db_session, code="LEGACY-DEFECT")
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
        quantity_change=Decimal("0"),
        quantity_before=Decimal("5"),
        quantity_after=Decimal("5"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        department=DepartmentEnum.HIGH_VOLTAGE.value,
        inventory_effect=[
            {"scope": "warehouse", "delta": -2},
            {
                "scope": "location",
                "department": DepartmentEnum.HIGH_VOLTAGE.value,
                "status": "DEFECTIVE",
                "delta": 2,
            },
        ],
        created_at=datetime.utcnow() - timedelta(hours=1),
    )
    db_session.add(log)
    _activate_legacy_adoption(db_session)
    db_session.commit()

    response = client.post(
        f"/api/inventory/transactions/{log.log_id}/cancel",
        json={
            "reason": "레거시 불량 취소 시도",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["message"] == (
        legacy_adoption_svc.DEFECT_LEGACY_CANCEL_MESSAGE
    )
    assert db_session.query(InventoryOperation).count() == 0
    db_session.refresh(log)
    assert log.operation_id is None
    assert log.cancelled is False
    assert inventory_svc.get_or_create_inventory(
        db_session, item.item_id
    ).warehouse_qty == Decimal("5")


def test_evidence_backed_legacy_quarantine_is_adopted_and_reversed(
    client, db_session, make_item, make_location
) -> None:
    item = make_item(name="근거 있는 레거시 격리", warehouse_qty=Decimal("8"))
    make_location(
        item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=Decimal("2"),
    )
    inventory = inventory_svc.get_or_create_inventory(db_session, item.item_id)
    inventory.quantity = Decimal("10")
    actor = _seed_legacy_actor(db_session, code="LEGACY-DEFECT-EVIDENCE")
    record = DefectQuarantineRecord(
        item_id=item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE.value,
        original_quantity=Decimal("2"),
        remaining_quantity=Decimal("2"),
        quarantined_by_employee_id=actor.employee_id,
        quarantined_by_name=actor.name,
    )
    db_session.add(record)
    db_session.flush()
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
        quantity_change=Decimal("0"),
        quantity_before=Decimal("10"),
        quantity_after=Decimal("10"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        department=DepartmentEnum.HIGH_VOLTAGE.value,
        defect_quarantine_record_id=record.record_id,
        inventory_effect=[
            {"scope": "warehouse", "delta": -2},
            {
                "scope": "location",
                "department": DepartmentEnum.HIGH_VOLTAGE.value,
                "status": LocationStatusEnum.DEFECTIVE.value,
                "delta": 2,
            },
        ],
        created_at=datetime.utcnow() - timedelta(hours=1),
    )
    db_session.add(log)
    _activate_legacy_adoption(db_session)
    db_session.commit()

    response = client.post(
        f"/api/inventory/transactions/{log.log_id}/cancel",
        json={
            "reason": "근거 있는 격리 취소",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 200, response.text
    db_session.expire_all()
    assert db_session.get(TransactionLog, log.log_id).cancelled is False
    assert db_session.get(DefectQuarantineRecord, record.record_id).remaining_quantity == Decimal("0")
    assert inventory_svc.get_or_create_inventory(
        db_session, item.item_id
    ).warehouse_qty == Decimal("10")
    defective = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item.item_id,
            InventoryLocation.department == DepartmentEnum.HIGH_VOLTAGE.value,
            InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
        )
        .one()
    )
    assert defective.quantity == Decimal("0")
    operations = db_session.query(InventoryOperation).all()
    assert len(operations) == 2
    movements = (
        db_session.query(DefectInventoryMovement)
        .order_by(DefectInventoryMovement.created_at, DefectInventoryMovement.movement_id)
        .all()
    )
    assert [movement.quantity_delta for movement in movements] == [Decimal("2"), Decimal("-2")]
    assert movements[1].reverses_movement_id == movements[0].movement_id


def test_legacy_quarantine_with_downstream_usage_stays_unchanged(
    client, db_session, make_item, make_location
) -> None:
    item = make_item(name="후속 사용 레거시 격리", warehouse_qty=Decimal("9"))
    make_location(
        item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=Decimal("1"),
    )
    inventory_svc.get_or_create_inventory(db_session, item.item_id).quantity = Decimal("10")
    actor = _seed_legacy_actor(db_session, code="LEGACY-DEFECT-DOWNSTREAM")
    record = DefectQuarantineRecord(
        item_id=item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE.value,
        original_quantity=Decimal("2"),
        remaining_quantity=Decimal("1"),
        quarantined_by_name=actor.name,
    )
    db_session.add(record)
    db_session.flush()
    source = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
        quantity_change=Decimal("0"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        department=DepartmentEnum.HIGH_VOLTAGE.value,
        defect_quarantine_record_id=record.record_id,
        inventory_effect=[
            {"scope": "warehouse", "delta": -2},
            {
                "scope": "location",
                "department": DepartmentEnum.HIGH_VOLTAGE.value,
                "status": LocationStatusEnum.DEFECTIVE.value,
                "delta": 2,
            },
        ],
        created_at=datetime.utcnow() - timedelta(hours=2),
    )
    downstream = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.UNMARK_DEFECTIVE,
        quantity_change=Decimal("0"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        department=DepartmentEnum.HIGH_VOLTAGE.value,
        defect_quarantine_record_id=record.record_id,
        inventory_effect=[
            {"scope": "warehouse", "delta": 1},
            {
                "scope": "location",
                "department": DepartmentEnum.HIGH_VOLTAGE.value,
                "status": LocationStatusEnum.DEFECTIVE.value,
                "delta": -1,
            },
        ],
        created_at=datetime.utcnow() - timedelta(hours=1),
    )
    db_session.add_all([source, downstream])
    _activate_legacy_adoption(db_session)
    db_session.commit()

    response = client.post(
        f"/api/inventory/transactions/{source.log_id}/cancel",
        json={
            "reason": "후속 사용이 있는 격리 취소",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["message"] == (
        legacy_adoption_svc.DEFECT_LEGACY_CANCEL_MESSAGE
    )
    assert db_session.query(InventoryOperation).count() == 0
    db_session.refresh(source)
    assert source.operation_id is None
    assert source.cancelled is False
    assert db_session.get(DefectQuarantineRecord, record.record_id).remaining_quantity == Decimal("1")


def test_evidence_backed_legacy_fifo_restore_is_adopted_and_reversed(
    client, db_session, make_item, make_location
) -> None:
    item = make_item(name="근거 있는 FIFO 복귀", warehouse_qty=Decimal("2"))
    make_location(
        item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=Decimal("2"),
    )
    inventory_svc.get_or_create_inventory(db_session, item.item_id).quantity = Decimal("4")
    actor = _seed_legacy_actor(db_session, code="LEGACY-FIFO-EVIDENCE")
    records = [
        DefectQuarantineRecord(
            item_id=item.item_id,
            department=DepartmentEnum.HIGH_VOLTAGE.value,
            original_quantity=Decimal(str(original)),
            remaining_quantity=Decimal(str(remaining)),
            quarantined_by_name=actor.name,
            is_legacy=True,
        )
        for original, remaining in ((1, 0), (3, 2))
    ]
    db_session.add_all(records)
    db_session.flush()
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.UNMARK_DEFECTIVE,
        quantity_change=Decimal("0"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        department=DepartmentEnum.HIGH_VOLTAGE.value,
        inventory_effect=[
            {"scope": "warehouse", "delta": 2},
            {
                "scope": "location",
                "department": DepartmentEnum.HIGH_VOLTAGE.value,
                "status": LocationStatusEnum.DEFECTIVE.value,
                "delta": -2,
            },
        ],
        created_at=datetime.utcnow() - timedelta(hours=1),
    )
    db_session.add(log)
    db_session.flush()
    db_session.add_all(
        [
            DefectQuarantineReconstructionAllocation(
                transaction_log_id=log.log_id,
                record_id=record.record_id,
                quantity=Decimal("1"),
            )
            for record in records
        ]
    )
    _activate_legacy_adoption(db_session)
    db_session.commit()

    response = client.post(
        f"/api/inventory/transactions/{log.log_id}/cancel",
        json={
            "reason": "근거 있는 FIFO 복귀 취소",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 200, response.text
    db_session.expire_all()
    assert [
        db_session.get(DefectQuarantineRecord, record.record_id).remaining_quantity
        for record in records
    ] == [Decimal("1"), Decimal("3")]
    assert db_session.query(DefectInventoryMovement).count() == 4


def test_evidence_backed_legacy_defect_disassembly_is_adopted_as_one_operation(
    client, db_session, make_item, make_location
) -> None:
    parent = make_item(name="근거 있는 레거시 분해 부모", warehouse_qty=Decimal("0"))
    normal_child = make_item(name="근거 있는 정상 회수품", warehouse_qty=Decimal("0"))
    defect_child = make_item(name="근거 있는 불량 회수품", warehouse_qty=Decimal("0"))
    scrap_child = make_item(name="근거 있는 폐기 회수품", warehouse_qty=Decimal("0"))
    parent_location = make_location(
        parent.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=Decimal("0"),
    )
    normal_location = make_location(
        normal_child.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("1"),
    )
    defect_location = make_location(
        defect_child.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=Decimal("1"),
    )
    actor = _seed_legacy_actor(db_session, code="LEGACY-DISASSEMBLE-EVIDENCE")
    parent_record = DefectQuarantineRecord(
        item_id=parent.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE.value,
        original_quantity=Decimal("1"),
        remaining_quantity=Decimal("0"),
        quarantined_by_name=actor.name,
    )
    child_record = DefectQuarantineRecord(
        item_id=defect_child.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE.value,
        original_quantity=Decimal("1"),
        remaining_quantity=Decimal("1"),
        quarantined_by_name=actor.name,
    )
    db_session.add_all([parent_record, child_record])
    db_session.flush()
    reference = f"defect-disassemble:{uuid.uuid4()}"
    created_at = datetime.utcnow() - timedelta(hours=1)
    logs = [
        TransactionLog(
            item_id=parent.item_id,
            transaction_type=TransactionTypeEnum.DISASSEMBLE,
            quantity_change=Decimal("-1"),
            produced_by=actor.name,
            producer_employee_id=actor.employee_id,
            department=DepartmentEnum.HIGH_VOLTAGE.value,
            defect_quarantine_record_id=parent_record.record_id,
            reference_no=reference,
            notes="[rework:defective]",
            inventory_effect=[{
                "scope": "location",
                "department": DepartmentEnum.HIGH_VOLTAGE.value,
                "status": LocationStatusEnum.DEFECTIVE.value,
                "delta": -1,
            }],
            created_at=created_at,
        ),
        TransactionLog(
            item_id=normal_child.item_id,
            transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=Decimal("1"),
            produced_by=actor.name,
            producer_employee_id=actor.employee_id,
            department=DepartmentEnum.HIGH_VOLTAGE.value,
            reference_no=reference,
            notes="[rework:normal_child]",
            inventory_effect=[{
                "scope": "location",
                "department": DepartmentEnum.HIGH_VOLTAGE.value,
                "status": LocationStatusEnum.PRODUCTION.value,
                "delta": 1,
            }],
            created_at=created_at,
        ),
        TransactionLog(
            item_id=defect_child.item_id,
            transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
            quantity_change=Decimal("1"),
            produced_by=actor.name,
            producer_employee_id=actor.employee_id,
            department=DepartmentEnum.HIGH_VOLTAGE.value,
            defect_quarantine_record_id=child_record.record_id,
            reference_no=reference,
            notes="[rework:defective_child]",
            inventory_effect=[{
                "scope": "location",
                "department": DepartmentEnum.HIGH_VOLTAGE.value,
                "status": LocationStatusEnum.DEFECTIVE.value,
                "delta": 1,
            }],
            created_at=created_at,
        ),
        TransactionLog(
            item_id=scrap_child.item_id,
            transaction_type=TransactionTypeEnum.DEFECT_SCRAP,
            quantity_change=Decimal("-1"),
            produced_by=actor.name,
            producer_employee_id=actor.employee_id,
            department=DepartmentEnum.HIGH_VOLTAGE.value,
            reference_no=reference,
            notes="[rework:scrap_child]",
            inventory_effect=[],
            created_at=created_at,
        ),
    ]
    db_session.add_all(logs)
    _activate_legacy_adoption(db_session)
    db_session.commit()

    response = client.post(
        f"/api/inventory/transactions/{logs[0].log_id}/cancel",
        json={
            "reason": "근거 있는 분해 취소",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 200, response.text
    db_session.expire_all()
    assert db_session.get(InventoryLocation, parent_location.location_id).quantity == Decimal("1")
    assert db_session.get(InventoryLocation, normal_location.location_id).quantity == Decimal("0")
    assert db_session.get(InventoryLocation, defect_location.location_id).quantity == Decimal("0")
    assert db_session.get(DefectQuarantineRecord, parent_record.record_id).remaining_quantity == Decimal("1")
    assert db_session.get(DefectQuarantineRecord, child_record.record_id).remaining_quantity == Decimal("0")
    assert db_session.query(InventoryOperation).count() == 2
    assert db_session.query(DefectInventoryMovement).count() == 4
    originals = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.log_id.in_([log.log_id for log in logs]))
        .all()
    )
    assert {log.operation_role for log in originals} == {
        InventoryOperationRoleEnum.REWORK_PARENT_DEFECTIVE,
        InventoryOperationRoleEnum.REWORK_CHILD_NORMAL,
        InventoryOperationRoleEnum.REWORK_CHILD_DEFECTIVE,
        InventoryOperationRoleEnum.REWORK_CHILD_SCRAP,
    }


def test_legacy_disassembly_batch_is_blocked_even_without_legacy_note_markers(
    client, db_session, make_item
) -> None:
    parent = make_item(name="레거시 재작업 부모", warehouse_qty=Decimal("0"))
    child = make_item(name="레거시 재작업 회수품", warehouse_qty=Decimal("1"))
    actor = _seed_legacy_actor(db_session, code="LEGACY-REWORK-BATCH")
    batch = IoBatch(
        work_type="process",
        sub_type="disassemble",
        status="completed",
        requester_employee_id=actor.employee_id,
        requester_name=actor.name,
        requester_department=DepartmentEnum.HIGH_VOLTAGE.value,
        requires_approval=False,
    )
    db_session.add(batch)
    db_session.flush()
    logs = [
        TransactionLog(
            item_id=parent.item_id,
            transaction_type=TransactionTypeEnum.BACKFLUSH,
            quantity_change=Decimal("-1"),
            quantity_before=Decimal("1"),
            quantity_after=Decimal("0"),
            produced_by=actor.name,
            producer_employee_id=actor.employee_id,
            operation_batch_id=batch.batch_id,
            inventory_effect=[{
                "scope": "location",
                "department": DepartmentEnum.HIGH_VOLTAGE.value,
                "status": "PRODUCTION",
                "delta": -1,
            }],
            created_at=datetime.utcnow() - timedelta(hours=1),
        ),
        TransactionLog(
            item_id=child.item_id,
            transaction_type=TransactionTypeEnum.PRODUCE,
            quantity_change=Decimal("1"),
            quantity_before=Decimal("0"),
            quantity_after=Decimal("1"),
            produced_by=actor.name,
            producer_employee_id=actor.employee_id,
            operation_batch_id=batch.batch_id,
            inventory_effect=[{
                "scope": "location",
                "department": DepartmentEnum.HIGH_VOLTAGE.value,
                "status": "PRODUCTION",
                "delta": 1,
            }],
            created_at=datetime.utcnow() - timedelta(hours=1),
        ),
    ]
    db_session.add_all(logs)
    _activate_legacy_adoption(db_session)
    db_session.commit()

    response = client.post(
        f"/api/inventory/transactions/{logs[0].log_id}/cancel",
        json={
            "reason": "레거시 재작업 취소 시도",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["message"] == (
        legacy_adoption_svc.DEFECT_LEGACY_CANCEL_MESSAGE
    )
    assert db_session.query(InventoryOperation).count() == 0
    assert all(log.operation_id is None for log in logs)


def test_legacy_missing_effect_is_blocked_without_any_adoption(
    client, db_session, make_item
) -> None:
    item = make_item(name="레거시 효과 누락", warehouse_qty=Decimal("5"))
    actor = _seed_legacy_actor(db_session, code="LEGACY-MISSING")
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("5"),
        quantity_before=Decimal("0"),
        quantity_after=Decimal("5"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        inventory_effect=None,
        created_at=datetime.utcnow() - timedelta(hours=1),
    )
    db_session.add(log)
    _activate_legacy_adoption(db_session)
    db_session.commit()

    response = client.post(
        f"/api/inventory/transactions/{log.log_id}/cancel",
        json={
            "reason": "효과 누락 취소 시도",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["message"] == (
        legacy_adoption_svc.INCOMPLETE_LEGACY_EFFECT_MESSAGE
    )
    assert db_session.query(InventoryOperation).count() == 0
    db_session.refresh(log)
    assert log.operation_id is None
    assert log.cancelled is False
    assert inventory_svc.get_or_create_inventory(
        db_session, item.item_id
    ).warehouse_qty == Decimal("5")


def test_legacy_adoption_rolls_back_when_current_stock_cannot_be_reversed(
    client, db_session, make_item
) -> None:
    item = make_item(name="레거시 재고 부족", warehouse_qty=Decimal("0"))
    actor = _seed_legacy_actor(db_session, code="LEGACY-SHORTAGE")
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("7"),
        quantity_before=Decimal("0"),
        quantity_after=Decimal("7"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        inventory_effect=[{"scope": "warehouse", "delta": 7}],
        created_at=datetime.utcnow() - timedelta(hours=1),
    )
    db_session.add(log)
    _activate_legacy_adoption(db_session)
    db_session.commit()

    response = client.post(
        f"/api/inventory/transactions/{log.log_id}/cancel",
        json={
            "reason": "재고 부족 취소 시도",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["message"] == (
        operation_cancellation_svc.INSUFFICIENT_STOCK_MESSAGE
    )
    assert db_session.query(InventoryOperation).count() == 0
    db_session.refresh(log)
    assert log.operation_id is None
    assert log.cancelled is False


def test_partially_cancelled_legacy_batch_is_blocked_without_partial_changes(
    client, db_session, make_item
) -> None:
    first = make_item(name="레거시 일부 취소 A", warehouse_qty=Decimal("5"))
    second = make_item(name="레거시 일부 취소 B", warehouse_qty=Decimal("5"))
    actor = _seed_legacy_actor(db_session, code="LEGACY-PARTIAL")
    batch = IoBatch(
        work_type="receive",
        sub_type="receive_supplier",
        status="completed",
        requester_employee_id=actor.employee_id,
        requester_name=actor.name,
        requester_department=DepartmentEnum.HIGH_VOLTAGE.value,
        requires_approval=False,
    )
    db_session.add(batch)
    db_session.flush()
    logs = [
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=Decimal("5"),
            quantity_before=Decimal("0"),
            quantity_after=Decimal("5"),
            produced_by=actor.name,
            producer_employee_id=actor.employee_id,
            operation_batch_id=batch.batch_id,
            inventory_effect=[{"scope": "warehouse", "delta": 5}],
            cancelled=cancelled,
            created_at=datetime.utcnow() - timedelta(hours=1),
        )
        for item, cancelled in ((first, False), (second, True))
    ]
    db_session.add_all(logs)
    _activate_legacy_adoption(db_session)
    db_session.commit()

    response = client.post(
        f"/api/inventory/transactions/{logs[0].log_id}/cancel",
        json={
            "reason": "일부 취소 묶음 시도",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["message"] == (
        legacy_adoption_svc.INCOMPLETE_LEGACY_EFFECT_MESSAGE
    )
    assert db_session.query(InventoryOperation).count() == 0
    db_session.expire_all()
    assert [
        db_session.get(TransactionLog, source.log_id).cancelled for source in logs
    ] == [False, True]
    assert inventory_svc.get_or_create_inventory(
        db_session, first.item_id
    ).warehouse_qty == Decimal("5")
    assert inventory_svc.get_or_create_inventory(
        db_session, second.item_id
    ).warehouse_qty == Decimal("5")


@pytest.mark.parametrize(
    ("transaction_type", "current_qty", "quantity_change", "expected_qty", "role"),
    [
        (
            TransactionTypeEnum.RECEIVE,
            Decimal("5"),
            Decimal("5"),
            Decimal("0"),
            InventoryOperationRoleEnum.PRIMARY,
        ),
        (
            TransactionTypeEnum.SHIP,
            Decimal("5"),
            Decimal("-5"),
            Decimal("10"),
            InventoryOperationRoleEnum.PRIMARY,
        ),
        (
            TransactionTypeEnum.ADJUST,
            Decimal("5"),
            Decimal("5"),
            Decimal("0"),
            InventoryOperationRoleEnum.CORRECTION,
        ),
        (
            TransactionTypeEnum.INTERNAL_USE,
            Decimal("5"),
            Decimal("-5"),
            Decimal("10"),
            InventoryOperationRoleEnum.PRIMARY,
        ),
    ],
)
def test_same_week_legacy_single_log_uses_operation_reversal(
    client,
    db_session,
    make_item,
    transaction_type,
    current_qty,
    quantity_change,
    expected_qty,
    role,
) -> None:
    item = make_item(
        name=f"레거시 단일 {transaction_type.value}",
        warehouse_qty=current_qty,
    )
    actor = _seed_legacy_actor(
        db_session,
        code=f"LEGACY-{transaction_type.value}",
    )
    before_qty = current_qty - quantity_change
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=transaction_type,
        quantity_change=quantity_change,
        quantity_before=before_qty,
        quantity_after=current_qty,
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        inventory_effect=[
            {"scope": "warehouse", "delta": int(quantity_change)}
        ],
        created_at=datetime.utcnow() - timedelta(hours=1),
    )
    db_session.add(log)
    _activate_legacy_adoption(db_session)
    db_session.commit()

    response = client.post(
        f"/api/inventory/transactions/{log.log_id}/cancel",
        json={
            "reason": "레거시 단일 거래 취소",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["operation_effective_status"] == "cancelled"
    db_session.refresh(log)
    assert log.operation_role == role
    assert log.cancelled is False
    reversal = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.reverses_log_id == log.log_id)
        .one()
    )
    assert reversal.quantity_change == -quantity_change
    assert reversal.operation_role == role
    assert inventory_svc.get_or_create_inventory(
        db_session, item.item_id
    ).warehouse_qty == expected_qty


def test_same_week_legacy_transfer_is_adopted_as_transfer_role(
    client, db_session, make_item
) -> None:
    item = make_item(name="레거시 창고 이동", warehouse_qty=Decimal("10"))
    actor = _seed_legacy_actor(db_session, code="LEGACY-TRANSFER")
    before = inv_effect.snapshot_cells(db_session, item.item_id)
    inventory_svc.transfer_to_production(
        db_session,
        item.item_id,
        Decimal("7"),
        DepartmentEnum.HIGH_VOLTAGE,
    )
    inventory = inventory_svc.get_or_create_inventory(db_session, item.item_id)
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.TRANSFER_TO_PROD,
        quantity_change=Decimal("0"),
        quantity_before=Decimal("10"),
        quantity_after=inventory.quantity,
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        department=DepartmentEnum.HIGH_VOLTAGE.value,
        created_at=datetime.utcnow() - timedelta(hours=1),
        **inv_effect.capture_log_stock_snapshot(db_session, item.item_id, before),
    )
    db_session.add(log)
    _activate_legacy_adoption(db_session)
    db_session.commit()

    response = client.post(
        f"/api/inventory/transactions/{log.log_id}/cancel",
        json={
            "reason": "레거시 이동 취소",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 200, response.text
    db_session.refresh(log)
    assert log.operation_role == InventoryOperationRoleEnum.TRANSFER
    inventory = inventory_svc.get_or_create_inventory(db_session, item.item_id)
    assert inventory.warehouse_qty == Decimal("10")
    location = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item.item_id,
            InventoryLocation.department == DepartmentEnum.HIGH_VOLTAGE,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .one()
    )
    assert location.quantity == Decimal("0")


def test_same_week_legacy_department_transfer_batch_is_adopted(
    client, db_session, make_item
) -> None:
    item = make_item(name="레거시 부서 이동", warehouse_qty=Decimal("0"))
    actor = _seed_legacy_actor(db_session, code="LEGACY-DEPT-TRANSFER")
    inventory_svc.receive_confirmed(
        db_session,
        item.item_id,
        Decimal("5"),
        bucket="production",
        dept=DepartmentEnum.HIGH_VOLTAGE,
    )
    before = inv_effect.snapshot_cells(db_session, item.item_id)
    inventory_svc.transfer_between_departments(
        db_session,
        item.item_id,
        Decimal("5"),
        DepartmentEnum.HIGH_VOLTAGE,
        DepartmentEnum.ASSEMBLY,
    )
    batch = IoBatch(
        work_type="process",
        sub_type="dept_transfer",
        status="completed",
        requester_employee_id=actor.employee_id,
        requester_name=actor.name,
        requester_department=DepartmentEnum.HIGH_VOLTAGE.value,
        from_department=DepartmentEnum.HIGH_VOLTAGE.value,
        to_department=DepartmentEnum.ASSEMBLY.value,
        requires_approval=False,
    )
    db_session.add(batch)
    db_session.flush()
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.TRANSFER_DEPT,
        quantity_change=Decimal("0"),
        quantity_before=Decimal("5"),
        quantity_after=Decimal("5"),
        transfer_qty=Decimal("5"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        operation_batch_id=batch.batch_id,
        department=DepartmentEnum.ASSEMBLY.value,
        created_at=datetime.utcnow() - timedelta(hours=1),
        **inv_effect.capture_log_stock_snapshot(db_session, item.item_id, before),
    )
    db_session.add(log)
    _activate_legacy_adoption(db_session)
    db_session.commit()

    response = client.post(
        f"/api/inventory/transactions/{log.log_id}/cancel",
        json={
            "reason": "레거시 부서 이동 취소",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 200, response.text
    db_session.refresh(log)
    assert log.operation_role == InventoryOperationRoleEnum.TRANSFER
    assert batch.status == "cancelled"
    locations = {
        location.department: location.quantity
        for location in db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item.item_id,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .all()
    }
    assert locations[DepartmentEnum.HIGH_VOLTAGE] == Decimal("5")
    assert locations[DepartmentEnum.ASSEMBLY] == Decimal("0")


def test_mixed_legacy_and_operation_batch_is_blocked_without_new_rows(
    client, db_session, make_item
) -> None:
    first = make_item(name="레거시 혼합 A", warehouse_qty=Decimal("5"))
    second = make_item(name="레거시 혼합 B", warehouse_qty=Decimal("5"))
    actor = _seed_legacy_actor(db_session, code="LEGACY-MIXED")
    _activate_legacy_adoption(db_session)
    db_session.flush()
    batch = IoBatch(
        work_type="receive",
        sub_type="receive_supplier",
        status="completed",
        requester_employee_id=actor.employee_id,
        requester_name=actor.name,
        requester_department=DepartmentEnum.HIGH_VOLTAGE.value,
        requires_approval=False,
    )
    db_session.add(batch)
    db_session.flush()
    existing_operation = operation_svc.create_business_operation(
        db_session,
        domain="inventory_io",
        action="receive",
        display_label="원자재 입고",
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
    )
    legacy_log = TransactionLog(
        item_id=first.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("5"),
        quantity_before=Decimal("0"),
        quantity_after=Decimal("5"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        operation_batch_id=batch.batch_id,
        inventory_effect=[{"scope": "warehouse", "delta": 5}],
        created_at=datetime.utcnow() - timedelta(hours=1),
    )
    linked_log = operation_svc.attach_transaction(
        TransactionLog(
            item_id=second.item_id,
            transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=Decimal("5"),
            quantity_before=Decimal("0"),
            quantity_after=Decimal("5"),
            produced_by=actor.name,
            producer_employee_id=actor.employee_id,
            operation_batch_id=batch.batch_id,
            inventory_effect=[{"scope": "warehouse", "delta": 5}],
            created_at=datetime.utcnow() - timedelta(hours=1),
        ),
        existing_operation,
        InventoryOperationRoleEnum.PRIMARY,
    )
    db_session.add_all([legacy_log, linked_log])
    db_session.commit()

    response = client.post(
        f"/api/inventory/transactions/{legacy_log.log_id}/cancel",
        json={
            "reason": "혼합 묶음 취소 시도",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["message"] == (
        legacy_adoption_svc.INCOMPLETE_LEGACY_EFFECT_MESSAGE
    )
    assert db_session.query(InventoryOperation).count() == 1
    db_session.refresh(legacy_log)
    db_session.refresh(linked_log)
    assert legacy_log.operation_id is None
    assert linked_log.operation_id == existing_operation.operation_id
    assert inventory_svc.get_or_create_inventory(
        db_session, first.item_id
    ).warehouse_qty == Decimal("5")
    assert inventory_svc.get_or_create_inventory(
        db_session, second.item_id
    ).warehouse_qty == Decimal("5")


def test_previous_week_legacy_log_stays_unchanged_and_uses_fixed_message(
    client, db_session, make_item
) -> None:
    item = make_item(name="지난 주 레거시 입고", warehouse_qty=Decimal("5"))
    actor = _seed_legacy_actor(db_session, code="LEGACY-PREVIOUS")
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("5"),
        quantity_before=Decimal("0"),
        quantity_after=Decimal("5"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        inventory_effect=[{"scope": "warehouse", "delta": 5}],
        created_at=datetime.utcnow() - timedelta(days=8),
    )
    db_session.add(log)
    _activate_legacy_adoption(db_session)
    db_session.commit()

    response = client.post(
        f"/api/inventory/transactions/{log.log_id}/cancel",
        json={
            "reason": "지난 주 취소 시도",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["message"] == (
        operation_cancellation_svc.PREVIOUS_WEEK_MESSAGE
    )
    assert db_session.query(InventoryOperation).count() == 0
    db_session.refresh(log)
    assert log.operation_id is None
    assert log.cancelled is False
    assert inventory_svc.get_or_create_inventory(
        db_session, item.item_id
    ).warehouse_qty == Decimal("5")


def test_already_legacy_cancelled_log_is_not_converted(
    client, db_session, make_item
) -> None:
    item = make_item(name="기존 방식 취소 완료", warehouse_qty=Decimal("0"))
    actor = _seed_legacy_actor(db_session, code="LEGACY-ALREADY")
    cancelled_at = datetime.utcnow() - timedelta(minutes=10)
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("5"),
        quantity_before=Decimal("0"),
        quantity_after=Decimal("5"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        inventory_effect=[{"scope": "warehouse", "delta": 5}],
        cancelled=True,
        cancel_reason="기존 방식 취소",
        cancelled_by=actor.employee_id,
        cancelled_at=cancelled_at,
        created_at=datetime.utcnow() - timedelta(hours=1),
    )
    db_session.add(log)
    _activate_legacy_adoption(db_session)
    db_session.commit()

    response = client.post(
        f"/api/inventory/transactions/{log.log_id}/cancel",
        json={
            "reason": "재취소 시도",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["message"] == "이미 취소된 거래입니다."
    assert db_session.query(InventoryOperation).count() == 0
    db_session.refresh(log)
    assert log.operation_id is None
    assert log.cancelled is True
    assert log.cancel_reason == "기존 방식 취소"
    assert log.cancelled_at == cancelled_at


def test_legacy_shipping_reference_bundle_is_adopted_as_one_operation(
    client, db_session, make_item
) -> None:
    final_item = make_item(name="레거시 출하 완제품", warehouse_qty=Decimal("3"))
    companion = make_item(name="레거시 동반 출하품", warehouse_qty=Decimal("5"))
    actor = _seed_legacy_actor(db_session, code="LEGACY-SHIPPING")
    request = ShippingRequest(
        status=ShippingRequestStatusEnum.PICKED_UP,
        base_pf_item_id=final_item.item_id,
        final_pf_item_id=final_item.item_id,
        request_quantity=7,
        requested_by_name=actor.name,
        prepared_by_employee_id=actor.employee_id,
        prepared_by_name=actor.name,
        picked_up_at=datetime.utcnow() - timedelta(hours=1),
    )
    db_session.add(request)
    db_session.flush()
    reference_no = f"SHIP-{str(request.request_id)[:8]}"
    allocations = [
        ShippingAllocation(
            request_id=request.request_id,
            item_id=item.item_id,
            quantity=quantity,
            unit="EA",
            department=DepartmentEnum.HIGH_VOLTAGE.value,
            status="CONSUMED",
            reference_no=f"{reference_no}:{suffix}",
            consumed_at=request.picked_up_at,
        )
        for item, quantity, suffix in (
            (final_item, 7, "PF"),
            (companion, 5, "COMPANION"),
        )
    ]
    logs = [
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.SHIP,
            quantity_change=-quantity,
            quantity_before=10,
            quantity_after=10 - quantity,
            reference_no=reference_no,
            produced_by=actor.name,
            producer_employee_id=actor.employee_id,
            shipping_request_id=request.request_id,
            department=DepartmentEnum.HIGH_VOLTAGE.value,
            inventory_effect=[{"scope": "warehouse", "delta": -quantity}],
            created_at=request.picked_up_at,
        )
        for item, quantity in ((final_item, 7), (companion, 5))
    ]
    db_session.add_all([*allocations, *logs])
    _activate_legacy_adoption(db_session)
    db_session.commit()

    before_summary = client.get("/api/inventory/transactions/summary")
    assert before_summary.status_code == 200, before_summary.text
    assert before_summary.json()["total"] == 1

    response = client.post(
        f"/api/inventory/transactions/{logs[0].log_id}/cancel",
        json={
            "reason": "레거시 출하 취소",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 200, response.text
    assert db_session.query(InventoryOperation).count() == 2
    db_session.refresh(request)
    assert request.status == ShippingRequestStatusEnum.CANCELLED
    for allocation in allocations:
        db_session.refresh(allocation)
        assert allocation.status == "RELEASED"
    for source in logs:
        db_session.refresh(source)
        assert source.cancelled is False
        assert source.operation_role == InventoryOperationRoleEnum.PRIMARY
        reversal = (
            db_session.query(TransactionLog)
            .filter(TransactionLog.reverses_log_id == source.log_id)
            .one()
        )
        assert reversal.quantity_change == -source.quantity_change
    assert inventory_svc.get_or_create_inventory(
        db_session, final_item.item_id
    ).warehouse_qty == Decimal("10")
    assert inventory_svc.get_or_create_inventory(
        db_session, companion.item_id
    ).warehouse_qty == Decimal("10")

    after_summary = client.get("/api/inventory/transactions/summary")
    assert after_summary.status_code == 200, after_summary.text
    assert after_summary.json()["total"] == 2


def test_legacy_batch_with_missing_linked_request_is_blocked_atomically(
    client, db_session, make_item
) -> None:
    item = make_item(name="연결 요청 누락 레거시", warehouse_qty=Decimal("5"))
    actor = _seed_legacy_actor(db_session, code="LEGACY-DANGLING")
    batch = IoBatch(
        work_type="receive",
        sub_type="receive_supplier",
        status="completed",
        requester_employee_id=actor.employee_id,
        requester_name=actor.name,
        requester_department=DepartmentEnum.HIGH_VOLTAGE.value,
        requires_approval=False,
        stock_request_id=uuid.uuid4(),
    )
    db_session.add(batch)
    db_session.flush()
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=5,
        quantity_before=0,
        quantity_after=5,
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        operation_batch_id=batch.batch_id,
        inventory_effect=[{"scope": "warehouse", "delta": 5}],
        created_at=datetime.utcnow() - timedelta(hours=1),
    )
    db_session.add(log)
    _activate_legacy_adoption(db_session)
    db_session.commit()

    response = client.post(
        f"/api/inventory/transactions/{log.log_id}/cancel",
        json={
            "reason": "연결 요청 누락 취소 시도",
            "employee_code": actor.employee_code,
            "pin": "0000",
        },
    )

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["message"] == (
        legacy_adoption_svc.INCOMPLETE_LEGACY_EFFECT_MESSAGE
    )
    assert db_session.query(InventoryOperation).count() == 0
    db_session.refresh(log)
    assert log.operation_id is None
    assert log.cancelled is False
    assert inventory_svc.get_or_create_inventory(
        db_session, item.item_id
    ).warehouse_qty == Decimal("5")


def test_operation_detail_exposes_non_inventory_effect_evidence(
    client, db_session, make_item
) -> None:
    _item, _actor, operation, _original_log = _seed_operation(db_session, make_item)
    effect = operation_svc.record_effect(
        db_session,
        operation=operation,
        effect_kind=InventoryOperationEffectKindEnum.RESERVATION,
        subject_type="StockRequest",
        subject_id="SR-EVIDENCE",
        role="WAREHOUSE_PENDING",
        before_state={"quantity": 0},
        after_state={"quantity": 7},
    )
    db_session.commit()

    response = client.get(f"/api/inventory/operations/{operation.operation_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["effects"] == [
        {
            "effect_id": str(effect.effect_id),
            "effect_kind": "RESERVATION",
            "subject_type": "StockRequest",
            "subject_id": "SR-EVIDENCE",
            "role": "WAREHOUSE_PENDING",
            "before_state": {"quantity": 0},
            "after_state": {"quantity": 7},
            "reverses_effect_id": None,
        }
    ]
    assert payload["can_cancel"] is False
    assert payload["cancel_blockers"] == [
        "아직 취소를 지원하지 않는 작업 효과가 포함되어 있습니다."
    ]


def test_legacy_history_api_keeps_original_and_cancellation_operations_separate(
    client, db_session, make_item
) -> None:
    item, actor, operation, original_log = _seed_operation(db_session, make_item)
    item2 = make_item(name="작업 API 하위 자재", warehouse_qty=Decimal("0"))
    original_log.reference_no = "OP-GROUP-1"
    before = inv_effect.snapshot_cells(db_session, item2.item_id)
    inventory_svc.receive_confirmed(
        db_session,
        item2.item_id,
        Decimal("3"),
        bucket="warehouse",
    )
    inventory2 = inventory_svc.get_or_create_inventory(db_session, item2.item_id)
    child_log = operation_svc.attach_transaction(
        TransactionLog(
            item_id=item2.item_id,
            transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=Decimal("3"),
            quantity_before=Decimal("0"),
            quantity_after=inventory2.quantity,
            reference_no="OP-GROUP-1",
            produced_by=actor.name,
            producer_employee_id=actor.employee_id,
            department="창고",
            **inv_effect.capture_log_stock_snapshot(
                db_session,
                item2.item_id,
                before,
            ),
        ),
        operation,
        InventoryOperationRoleEnum.COMPONENT_INPUT,
    )
    db_session.add(child_log)
    db_session.commit()
    preview = client.post(
        f"/api/inventory/operations/{operation.operation_id}/cancel/preview"
    ).json()
    cancelled = client.post(
        f"/api/inventory/operations/{operation.operation_id}/cancel",
        json={
            "reason": "묶음 취소",
            "employee_code": actor.employee_code,
            "pin": "0000",
            "plan_hash": preview["plan_hash"],
        },
    )
    assert cancelled.status_code == 200

    response = client.get("/api/inventory/transactions/display-groups")

    assert response.status_code == 200
    groups = response.json()["groups"]
    assert [group["type"] for group in groups] == ["operation", "operation"]
    assert [len(group["logs"]) for group in groups] == [2, 2]
    cancellation_logs, original_logs = groups[0]["logs"], groups[1]["logs"]
    assert {log["operation_kind"] for log in cancellation_logs} == {"CANCELLATION"}
    assert {log["operation_kind"] for log in original_logs} == {"BUSINESS"}
    assert all(log["cancelled"] is False for log in cancellation_logs)
    assert all(log["operation_effective_status"] == "cancellation" for log in cancellation_logs)
    assert all(log["cancelled"] is True for log in original_logs)
    assert all(log["operation_effective_status"] == "cancelled" for log in original_logs)
    assert all(log["cancel_reason"] == "묶음 취소" for log in original_logs)
    assert {log["operation_role"] for log in original_logs} == {
        "PRIMARY",
        "COMPONENT_INPUT",
    }
    assert {log["reverses_log_id"] for log in cancellation_logs} == {
        str(original_log.log_id),
        str(child_log.log_id),
    }
