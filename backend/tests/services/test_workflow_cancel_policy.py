"""업무별 취소 정책이 원장 역전과 소유 업무 상태를 함께 복원하는 계약."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
import uuid

import pytest

from app.models import (
    DefectInventoryMovement,
    DefectQuarantineRecord,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationEffectKindEnum,
    InventoryOperationRoleEnum,
    IoBatch,
    LocationStatusEnum,
    RequestBucketEnum,
    ShippingAllocation,
    ShippingRequest,
    ShippingRequestEvent,
    ShippingRequestStatusEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    SystemSetting,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import inv_effect
from app.services import inventory as inventory_svc
from app.services import inventory_operation_cancellation as cancellation_svc
from app.services import inventory_operations as operation_svc
from app.services.inv_calc import _sync_total
from app.services.pin_auth import DEFAULT_PIN_HASH


NOW = datetime(2026, 9, 2, 6, 0)


def _actor(db_session, *, code: str = "WF-CANCEL") -> Employee:
    actor = Employee(
        employee_code=code,
        name=f"{code} 작업자",
        role="창고/관리자",
        department="창고",
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


def _activate_ledger(db_session) -> None:
    db_session.add(
        SystemSetting(
            setting_key=operation_svc.CUTOVER_SETTING_KEY,
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.flush()


def _record_warehouse_delta(
    db_session,
    *,
    operation: InventoryOperation,
    item,
    actor: Employee,
    delta: int,
    role: InventoryOperationRoleEnum,
) -> TransactionLog:
    before_cells = inv_effect._snapshot_cells(db_session, item.item_id)
    inventory = inventory_svc._get_or_create_inventory(db_session, item.item_id)
    quantity_before = int(inventory.quantity or 0)
    if delta > 0:
        inventory_svc._receive_confirmed(
            db_session,
            item.item_id,
            Decimal(delta),
            bucket="warehouse",
        )
        transaction_type = TransactionTypeEnum.RECEIVE
    else:
        inventory_svc._consume_warehouse(
            db_session,
            item.item_id,
            Decimal(-delta),
        )
        transaction_type = TransactionTypeEnum.SHIP
    inventory = inventory_svc._get_or_create_inventory(db_session, item.item_id)
    log = operation_svc._attach_transaction(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=transaction_type,
            quantity_change=delta,
            quantity_before=quantity_before,
            quantity_after=int(inventory.quantity or 0),
            produced_by=actor.name,
            producer_employee_id=actor.employee_id,
            department="창고",
            **inv_effect._capture_log_stock_snapshot(
                db_session,
                item.item_id,
                before_cells,
            ),
        ),
        operation,
        role,
    )
    db_session.add(log)
    db_session.flush()
    return log


def _cancel(db_session, operation: InventoryOperation, actor: Employee):
    preview = cancellation_svc.preview_cancellation(
        db_session,
        operation.operation_id,
        now=NOW,
    )
    assert preview.can_cancel is True, preview.blockers
    return cancellation_svc.cancel_operation(
        db_session,
        operation_id=operation.operation_id,
        canceller=actor,
        reason="업무 취소",
        plan_hash=preview.plan_hash,
        now=NOW,
    )


def test_cancel_policy_registry_covers_live_workflow_keys() -> None:
    registry = cancellation_svc.CANCEL_POLICY_REGISTRY

    assert ("shipping", "pickup") in registry
    assert ("production", "receipt") in registry
    assert ("inventory_io", "produce") in registry
    assert ("stock_request", StockRequestTypeEnum.RAW_SHIP.value) in registry
    assert ("stock_request", StockRequestTypeEnum.DEFECT_DISASSEMBLE.value) in registry
    assert ("defect", "rework_defective") in registry
    assert ("shipping", "prepare") not in registry


def test_production_receipt_policy_reverses_the_whole_operation(
    db_session,
    make_item,
) -> None:
    item = make_item(name="생산 취소 제품", warehouse_qty=Decimal("0"))
    actor = _actor(db_session, code="WF-PROD")
    _activate_ledger(db_session)
    operation = operation_svc._create_business_operation(
        db_session,
        domain="production",
        action="receipt",
        display_label="생산",
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
        effective_at=NOW,
    )
    assert operation is not None
    _record_warehouse_delta(
        db_session,
        operation=operation,
        item=item,
        actor=actor,
        delta=5,
        role=InventoryOperationRoleEnum.PRODUCT_OUTPUT,
    )
    db_session.commit()

    reversal = _cancel(db_session, operation, actor)

    db_session.expire_all()
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert int(inventory.warehouse_qty or 0) == 0
    assert reversal.reverses_operation_id == operation.operation_id


def test_completed_io_batch_policy_restores_effect_before_state(
    db_session,
    make_item,
) -> None:
    item = make_item(name="IO 취소 제품", warehouse_qty=Decimal("0"))
    actor = _actor(db_session, code="WF-IO")
    _activate_ledger(db_session)
    batch = IoBatch(
        work_type="process",
        sub_type="produce",
        status="completed",
        requester_employee_id=actor.employee_id,
        requester_name=actor.name,
        requester_department=actor.department,
    )
    db_session.add(batch)
    db_session.flush()
    operation = operation_svc._create_business_operation(
        db_session,
        domain="inventory_io",
        action="produce",
        display_label="생산",
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
        effective_at=NOW,
    )
    assert operation is not None
    _record_warehouse_delta(
        db_session,
        operation=operation,
        item=item,
        actor=actor,
        delta=3,
        role=InventoryOperationRoleEnum.PRODUCT_OUTPUT,
    )
    operation_svc._record_effect(
        db_session,
        operation=operation,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="IoBatch",
        subject_id=batch.batch_id,
        role="EXECUTION_STATUS",
        before_state={"status": "submitted"},
        after_state={"status": "completed"},
    )
    db_session.commit()

    _cancel(db_session, operation, actor)

    db_session.expire_all()
    assert db_session.get(IoBatch, batch.batch_id).status == "submitted"
    reversal_effect = (
        db_session.query(InventoryOperationEffect)
        .filter(InventoryOperationEffect.reverses_effect_id.isnot(None))
        .one()
    )
    assert reversal_effect.after_state == {"status": "submitted"}


def test_stock_request_policy_restores_reserved_pending_from_before_state(
    db_session,
    make_item,
) -> None:
    item = make_item(name="요청 취소 자재", warehouse_qty=Decimal("10"))
    actor = _actor(db_session, code="WF-SR")
    _activate_ledger(db_session)
    request = StockRequest(
        requester_employee_id=actor.employee_id,
        requester_name=actor.name,
        requester_department=actor.department,
        request_type=StockRequestTypeEnum.RAW_SHIP,
        status=StockRequestStatusEnum.COMPLETED,
        requires_warehouse_approval=True,
    )
    db_session.add(request)
    db_session.flush()
    line = StockRequestLine(
        request_id=request.request_id,
        item_id=item.item_id,
        item_name_snapshot=item.item_name,
        quantity=4,
        from_bucket=RequestBucketEnum.WAREHOUSE,
        to_bucket=RequestBucketEnum.NONE,
        status=StockRequestStatusEnum.COMPLETED,
    )
    db_session.add(line)
    operation = operation_svc._create_business_operation(
        db_session,
        domain="stock_request",
        action=StockRequestTypeEnum.RAW_SHIP.value,
        display_label="raw_ship",
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
        effective_at=NOW,
    )
    assert operation is not None
    _record_warehouse_delta(
        db_session,
        operation=operation,
        item=item,
        actor=actor,
        delta=-4,
        role=InventoryOperationRoleEnum.PRIMARY,
    )
    operation_svc._record_effect(
        db_session,
        operation=operation,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="StockRequest",
        subject_id=request.request_id,
        role="EXECUTION_STATUS",
        before_state={"status": StockRequestStatusEnum.RESERVED.value},
        after_state={"status": StockRequestStatusEnum.COMPLETED.value},
    )
    db_session.commit()

    _cancel(db_session, operation, actor)

    db_session.expire_all()
    restored = db_session.get(StockRequest, request.request_id)
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert restored.status == StockRequestStatusEnum.RESERVED
    assert restored.lines[0].status == StockRequestStatusEnum.RESERVED
    assert int(inventory.warehouse_qty or 0) == 10
    assert int(inventory.pending_quantity or 0) == 4


def test_shipping_pickup_policy_restores_request_allocation_and_event(
    db_session,
    make_item,
) -> None:
    item = make_item(name="픽업 취소 제품", warehouse_qty=Decimal("10"))
    actor = _actor(db_session, code="WF-SHIP")
    _activate_ledger(db_session)
    request = ShippingRequest(
        status=ShippingRequestStatusEnum.PICKED_UP,
        base_pf_item_id=item.item_id,
        final_pf_item_id=item.item_id,
        request_quantity=4,
        picked_up_at=NOW,
    )
    db_session.add(request)
    db_session.flush()
    allocation = ShippingAllocation(
        request_id=request.request_id,
        item_id=item.item_id,
        quantity=4,
        status="CONSUMED",
        consumed_at=NOW,
    )
    db_session.add(allocation)
    operation = operation_svc._create_business_operation(
        db_session,
        domain="shipping",
        action="pickup",
        display_label="출하 픽업",
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
        effective_at=NOW,
    )
    assert operation is not None
    _record_warehouse_delta(
        db_session,
        operation=operation,
        item=item,
        actor=actor,
        delta=-4,
        role=InventoryOperationRoleEnum.PRIMARY,
    )
    operation_svc._record_effect(
        db_session,
        operation=operation,
        effect_kind=InventoryOperationEffectKindEnum.ALLOCATION,
        subject_type="ShippingAllocation",
        subject_id=allocation.allocation_id,
        role="CONSUME",
        before_state={"status": "RESERVED"},
        after_state={"status": "CONSUMED"},
    )
    operation_svc._record_effect(
        db_session,
        operation=operation,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="ShippingRequest",
        subject_id=request.request_id,
        role="PICKUP_STATUS",
        before_state={"status": ShippingRequestStatusEnum.PREPARED.value},
        after_state={"status": ShippingRequestStatusEnum.PICKED_UP.value},
    )
    db_session.add(
        ShippingRequestEvent(
            request_id=request.request_id,
            event_type="PICKED_UP",
            actor_employee_id=actor.employee_id,
            actor_employee_code=actor.employee_code,
            actor_name=actor.name,
        )
    )
    db_session.commit()

    _cancel(db_session, operation, actor)

    db_session.expire_all()
    assert db_session.get(ShippingRequest, request.request_id).status == ShippingRequestStatusEnum.PREPARED
    restored_allocation = db_session.get(ShippingAllocation, allocation.allocation_id)
    assert restored_allocation.status == "RESERVED"
    assert restored_allocation.consumed_at is None
    assert [event.event_type for event in db_session.query(ShippingRequestEvent).order_by(ShippingRequestEvent.created_at)] == [
        "PICKED_UP",
        "PICKUP_CANCELLED",
    ]


def test_workflow_cancel_duplicate_has_stable_reason_and_zero_new_mutation(
    db_session,
    make_item,
) -> None:
    item = make_item(name="중복 취소 제품", warehouse_qty=Decimal("0"))
    actor = _actor(db_session, code="WF-DUP")
    _activate_ledger(db_session)
    operation = operation_svc._create_business_operation(
        db_session,
        domain="production",
        action="receipt",
        display_label="생산",
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
        effective_at=NOW,
    )
    assert operation is not None
    _record_warehouse_delta(
        db_session,
        operation=operation,
        item=item,
        actor=actor,
        delta=2,
        role=InventoryOperationRoleEnum.PRODUCT_OUTPUT,
    )
    db_session.commit()
    _cancel(db_session, operation, actor)
    before = (
        db_session.query(InventoryOperation).count(),
        db_session.query(TransactionLog).count(),
    )

    preview = cancellation_svc.preview_cancellation(
        db_session,
        operation.operation_id,
        now=NOW,
    )

    assert preview.can_cancel is False
    assert preview.reason_code == cancellation_svc.WORKFLOW_ALREADY_CANCELLED
    with pytest.raises(cancellation_svc.WorkflowCancellationConflict) as caught:
        cancellation_svc.cancel_operation(
            db_session,
            operation_id=operation.operation_id,
            canceller=actor,
            reason="중복 취소",
            plan_hash=preview.plan_hash,
            now=NOW,
        )
    assert caught.value.reason_code == cancellation_svc.WORKFLOW_ALREADY_CANCELLED
    assert (
        db_session.query(InventoryOperation).count(),
        db_session.query(TransactionLog).count(),
    ) == before


def test_workflow_cancel_after_next_consume_is_dependency_conflict_with_zero_mutation(
    db_session,
    make_item,
) -> None:
    item = make_item(name="후속 소비 제품", warehouse_qty=Decimal("0"))
    actor = _actor(db_session, code="WF-NEXT")
    _activate_ledger(db_session)
    operation = operation_svc._create_business_operation(
        db_session,
        domain="production",
        action="receipt",
        display_label="생산",
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
        effective_at=NOW,
    )
    assert operation is not None
    _record_warehouse_delta(
        db_session,
        operation=operation,
        item=item,
        actor=actor,
        delta=5,
        role=InventoryOperationRoleEnum.PRODUCT_OUTPUT,
    )
    db_session.commit()
    inventory_svc._consume_warehouse(db_session, item.item_id, Decimal("1"))
    db_session.commit()
    before = (
        int(db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty),
        db_session.query(InventoryOperation).count(),
        db_session.query(TransactionLog).count(),
    )

    preview = cancellation_svc.preview_cancellation(
        db_session,
        operation.operation_id,
        now=NOW,
    )

    assert preview.can_cancel is False
    assert preview.reason_code == cancellation_svc.WORKFLOW_DEPENDENCY_CONFLICT
    with pytest.raises(cancellation_svc.WorkflowCancellationConflict) as caught:
        cancellation_svc.cancel_operation(
            db_session,
            operation_id=operation.operation_id,
            canceller=actor,
            reason="후속 소비 뒤 취소",
            plan_hash=preview.plan_hash,
            now=NOW,
        )
    assert caught.value.reason_code == cancellation_svc.WORKFLOW_DEPENDENCY_CONFLICT
    assert (
        int(db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty),
        db_session.query(InventoryOperation).count(),
        db_session.query(TransactionLog).count(),
    ) == before


def test_workflow_cancel_rolls_back_owner_and_ledger_on_midway_failure(
    db_session,
    make_item,
    monkeypatch,
) -> None:
    item = make_item(name="부분 실패 제품", warehouse_qty=Decimal("0"))
    actor = _actor(db_session, code="WF-PARTIAL")
    _activate_ledger(db_session)
    batch = IoBatch(
        work_type="process",
        sub_type="produce",
        status="completed",
        requester_employee_id=actor.employee_id,
        requester_name=actor.name,
        requester_department=actor.department,
    )
    db_session.add(batch)
    db_session.flush()
    operation = operation_svc._create_business_operation(
        db_session,
        domain="inventory_io",
        action="produce",
        display_label="생산",
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
        effective_at=NOW,
    )
    assert operation is not None
    _record_warehouse_delta(
        db_session,
        operation=operation,
        item=item,
        actor=actor,
        delta=3,
        role=InventoryOperationRoleEnum.PRODUCT_OUTPUT,
    )
    operation_svc._record_effect(
        db_session,
        operation=operation,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="IoBatch",
        subject_id=batch.batch_id,
        role="EXECUTION_STATUS",
        before_state={"status": "submitted"},
        after_state={"status": "completed"},
    )
    db_session.commit()
    preview = cancellation_svc.preview_cancellation(db_session, operation.operation_id, now=NOW)
    real_reverse = cancellation_svc._reverse_operation_effect

    def fail_after_owner_restore(*args, **kwargs):
        real_reverse(*args, **kwargs)
        raise RuntimeError("강제 workflow effect 실패")

    monkeypatch.setattr(cancellation_svc, "_reverse_operation_effect", fail_after_owner_restore)

    with pytest.raises(RuntimeError, match="강제 workflow effect 실패"):
        cancellation_svc.cancel_operation(
            db_session,
            operation_id=operation.operation_id,
            canceller=actor,
            reason="부분 실패",
            plan_hash=preview.plan_hash,
            now=NOW,
        )

    db_session.expire_all()
    assert db_session.get(IoBatch, batch.batch_id).status == "completed"
    assert int(db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty) == 3
    assert db_session.query(InventoryOperation).count() == 1
    assert db_session.query(TransactionLog).count() == 1


def test_unsupported_workflow_and_legacy_missing_before_state_fail_closed(
    db_session,
    make_item,
) -> None:
    item = make_item(name="미지원 workflow", warehouse_qty=Decimal("0"))
    actor = _actor(db_session, code="WF-UNSUPPORTED")
    _activate_ledger(db_session)
    batch = IoBatch(
        work_type="future",
        sub_type="future_action",
        status="completed",
        requester_employee_id=actor.employee_id,
        requester_name=actor.name,
        requester_department=actor.department,
    )
    db_session.add(batch)
    db_session.flush()
    operation = operation_svc._create_business_operation(
        db_session,
        domain="future_workflow",
        action="complete",
        display_label="미지원 workflow",
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
        effective_at=NOW,
    )
    assert operation is not None
    _record_warehouse_delta(
        db_session,
        operation=operation,
        item=item,
        actor=actor,
        delta=1,
        role=InventoryOperationRoleEnum.PRIMARY,
    )
    operation_svc._record_effect(
        db_session,
        operation=operation,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="IoBatch",
        subject_id=batch.batch_id,
        role="EXECUTION_STATUS",
        before_state={"status": "submitted"},
        after_state={"status": "completed"},
    )
    db_session.commit()

    unsupported = cancellation_svc.preview_cancellation(db_session, operation.operation_id, now=NOW)
    assert unsupported.can_cancel is False
    assert unsupported.reason_code == cancellation_svc.WORKFLOW_CANCEL_UNSUPPORTED

    legacy = operation_svc._create_business_operation(
        db_session,
        domain="inventory_io",
        action="produce",
        display_label="legacy workflow",
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
        effective_at=NOW,
    )
    assert legacy is not None
    legacy.contract_version = 1
    legacy_batch = IoBatch(
        work_type="process",
        sub_type="produce",
        status="completed",
        requester_employee_id=actor.employee_id,
        requester_name=actor.name,
        requester_department=actor.department,
    )
    db_session.add(legacy_batch)
    db_session.flush()
    _record_warehouse_delta(
        db_session,
        operation=legacy,
        item=item,
        actor=actor,
        delta=1,
        role=InventoryOperationRoleEnum.PRODUCT_OUTPUT,
    )
    operation_svc._record_effect(
        db_session,
        operation=legacy,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="IoBatch",
        subject_id=legacy_batch.batch_id,
        role="EXECUTION_STATUS",
        before_state={"status": None},
        after_state={"status": "completed"},
    )
    db_session.commit()

    legacy_preview = cancellation_svc.preview_cancellation(db_session, legacy.operation_id, now=NOW)
    assert legacy_preview.can_cancel is False
    assert legacy_preview.reason_code == cancellation_svc.WORKFLOW_CANCEL_UNSUPPORTED


def test_shipping_component_change_linked_to_request_fails_closed_without_effect(
    db_session,
    make_item,
) -> None:
    item = make_item(name="출하 구성 변경 우회", warehouse_qty=Decimal("0"))
    actor = _actor(db_session, code="WF-COMPONENT")
    _activate_ledger(db_session)
    request = ShippingRequest(
        status=ShippingRequestStatusEnum.PREPARING,
        base_pf_item_id=item.item_id,
        final_pf_item_id=item.item_id,
        request_quantity=1,
    )
    db_session.add(request)
    db_session.flush()
    operation = operation_svc._create_business_operation(
        db_session,
        domain="shipping",
        action="component_change",
        display_label="출하 구성 변경",
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
        effective_at=NOW,
    )
    assert operation is not None
    log = _record_warehouse_delta(
        db_session,
        operation=operation,
        item=item,
        actor=actor,
        delta=1,
        role=InventoryOperationRoleEnum.PRODUCT_OUTPUT,
    )
    log.shipping_request_id = request.request_id
    log.shipping_phase = "component_change"
    db_session.commit()

    preview = cancellation_svc.preview_cancellation(
        db_session,
        operation.operation_id,
        now=NOW,
    )

    assert preview.can_cancel is False
    assert preview.reason_code == cancellation_svc.WORKFLOW_CANCEL_UNSUPPORTED
    with pytest.raises(cancellation_svc.WorkflowCancellationConflict) as caught:
        cancellation_svc.cancel_operation(
            db_session,
            operation_id=operation.operation_id,
            canceller=actor,
            reason="generic 우회 차단",
            plan_hash=preview.plan_hash,
            now=NOW,
        )
    assert caught.value.reason_code == cancellation_svc.WORKFLOW_CANCEL_UNSUPPORTED
    assert db_session.query(InventoryOperation).filter(
        InventoryOperation.reverses_operation_id == operation.operation_id
    ).count() == 0
    assert db_session.get(TransactionLog, log.log_id).cancelled is False


def test_io_batch_with_another_active_execution_fails_closed(
    db_session,
    make_item,
) -> None:
    first_item = make_item(name="분할 IO 첫 실행", warehouse_qty=Decimal("0"))
    second_item = make_item(name="분할 IO 다음 실행", warehouse_qty=Decimal("0"))
    actor = _actor(db_session, code="WF-IO-SPLIT")
    _activate_ledger(db_session)
    batch = IoBatch(
        work_type="process",
        sub_type="produce",
        status="completed",
        requester_employee_id=actor.employee_id,
        requester_name=actor.name,
        requester_department=actor.department,
    )
    db_session.add(batch)
    db_session.flush()

    requests: list[StockRequest] = []
    for item in (first_item, second_item):
        request = StockRequest(
            requester_employee_id=actor.employee_id,
            requester_name=actor.name,
            requester_department=actor.department,
            request_type=StockRequestTypeEnum.MANUAL_ADJUSTMENT,
            status=StockRequestStatusEnum.COMPLETED,
            requires_warehouse_approval=False,
            operation_batch_id=batch.batch_id,
        )
        db_session.add(request)
        db_session.flush()
        db_session.add(
            StockRequestLine(
                request_id=request.request_id,
                item_id=item.item_id,
                item_name_snapshot=item.item_name,
                quantity=1,
                from_bucket=RequestBucketEnum.NONE,
                to_bucket=RequestBucketEnum.WAREHOUSE,
                status=StockRequestStatusEnum.COMPLETED,
            )
        )
        requests.append(request)
    db_session.flush()

    operations: list[InventoryOperation] = []
    for index, (item, request) in enumerate(
        zip((first_item, second_item), requests, strict=True)
    ):
        operation = operation_svc._create_business_operation(
            db_session,
            domain="inventory_io",
            action="produce",
            display_label=f"분할 IO 실행 {index}",
            actor_name=actor.name,
            actor_employee_id=actor.employee_id,
            effective_at=NOW,
        )
        assert operation is not None
        _record_warehouse_delta(
            db_session,
            operation=operation,
            item=item,
            actor=actor,
            delta=1,
            role=InventoryOperationRoleEnum.PRODUCT_OUTPUT,
        )
        operation_svc._record_effect(
            db_session,
            operation=operation,
            effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type="IoBatch",
            subject_id=batch.batch_id,
            role="EXECUTION_STATUS",
            before_state={
                "status": "submitted" if index == 0 else "partially_completed"
            },
            after_state={"status": "completed"},
        )
        operation_svc._record_effect(
            db_session,
            operation=operation,
            effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type="StockRequest",
            subject_id=request.request_id,
            role="EXECUTION_STATUS",
            before_state={"status": StockRequestStatusEnum.SUBMITTED.value},
            after_state={"status": StockRequestStatusEnum.COMPLETED.value},
        )
        operations.append(operation)
    db_session.commit()

    preview = cancellation_svc.preview_cancellation(
        db_session,
        operations[0].operation_id,
        now=NOW,
    )

    assert preview.can_cancel is False
    assert preview.reason_code == cancellation_svc.WORKFLOW_DEPENDENCY_CONFLICT
    with pytest.raises(cancellation_svc.WorkflowCancellationConflict) as caught:
        cancellation_svc.cancel_operation(
            db_session,
            operation_id=operations[0].operation_id,
            canceller=actor,
            reason="과거 분할 실행 취소 차단",
            plan_hash=preview.plan_hash,
            now=NOW,
        )
    assert caught.value.reason_code == cancellation_svc.WORKFLOW_DEPENDENCY_CONFLICT
    db_session.expire_all()
    assert db_session.get(IoBatch, batch.batch_id).status == "completed"
    assert all(
        db_session.get(StockRequest, request.request_id).status
        == StockRequestStatusEnum.COMPLETED
        for request in requests
    )
    assert db_session.query(InventoryOperation).filter(
        InventoryOperation.reverses_operation_id == operations[0].operation_id
    ).count() == 0


@dataclass(frozen=True)
class _MatrixCase:
    kind: str
    operation_id: uuid.UUID
    actor_id: uuid.UUID
    item_id: uuid.UUID
    owner_id: uuid.UUID | None = None
    secondary_id: uuid.UUID | None = None


_MATRIX_KINDS = (
    "shipping_pickup",
    "production_receipt",
    "io_batch",
    "stock_request",
    "defect_disassembly",
)


def _seed_matrix_case(db_session, make_item, kind: str) -> _MatrixCase:
    outbound = kind in {"shipping_pickup", "stock_request"}
    item = make_item(
        name=f"workflow matrix {kind}",
        warehouse_qty=Decimal("10" if outbound else "0"),
    )
    actor = _actor(db_session, code=f"MATRIX-{kind[:10].upper()}")
    _activate_ledger(db_session)
    domain, action = {
        "shipping_pickup": ("shipping", "pickup"),
        "production_receipt": ("production", "receipt"),
        "io_batch": ("inventory_io", "produce"),
        "stock_request": ("stock_request", StockRequestTypeEnum.RAW_SHIP.value),
        "defect_disassembly": ("defect", "rework_defective"),
    }[kind]
    operation = operation_svc._create_business_operation(
        db_session,
        domain=domain,
        action=action,
        display_label=kind,
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
        effective_at=NOW,
    )
    assert operation is not None
    owner_id = None
    secondary_id = None

    if kind == "defect_disassembly":
        record = DefectQuarantineRecord(
            item_id=item.item_id,
            department=DepartmentEnum.ASSEMBLY.value,
            original_quantity=3,
            remaining_quantity=0,
            quarantined_by_name=actor.name,
        )
        db_session.add(record)
        db_session.flush()
        before_cells = inv_effect._snapshot_cells(db_session, item.item_id)
        inventory_svc._receive_defective(
            db_session,
            item.item_id,
            Decimal("3"),
            DepartmentEnum.ASSEMBLY,
            inventory_svc.ReasonContext(
                category="재작업",
                memo="취소 정책 매트릭스",
                actor=actor.name,
            ),
        )
        record.remaining_quantity = 3
        inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
        db_session.add(
            operation_svc._attach_transaction(
                TransactionLog(
                    item_id=item.item_id,
                    transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
                    quantity_change=3,
                    quantity_before=0,
                    quantity_after=inventory.quantity,
                    produced_by=actor.name,
                    producer_employee_id=actor.employee_id,
                    department=DepartmentEnum.ASSEMBLY.value,
                    defect_quarantine_record_id=record.record_id,
                    **inv_effect._capture_log_stock_snapshot(
                        db_session,
                        item.item_id,
                        before_cells,
                    ),
                ),
                operation,
                InventoryOperationRoleEnum.REWORK_CHILD_DEFECTIVE,
            )
        )
        operation_svc._record_defect_movement(
            db_session,
            operation=operation,
            record_id=record.record_id,
            item_id=item.item_id,
            department=DepartmentEnum.ASSEMBLY.value,
            movement_type="REWORK_CHILD_DEFECTIVE",
            quantity_delta=3,
            role=InventoryOperationRoleEnum.REWORK_CHILD_DEFECTIVE.value,
            actor_name=actor.name,
            actor_employee_id=actor.employee_id,
        )
        owner_id = record.record_id
    else:
        _record_warehouse_delta(
            db_session,
            operation=operation,
            item=item,
            actor=actor,
            delta=-3 if outbound else 3,
            role=InventoryOperationRoleEnum.PRIMARY,
        )

    if kind == "io_batch":
        batch = IoBatch(
            work_type="process",
            sub_type="produce",
            status="completed",
            requester_employee_id=actor.employee_id,
            requester_name=actor.name,
            requester_department=actor.department,
        )
        db_session.add(batch)
        db_session.flush()
        operation_svc._record_effect(
            db_session,
            operation=operation,
            effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type="IoBatch",
            subject_id=batch.batch_id,
            role="EXECUTION_STATUS",
            before_state={"status": "submitted"},
            after_state={"status": "completed"},
        )
        owner_id = batch.batch_id
    elif kind == "stock_request":
        request = StockRequest(
            requester_employee_id=actor.employee_id,
            requester_name=actor.name,
            requester_department=actor.department,
            request_type=StockRequestTypeEnum.RAW_SHIP,
            status=StockRequestStatusEnum.COMPLETED,
            requires_warehouse_approval=True,
        )
        db_session.add(request)
        db_session.flush()
        line = StockRequestLine(
            request_id=request.request_id,
            item_id=item.item_id,
            item_name_snapshot=item.item_name,
            quantity=3,
            from_bucket=RequestBucketEnum.WAREHOUSE,
            to_bucket=RequestBucketEnum.NONE,
            status=StockRequestStatusEnum.COMPLETED,
        )
        db_session.add(line)
        db_session.flush()
        operation_svc._record_effect(
            db_session,
            operation=operation,
            effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type="StockRequest",
            subject_id=request.request_id,
            role="EXECUTION_STATUS",
            before_state={"status": StockRequestStatusEnum.RESERVED.value},
            after_state={"status": StockRequestStatusEnum.COMPLETED.value},
        )
        owner_id = request.request_id
        secondary_id = line.line_id
    elif kind == "shipping_pickup":
        request = ShippingRequest(
            status=ShippingRequestStatusEnum.PICKED_UP,
            base_pf_item_id=item.item_id,
            final_pf_item_id=item.item_id,
            request_quantity=3,
            picked_up_at=NOW,
        )
        db_session.add(request)
        db_session.flush()
        allocation = ShippingAllocation(
            request_id=request.request_id,
            item_id=item.item_id,
            quantity=3,
            status="CONSUMED",
            consumed_at=NOW,
        )
        db_session.add(allocation)
        db_session.flush()
        operation_svc._record_effect(
            db_session,
            operation=operation,
            effect_kind=InventoryOperationEffectKindEnum.ALLOCATION,
            subject_type="ShippingAllocation",
            subject_id=allocation.allocation_id,
            role="CONSUME",
            before_state={"status": "RESERVED"},
            after_state={"status": "CONSUMED"},
        )
        operation_svc._record_effect(
            db_session,
            operation=operation,
            effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type="ShippingRequest",
            subject_id=request.request_id,
            role="PICKUP_STATUS",
            before_state={"status": ShippingRequestStatusEnum.PREPARED.value},
            after_state={"status": ShippingRequestStatusEnum.PICKED_UP.value},
        )
        db_session.add(
            ShippingRequestEvent(
                request_id=request.request_id,
                event_type="PICKED_UP",
                actor_employee_id=actor.employee_id,
                actor_employee_code=actor.employee_code,
                actor_name=actor.name,
            )
        )
        owner_id = request.request_id
        secondary_id = allocation.allocation_id

    db_session.commit()
    return _MatrixCase(
        kind=kind,
        operation_id=operation.operation_id,
        actor_id=actor.employee_id,
        item_id=item.item_id,
        owner_id=owner_id,
        secondary_id=secondary_id,
    )


def _matrix_state(db_session, case: _MatrixCase) -> tuple:
    inventory = db_session.query(Inventory).filter_by(item_id=case.item_id).one()
    owner_state: tuple = ()
    if case.kind == "io_batch":
        batch = db_session.get(IoBatch, case.owner_id)
        owner_state = (batch.status, batch.completed_at)
    elif case.kind == "stock_request":
        request = db_session.get(StockRequest, case.owner_id)
        line = db_session.get(StockRequestLine, case.secondary_id)
        owner_state = (request.status, request.completed_at, line.status)
    elif case.kind == "shipping_pickup":
        request = db_session.get(ShippingRequest, case.owner_id)
        allocation = db_session.get(ShippingAllocation, case.secondary_id)
        events = tuple(
            event_type
            for (event_type,) in db_session.query(ShippingRequestEvent.event_type)
            .filter(ShippingRequestEvent.request_id == case.owner_id)
            .order_by(ShippingRequestEvent.created_at.asc())
            .all()
        )
        owner_state = (
            request.status,
            request.picked_up_at,
            allocation.status,
            allocation.consumed_at,
            events,
        )
    elif case.kind == "defect_disassembly":
        record = db_session.get(DefectQuarantineRecord, case.owner_id)
        location = (
            db_session.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == case.item_id,
                InventoryLocation.department == DepartmentEnum.ASSEMBLY,
                InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
            )
            .one()
        )
        owner_state = (record.remaining_quantity, location.quantity)
    return (
        inventory.quantity,
        inventory.warehouse_qty,
        inventory.pending_quantity,
        owner_state,
        db_session.query(InventoryOperation).count(),
        db_session.query(TransactionLog).count(),
        db_session.query(InventoryOperationEffect).count(),
        db_session.query(DefectInventoryMovement).count(),
    )


def _assert_matrix_restored(db_session, case: _MatrixCase) -> None:
    state = _matrix_state(db_session, case)
    expected_effect_count = {
        "shipping_pickup": 4,
        "production_receipt": 0,
        "io_batch": 2,
        "stock_request": 2,
        "defect_disassembly": 0,
    }[case.kind]
    assert state[4:] == (
        2,
        2,
        expected_effect_count,
        2 if case.kind == "defect_disassembly" else 0,
    )
    if case.kind == "shipping_pickup":
        assert state[:3] == (Decimal("10"), Decimal("10"), Decimal("0"))
        assert state[3][0] == ShippingRequestStatusEnum.PREPARED
        assert state[3][1] is None
        assert state[3][2:4] == ("RESERVED", None)
        assert state[3][4] == ("PICKED_UP", "PICKUP_CANCELLED")
    elif case.kind == "stock_request":
        assert state[:3] == (Decimal("10"), Decimal("10"), Decimal("3"))
        assert state[3] == (
            StockRequestStatusEnum.RESERVED,
            None,
            StockRequestStatusEnum.RESERVED,
        )
    elif case.kind == "io_batch":
        assert state[:3] == (Decimal("0"), Decimal("0"), Decimal("0"))
        assert state[3] == ("submitted", None)
    elif case.kind == "defect_disassembly":
        assert state[:3] == (Decimal("0"), Decimal("0"), Decimal("0"))
        assert state[3] == (Decimal("0"), Decimal("0"))
    else:
        assert state[:3] == (Decimal("0"), Decimal("0"), Decimal("0"))


@pytest.mark.parametrize("kind", _MATRIX_KINDS)
def test_workflow_cancel_matrix_normal_and_duplicate(
    db_session,
    make_item,
    kind,
) -> None:
    case = _seed_matrix_case(db_session, make_item, kind)
    actor = db_session.get(Employee, case.actor_id)
    operation = db_session.get(InventoryOperation, case.operation_id)

    _cancel(db_session, operation, actor)
    db_session.expire_all()
    _assert_matrix_restored(db_session, case)
    before_duplicate = _matrix_state(db_session, case)
    preview = cancellation_svc.preview_cancellation(
        db_session,
        case.operation_id,
        now=NOW,
    )
    assert preview.reason_code == cancellation_svc.WORKFLOW_ALREADY_CANCELLED
    with pytest.raises(cancellation_svc.WorkflowCancellationConflict) as caught:
        cancellation_svc.cancel_operation(
            db_session,
            operation_id=case.operation_id,
            canceller=actor,
            reason="중복 취소",
            plan_hash=preview.plan_hash,
            now=NOW,
        )
    assert caught.value.reason_code == cancellation_svc.WORKFLOW_ALREADY_CANCELLED
    db_session.expire_all()
    assert _matrix_state(db_session, case) == before_duplicate


@pytest.mark.parametrize("kind", _MATRIX_KINDS)
def test_workflow_cancel_matrix_partial_failure_rolls_back_everything(
    db_session,
    make_item,
    monkeypatch,
    kind,
) -> None:
    case = _seed_matrix_case(db_session, make_item, kind)
    actor = db_session.get(Employee, case.actor_id)
    preview = cancellation_svc.preview_cancellation(
        db_session,
        case.operation_id,
        now=NOW,
    )
    before = _matrix_state(db_session, case)

    def fail_final_assertion(*args, **kwargs):
        raise RuntimeError("workflow matrix partial failure")

    monkeypatch.setattr(cancellation_svc, "_assert_plan_applied", fail_final_assertion)
    with pytest.raises(RuntimeError, match="workflow matrix partial failure"):
        cancellation_svc.cancel_operation(
            db_session,
            operation_id=case.operation_id,
            canceller=actor,
            reason="부분 실패",
            plan_hash=preview.plan_hash,
            now=NOW,
        )

    db_session.expire_all()
    assert _matrix_state(db_session, case) == before


@pytest.mark.parametrize("kind", _MATRIX_KINDS)
def test_workflow_cancel_matrix_next_consume_is_dependency_conflict(
    db_session,
    make_item,
    kind,
) -> None:
    case = _seed_matrix_case(db_session, make_item, kind)
    actor = db_session.get(Employee, case.actor_id)
    if kind == "defect_disassembly":
        location = (
            db_session.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == case.item_id,
                InventoryLocation.department == DepartmentEnum.ASSEMBLY,
                InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
            )
            .one()
        )
        location.quantity -= 1
        inventory = db_session.query(Inventory).filter_by(item_id=case.item_id).one()
        _sync_total(db_session, inventory)
    else:
        inventory_svc._consume_warehouse(
            db_session,
            case.item_id,
            Decimal("1"),
        )
    db_session.commit()
    before = _matrix_state(db_session, case)
    preview = cancellation_svc.preview_cancellation(
        db_session,
        case.operation_id,
        now=NOW,
    )

    assert preview.reason_code == cancellation_svc.WORKFLOW_DEPENDENCY_CONFLICT
    with pytest.raises(cancellation_svc.WorkflowCancellationConflict) as caught:
        cancellation_svc.cancel_operation(
            db_session,
            operation_id=case.operation_id,
            canceller=actor,
            reason="후속 소비 뒤 취소",
            plan_hash=preview.plan_hash,
            now=NOW,
        )
    assert caught.value.reason_code == cancellation_svc.WORKFLOW_DEPENDENCY_CONFLICT
    db_session.expire_all()
    assert _matrix_state(db_session, case) == before


def test_workflow_owner_status_drift_is_state_conflict_with_zero_mutation(
    db_session,
    make_item,
) -> None:
    case = _seed_matrix_case(db_session, make_item, "io_batch")
    batch = db_session.get(IoBatch, case.owner_id)
    batch.status = "submitted"
    db_session.commit()
    before = _matrix_state(db_session, case)

    preview = cancellation_svc.preview_cancellation(
        db_session,
        case.operation_id,
        now=NOW,
    )

    assert preview.can_cancel is False
    assert preview.reason_code == cancellation_svc.WORKFLOW_STATE_CONFLICT
    actor = db_session.get(Employee, case.actor_id)
    with pytest.raises(cancellation_svc.WorkflowCancellationConflict) as caught:
        cancellation_svc.cancel_operation(
            db_session,
            operation_id=case.operation_id,
            canceller=actor,
            reason="소유 업무 상태 변경 후 취소",
            plan_hash=preview.plan_hash,
            now=NOW,
        )
    assert caught.value.reason_code == cancellation_svc.WORKFLOW_STATE_CONFLICT
    db_session.expire_all()
    assert _matrix_state(db_session, case) == before
