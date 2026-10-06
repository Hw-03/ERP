"""취소 후 재진행은 과거 취소 상태가 아닌 최신 원장으로 검증한다."""

import uuid
from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from app.models import (
    InventoryOperation, InventoryOperationEffect, InventoryOperationEffectKindEnum,
    InventoryOperationKindEnum, InventoryOperationStatusEnum, ShippingRequest,
    ShippingAllocation, ShippingRequestStatusEnum,
    ShippingRequestEvent, Employee,
)
from app.services.inventory_integrity import diagnose_inventory_integrity
from app.services.inventory_integrity_repair import (
    InventoryIntegrityRepairError, repair_inventory_integrity_issue,
)


def _history(db, make_item, states, *, same_time=False):
    request = ShippingRequest(
        base_pf_item_id=make_item(process_type_code="PF").item_id,
        request_quantity=Decimal("1"), status=ShippingRequestStatusEnum(states[-1]),
    )
    db.add(request)
    db.flush()
    effects = []
    operations = []
    for index, state in enumerate(states):
        cancellation = index % 2 == 1
        operation = InventoryOperation(
            operation_id=uuid.uuid4(), domain="shipping", action="prepare",
            kind=InventoryOperationKindEnum.CANCELLATION if cancellation else InventoryOperationKindEnum.BUSINESS,
            status=InventoryOperationStatusEnum.COMMITTED,
            display_label="test", actor_name="test", contract_version=1,
            created_at=datetime(2026, 9, 1) + timedelta(seconds=0 if same_time else index),
            effective_at=datetime(2026, 9, 1) - timedelta(seconds=index),
            reverses_operation_id=operations[-1].operation_id if cancellation else None,
        )
        db.add(operation)
        db.flush()
        effect = InventoryOperationEffect(
            operation_id=operation.operation_id,
            effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type="ShippingRequest", subject_id=str(request.request_id), role="shipping_request",
            before_state={"status": states[index - 1] if index else "PREPARING"},
            after_state={"status": state},
            reverses_effect_id=effects[-1].effect_id if cancellation else None,
        )
        db.add(effect)
        db.flush()
        operations.append(operation)
        effects.append(effect)
    db.commit()
    return request, operations, effects


def _issues(db):
    return [row for row in diagnose_inventory_integrity(db).issues if row.category == "WORKFLOW_STATE_RESIDUE"]


@pytest.mark.parametrize("states", [
    ["PREPARED", "CANCELLED", "PREPARED"],
    ["PREPARED", "PREPARING", "PREPARED"],
    ["PICKED_UP", "PREPARED", "PICKED_UP"],
    ["PREPARED", "PREPARING", "PREPARED", "PREPARING", "PREPARED"],
])
def test_valid_reprocessing_uses_latest_created_effect(db_session, make_item, states):
    _history(db_session, make_item, states)
    assert _issues(db_session) == []


def test_no_followup_still_requires_cancelled_state(db_session, make_item):
    request, _, _ = _history(db_session, make_item, ["PREPARED", "CANCELLED"])
    request.status = ShippingRequestStatusEnum.PREPARED
    db_session.flush()
    assert len(_issues(db_session)) == 1


def test_latest_business_mismatch_cannot_repair_to_old_cancellation(db_session, make_item):
    request, _, _ = _history(db_session, make_item, ["PREPARED", "CANCELLED", "PREPARED"])
    request.status = ShippingRequestStatusEnum.CANCELLED
    db_session.flush()
    issues = _issues(db_session)
    assert len(issues) == 1
    assert "PREPARED" in issues[0].expected_value
    assert not issues[0].repairable


def test_linked_same_time_cancellation_has_known_order(db_session, make_item):
    _history(db_session, make_item, ["PREPARED", "CANCELLED"], same_time=True)
    assert _issues(db_session) == []


def test_conflicting_same_time_followup_is_not_guessed(db_session, make_item):
    _history(db_session, make_item, ["PREPARED", "CANCELLED", "PREPARED"], same_time=True)
    issues = _issues(db_session)
    assert len(issues) == 1
    assert not issues[0].repairable


