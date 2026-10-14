"""Corrections preserve whole-source lineage and atomic business state."""

import uuid
from datetime import timedelta

import pytest

from app import models
from app.services import business_corrections, inventory_operations, shipping_workflow_operations, stock_availability
from app.services.inventory_conflicts import InventoryConflict
from app.services.inventory_integrity import diagnose_inventory_integrity
from app.services.inventory_integrity_repair import repair_inventory_integrity_issue
from tests.services.test_business_corrections import (
    approval_preview, approve, execute, requested, shipping_source,
)
from tests.services.test_stocktake_application import apply, confirm, preview
from tests.services.test_stocktake_counts import setup_round


def test_second_effect_failure_rolls_back_allocation_root_operation_and_receipt(
    db_session, make_item, monkeypatch,
):
    env, request, allocation, source, log = shipping_source(db_session, make_item)
    correction = requested(db_session, env, source)
    plan = approval_preview(db_session, env[1], correction)
    key = str(uuid.uuid4())
    before_operation_count = db_session.query(models.InventoryOperation).count()
    before_effect_count = db_session.query(models.InventoryOperationEffect).count()
    original = business_corrections._record
    calls = 0

    def fail_after_first_record(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("injected second effect failure")
        return original(*args, **kwargs)

    monkeypatch.setattr(business_corrections, "_record", fail_after_first_record)
    with pytest.raises(RuntimeError, match="second effect failure"):
        approve(db_session, env[1], correction, plan, key=key)
    assert calls == 2
    db_session.expire_all()
    assert request.status == models.ShippingRequestStatusEnum.PICKED_UP
    assert allocation.status == "CONSUMED"
    assert not log.cancelled
    assert db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one().warehouse_qty == 10
    assert db_session.get(models.BusinessCorrection, uuid.UUID(correction["correction_id"])).status == "REQUESTED"
    assert db_session.query(models.InventoryOperation).count() == before_operation_count
    assert db_session.query(models.InventoryOperationEffect).count() == before_effect_count
    assert db_session.query(models.BusinessCorrectionSource).count() == 0
    assert db_session.query(models.StocktakeReceipt).filter_by(
        command_kind="correction_approve", idempotency_key=key).count() == 0


def test_approval_replay_and_distinct_key_cannot_apply_same_correction_twice(db_session, make_item):
    env, request, allocation, source, _ = shipping_source(db_session, make_item)
    correction = requested(db_session, env, source)
    plan = approval_preview(db_session, env[1], correction)
    key = str(uuid.uuid4())
    first = approve(db_session, env[1], correction, plan, key=key)
    assert approve(db_session, env[1], correction, plan, key=key) == first
    with pytest.raises(InventoryConflict) as error:
        approve(db_session, env[1], correction, plan, key=str(uuid.uuid4()))
    assert error.value.code == "CORRECTION_VERSION_CONFLICT"
    assert db_session.query(models.InventoryOperation).filter_by(action="business_correction").count() == 1
    assert db_session.query(models.BusinessCorrectionEvent).filter_by(
        correction_id=uuid.UUID(correction["correction_id"]), kind="APPLIED").count() == 1
    assert request.status == models.ShippingRequestStatusEnum.PREPARING
    assert allocation.status == "RELEASED"


def test_corrected_pickup_is_not_active_and_new_prepare_has_own_operation_id(db_session, make_item):
    env, request, allocation, source, _ = shipping_source(db_session, make_item)
    prior_prepare = inventory_operations.create_business_operation(
        db_session, domain="shipping", action="prepare", display_label="Prior prepare",
        actor_name=env[1].name, actor_employee_id=env[1].employee_id,
    )
    prior_prepare.created_at = source.created_at - timedelta(seconds=1)
    prior_prepare.effective_at = source.effective_at - timedelta(seconds=1)
    inventory_operations.record_effect(db_session, operation=prior_prepare,
        effect_kind=models.InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="ShippingRequest", subject_id=request.request_id,
        role="PREPARE_STATUS", before_state={"status": "PREPARING"},
        after_state={"status": "PREPARED"})
    db_session.commit()
    correction = requested(db_session, env, source)
    approve(db_session, env[1], correction, approval_preview(db_session, env[1], correction))

    assert shipping_workflow_operations.latest_operation(db_session, request.request_id,
        "pickup", active_only=True) is None
    assert shipping_workflow_operations.latest_operation(db_session, request.request_id,
        "prepare", active_only=True) is None
    assert shipping_workflow_operations.latest_operation(db_session, request.request_id,
        "pickup", active_only=False).operation_id == source.operation_id
    assert shipping_workflow_operations.latest_operation(db_session, request.request_id,
        "prepare", active_only=False).operation_id == prior_prepare.operation_id
    next_key = shipping_workflow_operations.next_operation_key(db_session, request.request_id, "prepare")
    assert next_key == f"shipping:{request.request_id}:prepare:after:{prior_prepare.operation_id}"

    next_operation = inventory_operations.create_business_operation(
        db_session, domain="shipping", action="prepare", display_label="New prepare",
        actor_name=env[1].name, actor_employee_id=env[1].employee_id,
        idempotency_key=next_key,
    )
    inventory_operations.record_effect(db_session, operation=next_operation,
        effect_kind=models.InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="ShippingRequest", subject_id=request.request_id,
        role="PREPARE_STATUS", before_state={"status": "PREPARING"},
        after_state={"status": "PREPARED"})
    db_session.commit()
    assert next_operation.operation_id != source.operation_id
    assert shipping_workflow_operations.latest_operation(db_session, request.request_id,
        "prepare", active_only=True).operation_id == next_operation.operation_id
    assert shipping_workflow_operations.latest_operation(db_session, request.request_id,
        "pickup", active_only=True) is None


def _legacy_shipping_source(db, make_item):
    env = setup_round(db, make_item)
    item = env[2]
    stock = db.query(models.Inventory).filter_by(item_id=item.item_id).one()
    stock.warehouse_qty = stock.quantity = 11
    db.flush()
    request = models.ShippingRequest(base_pf_item_id=item.item_id,
        status=models.ShippingRequestStatusEnum.PICKED_UP)
    db.add(request)
    db.flush()
    allocation = models.ShippingAllocation(request_id=request.request_id, item_id=item.item_id,
        quantity=2, department=None, status="CONSUMED")
    db.add(allocation)
    stock.warehouse_qty = stock.quantity = 10
    log = models.TransactionLog(item_id=item.item_id, transaction_type=models.TransactionTypeEnum.SHIP,
        quantity_change=-1, quantity_before=11, quantity_after=10,
        shipping_request_id=request.request_id, shipping_phase="pickup",
        inventory_effect=[{"scope": "warehouse", "delta": -1}])
    db.add(log)
    db.commit()
    apply(db, env, preview(db, env, confirm(db, env)))
    return env, request, allocation, log


def test_legacy_source_cannot_be_corrected_twice_after_observed_application(db_session, make_item):
    env, request, allocation, log = _legacy_shipping_source(db_session, make_item)
    source = {"source_type": "ShippingRequest", "source_id": str(request.request_id),
        "target_status": "PREPARING", "reason": "Incorrect pickup",
        "evidence": "Document and whole legacy shipping log verified"}
    first = execute(db_session, env[1], "request", source)
    second = execute(db_session, env[1], "request", source)
    assert first["correction_id"] != second["correction_id"]
    approve(db_session, env[1], first, approval_preview(db_session, env[1], first))
    assert db_session.get(models.BusinessCorrectionSource, ("transaction", log.log_id)).correction_id == uuid.UUID(first["correction_id"])
    with pytest.raises(InventoryConflict) as error:
        approval_preview(db_session, env[1], second)
    assert error.value.code in {"BUSINESS_CORRECTED", "CORRECTION_SCOPE_CHANGED", "CORRECTION_HELD"}
    assert db_session.get(models.BusinessCorrection, uuid.UUID(second["correction_id"])).status == "REQUESTED"
    assert db_session.query(models.InventoryOperation).filter_by(action="business_correction").count() == 1


def test_integrity_repairs_to_correction_effect_with_equal_operation_times(db_session, make_item):
    env, request, allocation, source, log = shipping_source(db_session, make_item)
    correction = requested(db_session, env, source)
    result = approve(db_session, env[1], correction, approval_preview(db_session, env[1], correction))
    corrected = db_session.get(models.InventoryOperation, uuid.UUID(result["operation_id"]))
    source_effects = {effect.effect_id for effect in db_session.query(models.InventoryOperationEffect)
                      .filter_by(operation_id=source.operation_id).all()}
    links = db_session.query(models.BusinessCorrectionEffectLink).filter_by(
        correction_id=uuid.UUID(correction["correction_id"])).all()
    assert {link.source_effect_id for link in links} == source_effects
    assert {db_session.get(models.InventoryOperationEffect, link.correction_effect_id).operation_id
            for link in links} == {corrected.operation_id}
    corrected.created_at = source.created_at
    request.status = models.ShippingRequestStatusEnum.PICKED_UP
    allocation.status = "CONSUMED"
    db_session.commit()

    issues = [issue for issue in diagnose_inventory_integrity(db_session).issues
              if issue.category in {"WORKFLOW_STATE_RESIDUE", "SHIPPING_ALLOCATION_MISMATCH"}]
    assert {issue.category for issue in issues} == {"WORKFLOW_STATE_RESIDUE", "SHIPPING_ALLOCATION_MISMATCH"}
    assert all(issue.repairable for issue in issues)
    assert all(issue.cause_ids[0] == str(corrected.operation_id) for issue in issues)
    for issue in issues:
        report = repair_inventory_integrity_issue(db_session, problem_id=issue.problem_id,
                                                   approved_by="Test admin", apply=True)
        db_session.commit()
        assert report.applied
    assert request.status == models.ShippingRequestStatusEnum.PREPARING
    assert allocation.status == "RELEASED"
    assert not log.cancelled
    assert db_session.query(models.TransactionLog).count() == 1
    assert not [issue for issue in diagnose_inventory_integrity(db_session).issues
                if issue.category in {"WORKFLOW_STATE_RESIDUE", "SHIPPING_ALLOCATION_MISMATCH"}]


def _batch(db, actor, *, status="completed"):
    batch = models.IoBatch(work_type="process", sub_type="adjust_out", status=status,
        requester_employee_id=actor.employee_id, requester_name=actor.name,
        requester_department="창고", requires_approval=True)
    db.add(batch)
    db.flush()
    return batch


def _stock_request(db, actor, item, batch, *, code):
    request = models.StockRequest(request_code=code,
        requester_employee_id=actor.employee_id, requester_name=actor.name,
        requester_department="창고", request_type=models.StockRequestTypeEnum.MANUAL_ADJUSTMENT,
        status=models.StockRequestStatusEnum.COMPLETED, operation_batch_id=batch.batch_id)
    db.add(request)
    db.flush()
    db.add(models.StockRequestLine(request_id=request.request_id, item_id=item.item_id,
        item_name_snapshot=item.item_name, quantity=1,
        from_bucket=models.RequestBucketEnum.WAREHOUSE,
        to_bucket=models.RequestBucketEnum.NONE,
        status=models.StockRequestStatusEnum.COMPLETED))
    db.flush()
    return request


def _native_effect(db, actor, item, *, root, phase, before_quantity):
    operation = inventory_operations.create_business_operation(db,
        domain="inventory_io", action="execute", display_label="Independent request",
        actor_name=actor.name, actor_employee_id=actor.employee_id)
    inventory_operations.record_effect(db, operation=operation,
        effect_kind=models.InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type=type(root).__name__,
        subject_id=getattr(root, "request_id", None) or root.batch_id,
        role="PRIMARY", before_state={"status": "submitted"},
        after_state={"status": root.status.value if hasattr(root.status, "value") else root.status})
    log = models.TransactionLog(item_id=item.item_id,
        transaction_type=models.TransactionTypeEnum.ADJUST,
        quantity_change=-1, quantity_before=before_quantity,
        quantity_after=before_quantity - 1,
        inventory_effect=[{"scope": "warehouse", "delta": -1}],
        department="창고", reference_no=phase)
    db.add(inventory_operations.attach_transaction(log, operation, models.InventoryOperationRoleEnum.PRIMARY))
    return operation


def test_one_independent_request_correction_leaves_sibling_completed_and_batch_partial(db_session, make_item):
    env = setup_round(db_session, make_item)
    actor, item = env[1], env[2]
    batch = _batch(db_session, actor)
    first = _stock_request(db_session, actor, item, batch, code="CORR-BATCH-1")
    second = _stock_request(db_session, actor, item, batch, code="CORR-BATCH-2")
    stock = db_session.query(models.Inventory).filter_by(item_id=item.item_id).one()
    stock.warehouse_qty = stock.quantity = 12
    db_session.flush()
    first_operation = _native_effect(db_session, actor, item, root=first, phase="CORR-BATCH-1", before_quantity=12)
    stock.warehouse_qty = stock.quantity = 11
    db_session.flush()
    second_operation = _native_effect(db_session, actor, item, root=second, phase="CORR-BATCH-2", before_quantity=11)
    stock.warehouse_qty = stock.quantity = 10
    db_session.commit()
    apply(db_session, env, preview(db_session, env, confirm(db_session, env)))

    correction = requested(db_session, env, first_operation, target="CANCELLED")
    approve(db_session, actor, correction, approval_preview(db_session, actor, correction))
    db_session.refresh(first)
    db_session.refresh(second)
    db_session.refresh(batch)
    assert first.status == models.StockRequestStatusEnum.CANCELLED
    assert second.status == models.StockRequestStatusEnum.COMPLETED
    assert batch.status == "partially_completed"
    assert db_session.query(models.BusinessCorrectionSource).filter_by(
        source_kind="operation", source_id=second_operation.operation_id).count() == 0
    assert stock.warehouse_qty == 10 and stock.quantity == 10


@pytest.mark.parametrize("batch_status,allowed", [
    ("draft", False), ("submitted", False), ("completed", True),
])
def test_batch_only_native_workflow_requires_completed_root(
    db_session, make_item, batch_status, allowed,
):
    env = setup_round(db_session, make_item)
    actor, item = env[1], env[2]
    batch = _batch(db_session, actor, status=batch_status)
    stock = db_session.query(models.Inventory).filter_by(item_id=item.item_id).one()
    stock.warehouse_qty = stock.quantity = 11
    db_session.flush()
    operation = _native_effect(db_session, actor, item, root=batch,
                               phase="BATCH-ONLY", before_quantity=11)
    stock.warehouse_qty = stock.quantity = 10
    db_session.commit()
    apply(db_session, env, preview(db_session, env, confirm(db_session, env)))

    if allowed:
        correction = requested(db_session, env, operation, target="CANCELLED")
        assert correction["status"] == "REQUESTED"
    else:
        with pytest.raises(InventoryConflict) as error:
            requested(db_session, env, operation, target="CANCELLED")
        assert error.value.code == "CORRECTION_HELD"
        assert db_session.query(models.BusinessCorrection).count() == 0


def test_warehouse_allocation_residue_repair_releases_reservation_without_stock_change(db_session, make_item):
    env, request, allocation, source, log = shipping_source(db_session, make_item, reserved=True)
    correction = requested(db_session, env, source, target="CANCELLED")
    result = approve(db_session, env[1], correction, approval_preview(db_session, env[1], correction))
    assert allocation.department is None and allocation.status == "RELEASED"
    inventory = db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one()
    quantity_before = (inventory.warehouse_qty, inventory.quantity, inventory.pending_quantity)

    allocation.status = "RESERVED"
    db_session.commit()
    reserved = stock_availability.figure_for_cell(
        db_session, stock_availability.AvailabilityCell.warehouse(env[2].item_id))
    assert reserved.active_shipping_reserved == 2
    gate = db_session.get(models.StocktakeGate, (env[2].item_id, "warehouse"))
    revision_before = gate.reservation_revision
    issue = next(row for row in diagnose_inventory_integrity(db_session).issues
                 if row.category == "SHIPPING_ALLOCATION_MISMATCH"
                 and row.cause_ids[0] == result["operation_id"])
    assert issue.repairable

    report = repair_inventory_integrity_issue(
        db_session, problem_id=issue.problem_id, approved_by="Test admin", apply=True)
    db_session.commit()
    assert report.applied
    assert allocation.status == "RELEASED"
    available = stock_availability.figure_for_cell(
        db_session, stock_availability.AvailabilityCell.warehouse(env[2].item_id))
    assert available.active_shipping_reserved == 0
    assert (inventory.warehouse_qty, inventory.quantity, inventory.pending_quantity) == quantity_before
    assert gate.reservation_revision == revision_before + 1
    assert not log.cancelled
