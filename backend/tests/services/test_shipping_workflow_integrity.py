"""취소 후 재진행은 과거 취소 상태가 아닌 최신 원장으로 검증한다."""

import uuid
from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from app.models import (
    InventoryOperation, InventoryOperationEffect, InventoryOperationEffectKindEnum,
    InventoryOperationKindEnum, InventoryOperationStatusEnum, ShippingRequest,
    ShippingRequestStatusEnum,
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