def test_stale_repair_id_cannot_revert_reprepared_request(db_session, make_item):
    request, operations, effects = _history(db_session, make_item, ["PREPARED", "CANCELLED", "PREPARED"])
    from app.services.inventory_integrity import _problem_id
    stale_id = _problem_id("WORKFLOW_STATE_RESIDUE", "ShippingRequest", str(request.request_id), operations[1].operation_id)
    with pytest.raises(InventoryIntegrityRepairError):
        repair_inventory_integrity_issue(db_session, problem_id=stale_id, approved_by="test", apply=True)
    assert request.status == ShippingRequestStatusEnum.PREPARED


def test_latest_allocation_effect_ignores_reversed_cancellation_state(db_session, make_item):
    item = make_item(process_type_code="PF")
    request = ShippingRequest(
        base_pf_item_id=item.item_id,
        request_quantity=Decimal("1"),
        status=ShippingRequestStatusEnum.PREPARED,
    )
    db_session.add(request)
    db_session.flush()
    allocation = ShippingAllocation(
        request_id=request.request_id,
        item_id=item.item_id,
        quantity=Decimal("1"),
        status="RELEASED",
    )
    db_session.add(allocation)
    db_session.flush()
    for index, status in enumerate(("RESERVED", "RELEASED")):
        original = InventoryOperation(
            operation_id=uuid.uuid4(),
            domain="shipping",
            action="pickup",
            kind=InventoryOperationKindEnum.BUSINESS,
            status=InventoryOperationStatusEnum.COMMITTED,
            display_label="test",
            actor_name="test",
            contract_version=1,
            created_at=datetime(2026, 9, 1) + timedelta(seconds=index * 2),
            effective_at=datetime(2026, 9, 1) + timedelta(seconds=index * 2),
        )
        db_session.add(original)
        db_session.flush()
        original_effect = InventoryOperationEffect(
            operation_id=original.operation_id,
            effect_kind=InventoryOperationEffectKindEnum.ALLOCATION,
            subject_type="ShippingAllocation",
            subject_id=str(allocation.allocation_id),
            role="shipping_allocation",
            before_state={"status": "RESERVED"},
            after_state={"status": "CONSUMED" if index == 0 else "RESERVED"},
        )
        db_session.add(original_effect)
        db_session.flush()
        operation = InventoryOperation(
            operation_id=uuid.uuid4(),
            domain="shipping",
            action="cancel",
            kind=InventoryOperationKindEnum.CANCELLATION,
            status=InventoryOperationStatusEnum.COMMITTED,
            display_label="test",
            actor_name="test",
            contract_version=1,
            created_at=datetime(2026, 9, 1) + timedelta(seconds=index * 2 + 1),
            effective_at=datetime(2026, 9, 1) + timedelta(seconds=index * 2 + 1),
            reverses_operation_id=original.operation_id,
        )
        db_session.add(operation)
        db_session.flush()
        db_session.add(InventoryOperationEffect(
            operation_id=operation.operation_id,
            effect_kind=InventoryOperationEffectKindEnum.ALLOCATION,
            subject_type="ShippingAllocation",
            subject_id=str(allocation.allocation_id),
            role="shipping_allocation",
            before_state={"status": "CONSUMED" if index == 0 else "RESERVED"},
            after_state={"status": status},
            reverses_effect_id=original_effect.effect_id,
        ))
    db_session.commit()

    issues = [
        row for row in diagnose_inventory_integrity(db_session).issues
        if row.category == "SHIPPING_ALLOCATION_MISMATCH"
    ]

    assert issues == []


def test_request_cancel_after_prepare_reversal_is_consistent(db_session, make_item):
    from app.services.shipping import delete_request

    request, _, _ = _history(db_session, make_item, ["PREPARED", "PREPARING"])
    actor = Employee(employee_code="E900", name="취소자", role="직원", department="출하", is_active="true")
    db_session.add(actor)
    db_session.commit()
    delete_request(db_session, request.request_id, actor)
    db_session.commit()
    assert request.status == ShippingRequestStatusEnum.CANCELLED
    assert request.cancelled_at is not None
    assert request.cancelled_by_employee_id == actor.employee_id
    assert db_session.query(ShippingRequestEvent).filter_by(request_id=request.request_id, event_type="CANCELLED").count() == 1
    assert _issues(db_session) == []


