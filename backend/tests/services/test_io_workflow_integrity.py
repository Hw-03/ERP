"""입출고 실행 취소 뒤 요청자가 다시 취소한 상태의 정합성 계약."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationEffectKindEnum,
    InventoryOperationKindEnum,
    InventoryOperationStatusEnum,
    IoBatch,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.services.inventory_integrity import diagnose_inventory_integrity
from app.services.inventory_integrity_repair import (
    InventoryIntegrityRepairError,
    repair_inventory_integrity_issue,
)


EFFECT_AT = datetime(2026, 9, 14, 8, 49, 21)


def _workflow_issues(db_session):
    return [
        issue
        for issue in diagnose_inventory_integrity(db_session).issues
        if issue.category == "WORKFLOW_STATE_RESIDUE"
    ]


def _seed_cancelled_io_workflow(
    db_session,
    *,
    primary_cancelled_at: datetime | None,
    second_cancelled_at: datetime | None = None,
):
    employee = Employee(
        employee_code=f"INTEGRITY-{uuid.uuid4().hex[:8]}",
        name="정합성 요청자",
        role="조립/staff",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role="none",
        department_role="none",
        display_order=0,
        is_active=True,
    )
    db_session.add(employee)
    db_session.flush()
    batch = IoBatch(
        work_type="process",
        sub_type="produce",
        status="cancelled",
        requester_employee_id=employee.employee_id,
        requester_name=employee.name,
        requester_department=employee.department.value,
        requires_approval=True,
    )
    db_session.add(batch)
    db_session.flush()

    def add_request(cancelled_at: datetime | None) -> StockRequest:
        request = StockRequest(
            requester_employee_id=employee.employee_id,
            requester_name=employee.name,
            requester_department=employee.department.value,
            request_type=StockRequestTypeEnum.MANUAL_ADJUSTMENT,
            status=StockRequestStatusEnum.CANCELLED,
            requires_warehouse_approval=False,
            requires_department_approval=True,
            operation_batch_id=batch.batch_id,
            cancelled_at=cancelled_at,
        )
        db_session.add(request)
        db_session.flush()
        return request

    primary = add_request(primary_cancelled_at)
    linked = [primary]
    if second_cancelled_at is not None:
        linked.append(add_request(second_cancelled_at))
    batch.stock_request_id = primary.request_id if len(linked) == 1 else None

    original = InventoryOperation(
        operation_id=uuid.uuid4(),
        kind=InventoryOperationKindEnum.BUSINESS,
        domain="inventory_io",
        action="produce",
        status=InventoryOperationStatusEnum.COMMITTED,
        display_label="produce",
        actor_name=employee.name,
        effective_at=EFFECT_AT - timedelta(minutes=5),
        created_at=EFFECT_AT - timedelta(minutes=5),
        contract_version=2,
    )
    cancellation = InventoryOperation(
        operation_id=uuid.uuid4(),
        kind=InventoryOperationKindEnum.CANCELLATION,
        domain="inventory_io",
        action="produce",
        status=InventoryOperationStatusEnum.COMMITTED,
        display_label="produce 취소",
        actor_name=employee.name,
        effective_at=EFFECT_AT,
        created_at=EFFECT_AT,
        contract_version=2,
        reverses_operation_id=original.operation_id,
    )
    db_session.add_all([original, cancellation])
    db_session.flush()
    effects = []
    for subject_type, subject_id in (
        ("IoBatch", batch.batch_id),
        ("StockRequest", primary.request_id),
    ):
        original_effect = InventoryOperationEffect(
            operation_id=original.operation_id,
            effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type=subject_type,
            subject_id=str(subject_id),
            role="EXECUTION_STATUS",
            before_state={"status": "reserved"},
            after_state={"status": "completed"},
            created_at=EFFECT_AT - timedelta(minutes=5),
        )
        db_session.add(original_effect)
        db_session.flush()
        cancellation_effect = InventoryOperationEffect(
            operation_id=cancellation.operation_id,
            effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type=subject_type,
            subject_id=str(subject_id),
            role="EXECUTION_STATUS",
            before_state={"status": "completed"},
            after_state={"status": "reserved"},
            reverses_effect_id=original_effect.effect_id,
            created_at=EFFECT_AT,
        )
        db_session.add(cancellation_effect)
        effects.append(cancellation_effect)
    db_session.commit()
    return batch, primary, linked, effects


def _append_workflow_operation(
    db_session,
    *,
    batch: IoBatch,
    request: StockRequest,
    kind: InventoryOperationKindEnum,
    at: datetime,
    after_status: str,
    reverses_operation: InventoryOperation | None = None,
    reverses_effects: dict[str, InventoryOperationEffect] | None = None,
):
    operation = InventoryOperation(
        operation_id=uuid.uuid4(),
        kind=kind,
        domain="inventory_io",
        action="produce",
        status=InventoryOperationStatusEnum.COMMITTED,
        display_label="produce" if kind == InventoryOperationKindEnum.BUSINESS else "produce 취소",
        actor_name=request.requester_name,
        effective_at=at,
        created_at=at,
        contract_version=2,
        reverses_operation_id=(
            reverses_operation.operation_id if reverses_operation is not None else None
        ),
    )
    db_session.add(operation)
    db_session.flush()
    effects = {}
    before_status = "completed" if after_status == "reserved" else "reserved"
    for subject_type, subject_id in (
        ("IoBatch", batch.batch_id),
        ("StockRequest", request.request_id),
    ):
        effect = InventoryOperationEffect(
            operation_id=operation.operation_id,
            effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type=subject_type,
            subject_id=str(subject_id),
            role="EXECUTION_STATUS",
            before_state={"status": before_status},
            after_state={"status": after_status},
            reverses_effect_id=(
                reverses_effects[subject_type].effect_id
                if reverses_effects is not None
                else None
            ),
            created_at=at,
        )
        db_session.add(effect)
        db_session.flush()
        effects[subject_type] = effect
    return operation, effects


def _seed_twice_reapproved_io_workflow(db_session, *, current_status: str):
    batch, primary, _, initial_cancellation_effects = _seed_cancelled_io_workflow(
        db_session,
        primary_cancelled_at=None,
    )
    first_reapproval, first_reapproval_effects = _append_workflow_operation(
        db_session,
        batch=batch,
        request=primary,
        kind=InventoryOperationKindEnum.BUSINESS,
        at=EFFECT_AT + timedelta(minutes=1),
        after_status="completed",
    )
    _, second_cancellation_effects = _append_workflow_operation(
        db_session,
        batch=batch,
        request=primary,
        kind=InventoryOperationKindEnum.CANCELLATION,
        at=EFFECT_AT + timedelta(minutes=2),
        after_status="reserved",
        reverses_operation=first_reapproval,
        reverses_effects=first_reapproval_effects,
    )
    final_reapproval, final_reapproval_effects = _append_workflow_operation(
        db_session,
        batch=batch,
        request=primary,
        kind=InventoryOperationKindEnum.BUSINESS,
        at=EFFECT_AT + timedelta(minutes=3),
        after_status="completed",
    )
    batch.status = current_status
    primary.status = StockRequestStatusEnum(current_status)
    primary.cancelled_at = None
    db_session.commit()
    return (
        batch,
        primary,
        initial_cancellation_effects,
        second_cancellation_effects,
        final_reapproval,
        final_reapproval_effects,
    )


def test_later_request_cancellation_supersedes_restored_request_and_batch_state(
    db_session,
):
    _seed_cancelled_io_workflow(
        db_session,
        primary_cancelled_at=EFFECT_AT + timedelta(minutes=13),
    )

    assert _workflow_issues(db_session) == []


@pytest.mark.parametrize(
    "cancelled_at",
    [None, EFFECT_AT - timedelta(seconds=1), EFFECT_AT],
)
def test_missing_or_non_later_cancellation_evidence_remains_blocking(
    db_session,
    cancelled_at,
):
    _seed_cancelled_io_workflow(
        db_session,
        primary_cancelled_at=cancelled_at,
    )

    issues = _workflow_issues(db_session)

    assert {issue.cause_ids[2] for issue in issues} == {
        str(subject_id)
        for subject_id in (
            db_session.query(IoBatch.batch_id).one()[0],
            db_session.query(StockRequest.request_id).one()[0],
        )
    }


def test_batch_requires_every_linked_request_to_have_later_cancellation_evidence(
    db_session,
):
    batch, primary, _, _ = _seed_cancelled_io_workflow(
        db_session,
        primary_cancelled_at=EFFECT_AT + timedelta(minutes=13),
        second_cancelled_at=EFFECT_AT - timedelta(seconds=1),
    )

    issues = _workflow_issues(db_session)

    assert [issue.cause_ids[2] for issue in issues] == [str(batch.batch_id)]
    assert all(issue.cause_ids[2] != str(primary.request_id) for issue in issues)


def test_batch_requires_every_linked_request_to_be_cancelled(db_session):
    batch, primary, linked, _ = _seed_cancelled_io_workflow(
        db_session,
        primary_cancelled_at=EFFECT_AT + timedelta(minutes=13),
        second_cancelled_at=EFFECT_AT + timedelta(minutes=13),
    )
    linked[1].status = StockRequestStatusEnum.RESERVED
    db_session.commit()

    issues = _workflow_issues(db_session)

    assert [issue.cause_ids[2] for issue in issues] == [str(batch.batch_id)]
    assert all(issue.cause_ids[2] != str(primary.request_id) for issue in issues)


@pytest.mark.parametrize("subject_type", ["StockRequest", "IoBatch"])
def test_repair_cannot_restore_state_after_later_valid_request_cancellation(
    db_session,
    subject_type,
):
    batch, primary, linked, effects = _seed_cancelled_io_workflow(
        db_session,
        primary_cancelled_at=None,
    )
    issue = next(
        issue
        for issue in _workflow_issues(db_session)
        if issue.cause_ids[2]
        == str(primary.request_id if subject_type == "StockRequest" else batch.batch_id)
    )
    for request in linked:
        request.cancelled_at = EFFECT_AT + timedelta(minutes=13)
    db_session.commit()

    with pytest.raises(InventoryIntegrityRepairError, match="문제 ID를 찾을 수 없습니다"):
        repair_inventory_integrity_issue(
            db_session,
            problem_id=issue.problem_id,
            approved_by="정합성 관리자",
            apply=True,
        )

    db_session.refresh(batch)
    db_session.refresh(primary)
    assert batch.status == "cancelled"
    assert primary.status == StockRequestStatusEnum.CANCELLED
    assert all(effect.after_state == {"status": "reserved"} for effect in effects)


def test_latest_reapproval_effect_supersedes_every_older_cancellation(db_session):
    _seed_twice_reapproved_io_workflow(db_session, current_status="completed")

    assert _workflow_issues(db_session) == []


@pytest.mark.parametrize("subject_type", ["StockRequest", "IoBatch"])
def test_latest_business_state_mismatch_is_blocking_and_not_auto_repairable(
    db_session,
    subject_type,
):
    batch, primary, *_ = _seed_twice_reapproved_io_workflow(
        db_session,
        current_status="reserved",
    )
    subject_id = primary.request_id if subject_type == "StockRequest" else batch.batch_id
    issue = next(
        issue
        for issue in _workflow_issues(db_session)
        if issue.cause_ids[2] == str(subject_id)
    )

    assert issue.expected_value == "최종 상태 completed"
    assert issue.repairable is False
    with pytest.raises(InventoryIntegrityRepairError, match="복구할 수 없습니다"):
        repair_inventory_integrity_issue(
            db_session,
            problem_id=issue.problem_id,
            approved_by="정합성 관리자",
            apply=True,
        )
    assert batch.status == "reserved"
    assert primary.status == StockRequestStatusEnum.RESERVED


def test_same_time_conflicting_latest_io_states_fail_closed(db_session):
    (
        batch,
        primary,
        _,
        _,
        final_reapproval,
        _,
    ) = _seed_twice_reapproved_io_workflow(db_session, current_status="completed")
    _append_workflow_operation(
        db_session,
        batch=batch,
        request=primary,
        kind=InventoryOperationKindEnum.BUSINESS,
        at=final_reapproval.created_at,
        after_status="reserved",
    )
    db_session.commit()

    issues = _workflow_issues(db_session)

    assert len(issues) == 2
    assert all(issue.expected_value == "최종 상태 completed / reserved" for issue in issues)
    assert all(issue.repairable is False for issue in issues)


def _seed_historical_immediate_io_cancellation(db_session):
    employee = Employee(
        employee_code=f"IMMEDIATE-{uuid.uuid4().hex[:8]}",
        name="즉시 취소 담당자",
        role="창고/staff",
        department=DepartmentEnum.WAREHOUSE,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role="primary",
        department_role="none",
        display_order=0,
        is_active=True,
    )
    db_session.add(employee)
    db_session.flush()
    batch = IoBatch(
        work_type="receive",
        sub_type="receive_supplier",
        status="submitted",
        requester_employee_id=employee.employee_id,
        requester_name=employee.name,
        requester_department=employee.department.value,
        requires_approval=False,
    )
    original = InventoryOperation(
        operation_id=uuid.uuid4(),
        kind=InventoryOperationKindEnum.BUSINESS,
        domain="inventory_io",
        action="receive_supplier",
        status=InventoryOperationStatusEnum.COMMITTED,
        display_label="receive_supplier",
        actor_name=employee.name,
        effective_at=EFFECT_AT - timedelta(minutes=5),
        created_at=EFFECT_AT - timedelta(minutes=5),
        contract_version=2,
    )
    cancellation = InventoryOperation(
        operation_id=uuid.uuid4(),
        kind=InventoryOperationKindEnum.CANCELLATION,
        domain="inventory_io",
        action="receive_supplier",
        status=InventoryOperationStatusEnum.COMMITTED,
        display_label="receive_supplier 취소",
        actor_name=employee.name,
        effective_at=EFFECT_AT,
        created_at=EFFECT_AT,
        contract_version=2,
        reverses_operation_id=original.operation_id,
    )
    db_session.add_all([batch, original, cancellation])
    db_session.flush()
    original_effect = InventoryOperationEffect(
        operation_id=original.operation_id,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="IoBatch",
        subject_id=str(batch.batch_id),
        role="EXECUTION_STATUS",
        before_state={"status": "submitted"},
        after_state={"status": "completed"},
        created_at=EFFECT_AT - timedelta(minutes=5),
    )
    db_session.add(original_effect)
    db_session.flush()
    cancellation_effect = InventoryOperationEffect(
        operation_id=cancellation.operation_id,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="IoBatch",
        subject_id=str(batch.batch_id),
        role="EXECUTION_STATUS",
        before_state={"status": "completed"},
        after_state={"status": "submitted"},
        reverses_effect_id=original_effect.effect_id,
        created_at=EFFECT_AT,
    )
    db_session.add(cancellation_effect)
    db_session.commit()
    return batch, original, cancellation, original_effect, cancellation_effect


def test_historical_immediate_io_cancellation_requires_terminal_cancelled_state(
    db_session,
):
    batch, _, cancellation, _, cancellation_effect = (
        _seed_historical_immediate_io_cancellation(db_session)
    )

    issues = _workflow_issues(db_session)

    assert len(issues) == 1
    assert issues[0].cause_ids == [
        str(cancellation.operation_id),
        str(cancellation_effect.effect_id),
        str(batch.batch_id),
    ]
    assert issues[0].current_value == "현재 상태 submitted"
    assert issues[0].expected_value == "최종 상태 cancelled"
    assert issues[0].repairable is True


def test_historical_immediate_io_repair_changes_only_batch_terminal_state(
    db_session,
    make_item,
):
    item = make_item(name="즉시 취소 재고 보존", warehouse_qty=7)
    batch, original, cancellation, original_effect, cancellation_effect = (
        _seed_historical_immediate_io_cancellation(db_session)
    )
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    inventory_before = (
        inventory.quantity,
        inventory.warehouse_qty,
        inventory.pending_quantity,
    )
    ledger_before = (
        original.reverses_operation_id,
        cancellation.reverses_operation_id,
        dict(original_effect.before_state),
        dict(original_effect.after_state),
        cancellation_effect.reverses_effect_id,
        dict(cancellation_effect.before_state),
        dict(cancellation_effect.after_state),
    )
    issue = _workflow_issues(db_session)[0]

    report = repair_inventory_integrity_issue(
        db_session,
        problem_id=issue.problem_id,
        approved_by="정합성 관리자",
        apply=True,
    )
    db_session.commit()

    db_session.refresh(batch)
    db_session.refresh(inventory)
    db_session.refresh(original)
    db_session.refresh(cancellation)
    db_session.refresh(original_effect)
    db_session.refresh(cancellation_effect)
    assert report.after_value == "최종 상태 cancelled"
    assert batch.status == "cancelled"
    assert (
        inventory.quantity,
        inventory.warehouse_qty,
        inventory.pending_quantity,
    ) == inventory_before
    assert (
        original.reverses_operation_id,
        cancellation.reverses_operation_id,
        original_effect.before_state,
        original_effect.after_state,
        cancellation_effect.reverses_effect_id,
        cancellation_effect.before_state,
        cancellation_effect.after_state,
    ) == ledger_before
    assert _workflow_issues(db_session) == []


@pytest.mark.parametrize(
    ("requires_approval", "link_kind"),
    [
        (True, None),
        (False, "operation_batch_id"),
        (False, "stock_request_id"),
    ],
)
def test_historical_terminal_override_requires_confirmed_immediate_batch(
    db_session,
    requires_approval,
    link_kind,
):
    batch, *_ = _seed_historical_immediate_io_cancellation(db_session)
    batch.requires_approval = requires_approval
    if link_kind is not None:
        request = StockRequest(
            requester_employee_id=batch.requester_employee_id,
            requester_name=batch.requester_name,
            requester_department=batch.requester_department,
            request_type=StockRequestTypeEnum.MANUAL_ADJUSTMENT,
            status=StockRequestStatusEnum.RESERVED,
            requires_warehouse_approval=False,
            requires_department_approval=True,
            operation_batch_id=(
                batch.batch_id if link_kind == "operation_batch_id" else None
            ),
        )
        db_session.add(request)
        db_session.flush()
        if link_kind == "stock_request_id":
            batch.stock_request_id = request.request_id
    db_session.commit()

    batch_issues = [
        issue
        for issue in _workflow_issues(db_session)
        if issue.cause_ids[2] == str(batch.batch_id)
    ]

    assert batch.status == "submitted"
    assert batch_issues == []
