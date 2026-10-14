"""Observed stock stays fixed when a mistaken shipping workflow is corrected."""
import uuid

import pytest

from app import models
from app.services import inventory_operations, stocktake
from app.services.inventory_conflicts import InventoryConflict
from app.services.inventory_operation_cancellation import preview_cancellation
from tests.services.test_stocktake_application import apply, confirm, preview
from tests.services.test_stocktake_counts import setup_round


def execute(db, actor, kind, payload, key=None):
    return stocktake.execute(db, actor, "correction_" + kind, key or str(uuid.uuid4()), payload)


def shipping_source(db, make_item, *, reserved=False):
    env = setup_round(db, make_item)
    _, actor, item, *_ = env
    request = models.ShippingRequest(base_pf_item_id=item.item_id,
        status=models.ShippingRequestStatusEnum.PREPARED if reserved else models.ShippingRequestStatusEnum.PICKED_UP)
    db.add(request)
    db.flush()
    allocation = models.ShippingAllocation(request_id=request.request_id, item_id=item.item_id,
        quantity=2, department=None, status="RESERVED" if reserved else "CONSUMED")
    db.add(allocation)
    db.flush()
    operation = inventory_operations.create_business_operation(db, domain="shipping",
        action="prepare" if reserved else "pickup", display_label="Source", actor_name=actor.name,
        actor_employee_id=actor.employee_id)
    log = models.TransactionLog(item_id=item.item_id, transaction_type=models.TransactionTypeEnum.RECEIVE,
        quantity_change=-1, quantity_before=11, quantity_after=10,
        shipping_request_id=request.request_id, shipping_phase=operation.action,
        inventory_effect=[{"scope": "warehouse", "delta": -1}])
    db.add(inventory_operations.attach_transaction(log, operation, models.InventoryOperationRoleEnum.PRIMARY))
    for subject, kind, before, after in (
        (request, "WORKFLOW", "PREPARING", request.status.value),
        (allocation, "ALLOCATION", "RESERVED", allocation.status),
    ):
        inventory_operations.record_effect(db, operation=operation, effect_kind=kind,
            subject_type=type(subject).__name__, subject_id=request.request_id if kind == "WORKFLOW" else allocation.allocation_id,
            role="SOURCE", before_state={"status": before}, after_state={"status": after})
    db.commit()
    apply(db, env, preview(db, env, confirm(db, env)))
    return env, request, allocation, operation, log


def requested(db, env, operation, *, target="PREPARING"):
    return execute(db, env[1], "request", {"source_type": "InventoryOperation", "source_id": str(operation.operation_id),
        "target_status": target, "reason": "Wrong completion recorded", "evidence": "Dispatch record checked; no actual movement"})


def approval_preview(db, actor, correction):
    return execute(db, actor, "preview", {"correction_id": correction["correction_id"], "expected_version": correction["version"]})


def approve(db, actor, correction, plan, *, key=None):
    return execute(db, actor, "approve", {"correction_id": correction["correction_id"], "expected_version": correction["version"],
        "preview_id": plan["preview_id"], "preview_hash": plan["preview_hash"]}, key)


def test_consumed_allocation_correction_preserves_observed_stock_and_replays(db_session, make_item):
    env, request, allocation, operation, log = shipping_source(db_session, make_item)
    correction = requested(db_session, env, operation)
    plan = approval_preview(db_session, env[1], correction)
    key = str(uuid.uuid4())
    result = approve(db_session, env[1], correction, plan, key=key)
    assert result["status"] == "APPLIED"
    assert approve(db_session, env[1], correction, plan, key=key) == result
    assert request.status == models.ShippingRequestStatusEnum.PREPARING
    assert allocation.status == "RELEASED"
    inventory = db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one()
    assert inventory.warehouse_qty == 10 and inventory.pending_quantity == 0
    assert not log.cancelled and db_session.query(models.TransactionLog).count() == 1
    corrected = db_session.get(models.InventoryOperation, uuid.UUID(result["operation_id"]))
    assert corrected.kind == models.InventoryOperationKindEnum.BUSINESS
    assert corrected.action == "business_correction" and corrected.reverses_operation_id is None
    assert preview_cancellation(db_session, operation.operation_id).blocker_code == "BUSINESS_CORRECTED"


def test_reserved_release_allowed_during_recount_without_releasing_request_pending(db_session, make_item):
    env, request, allocation, operation, _ = shipping_source(db_session, make_item, reserved=True)
    target = db_session.get(models.StocktakeTarget, uuid.UUID(env[4]["target_id"]))
    count = stocktake.execute(db_session, env[1], "count_start", str(uuid.uuid4()), {
        "target_id": str(target.target_id), "expected_target_version": target.version, "round_epoch": env[3]["epoch"]})
    correction = requested(db_session, env, operation, target="CANCELLED")
    result = approve(db_session, env[1], correction, approval_preview(db_session, env[1], correction))
    gate = db_session.get(models.StocktakeGate, (env[2].item_id, "warehouse"))
    assert gate.active_count_id == uuid.UUID(count["count_id"])
    assert gate.reservation_revision == 1 and gate.observation_epoch == 1
    assert request.status == models.ShippingRequestStatusEnum.CANCELLED and allocation.status == "RELEASED"
    assert db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one().warehouse_qty == 10
    assert result["status"] == "APPLIED"


@pytest.mark.parametrize("decision,status", [("reject", "REJECTED"), ("withdraw", "WITHDRAWN")])
def test_reject_or_withdraw_keeps_workflow_and_records_reason(db_session, make_item, decision, status):
    env, request, allocation, operation, _ = shipping_source(db_session, make_item)
    correction = requested(db_session, env, operation)
    result = execute(db_session, env[1], decision, {"correction_id": correction["correction_id"],
        "expected_version": correction["version"], "reason": "Evidence needs revision"})
    assert result["status"] == status
    assert request.status == models.ShippingRequestStatusEnum.PICKED_UP and allocation.status == "CONSUMED"
    events = db_session.query(models.BusinessCorrectionEvent).filter_by(correction_id=uuid.UUID(correction["correction_id"])).all()
    assert [e.kind for e in events] == ["REQUESTED", status]
    assert events[-1].payload["reason"] == "Evidence needs revision"


def test_changed_workflow_requires_new_request(db_session, make_item):
    env, request, _, operation, _ = shipping_source(db_session, make_item)
    correction = requested(db_session, env, operation)
    request.status = models.ShippingRequestStatusEnum.PREPARED
    db_session.commit()
    with pytest.raises(InventoryConflict) as error:
        approval_preview(db_session, env[1], correction)
    assert error.value.code == "CORRECTION_SCOPE_CHANGED"


def test_physical_change_requires_new_preview_but_not_a_new_request(db_session, make_item):
    env, _, _, operation, _ = shipping_source(db_session, make_item)
    correction = requested(db_session, env, operation)
    first = approval_preview(db_session, env[1], correction)
    from app.services import inventory
    from app.services._tx import transactional
    with transactional(db_session):
        inventory.receive_confirmed(db_session, env[2].item_id, 1)
    with pytest.raises(InventoryConflict) as error:
        approve(db_session, env[1], correction, first)
    assert error.value.code == "PREVIEW_STALE"
    second = approval_preview(db_session, env[1], correction)
    assert approve(db_session, env[1], correction, second)["status"] == "APPLIED"
    assert db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one().warehouse_qty == 11