def test_proven_request_cancel_status_can_be_repaired_without_changing_cancel_metadata(db_session, make_item):
    from app.services.shipping import delete_request

    request, _, _ = _history(db_session, make_item, ["PREPARED", "PREPARING"])
    actor = Employee(employee_code="E902", name="cancel actor", role="worker", department="출하", is_active="true")
    db_session.add(actor)
    db_session.commit()
    delete_request(db_session, request.request_id, actor)
    db_session.commit()
    cancellation_metadata = (request.cancelled_at, request.cancelled_by_employee_id, request.cancelled_by_name)
    request.status = ShippingRequestStatusEnum.PREPARING
    db_session.flush()
    issue = _issues(db_session)[0]
    assert issue.expected_value.endswith("CANCELLED")
    assert issue.repairable is True
    repair_inventory_integrity_issue(db_session, problem_id=issue.problem_id, approved_by="test", apply=True)
    db_session.commit()
    assert request.status == ShippingRequestStatusEnum.CANCELLED
    assert (request.cancelled_at, request.cancelled_by_employee_id, request.cancelled_by_name) == cancellation_metadata


@pytest.mark.parametrize("latest", ["PREPARED", "PICKED_UP"])
def test_old_request_cancel_evidence_does_not_override_followup_business_state(db_session, make_item, latest):
    request, _, _ = _history(db_session, make_item, ["PREPARED", "PREPARING", latest])
    actor = Employee(employee_code="E903", name="cancel actor", role="worker", department="출하", is_active="true")
    db_session.add(actor)
    db_session.flush()
    request.cancelled_at = datetime(2026, 9, 2)
    request.cancelled_by_employee_id = actor.employee_id
    request.cancelled_by_name = actor.name
    db_session.add(ShippingRequestEvent(request_id=request.request_id, event_type="CANCELLED", created_at=datetime(2026, 9, 2)))
    db_session.flush()
    assert _issues(db_session) == []


def test_unproven_request_cancel_remains_issue_without_reopening(db_session, make_item):
    request, _, _ = _history(db_session, make_item, ["PREPARED", "PREPARING"])
    request.status = ShippingRequestStatusEnum.CANCELLED
    db_session.flush()
    issues = _issues(db_session)
    assert len(issues) == 1
    assert issues[0].repairable is False
    with pytest.raises(InventoryIntegrityRepairError):
        repair_inventory_integrity_issue(db_session, problem_id=issues[0].problem_id, approved_by="test", apply=True)
    assert request.status == ShippingRequestStatusEnum.CANCELLED


@pytest.mark.parametrize("evidence", ["missing_event", "missing_time", "old_time", "missing_actor"])
def test_stale_or_incomplete_request_cancel_evidence_stays_detectable(db_session, make_item, evidence):
    request, _, _ = _history(db_session, make_item, ["PREPARED", "PREPARING"])
    request.status = ShippingRequestStatusEnum.CANCELLED
    actor = Employee(employee_code="E901", name="cancel actor", role="worker", department="출하", is_active="true")
    db_session.add(actor)
    db_session.flush()
    request.cancelled_at = datetime(2026, 9, 2)
    request.cancelled_by_employee_id = actor.employee_id
    request.cancelled_by_name = "cancel actor"
    if evidence == "missing_time":
        request.cancelled_at = None
    elif evidence == "old_time":
        request.cancelled_at = datetime(2026, 8, 31)
    elif evidence == "missing_actor":
        request.cancelled_by_employee_id = None
    if evidence != "missing_event":
        db_session.add(ShippingRequestEvent(
            request_id=request.request_id, event_type="CANCELLED", created_at=datetime(2026, 9, 2),
        ))
    db_session.flush()
    issues = _issues(db_session)
    assert len(issues) == 1
    assert issues[0].repairable is False
