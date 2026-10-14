"""An observed effect needs matching lineage; legacy handovers need a complete group."""
import uuid

import pytest

from app import models
from app.services import inventory_operations, stocktake
from app.services.inventory_conflicts import InventoryConflict
from tests.services.test_business_corrections import approve, approval_preview, execute
from tests.services.test_stocktake_application import apply, confirm, preview
from tests.services.test_stocktake_counts import setup_round


def _request(db, actor, source_type, source_id):
    return execute(db, actor, "request", {
        "source_type": source_type, "source_id": str(source_id),
        "target_status": "PREPARING" if source_type == "InventoryOperation" else "CANCELLED",
        "reason": "Recorded workflow did not happen",
        "evidence": "Physical count and source documents checked"})


def _legacy_handover(db, make_item, *, logged_quantity=2, destination_effect=True,
                     extra_batch_document=False):
    """Use a real two-cell observation after an operation-free legacy transfer log."""
    env = setup_round(db, make_item)
    receiver = models.Employee(employee_code="LEGACY-RECEIVER", name="Receiver", role="staff")
    db.add(receiver)
    db.add(models.Department(name="튜브"))
    db.add(models.Department(name="고압"))
    inventory = db.query(models.Inventory).filter_by(item_id=env[2].item_id).one()
    inventory.quantity = 20
    db.add(models.InventoryLocation(item_id=env[2].item_id, department="튜브",
        status=models.LocationStatusEnum.PRODUCTION, quantity=8))
    db.add(models.InventoryLocation(item_id=env[2].item_id, department="고압",
        status=models.LocationStatusEnum.PRODUCTION, quantity=2))
    db.commit()
    scope_keys = {row.physical_department: row.scope_key for row in db.query(models.InventoryScope).all()}
    assert {"튜브", "고압"} <= scope_keys.keys()
    addition = stocktake.execute(db, env[1], "target_append_preview", str(uuid.uuid4()), {
        "round_id": env[3]["round_id"]})
    stocktake.execute(db, env[1], "target_append", str(uuid.uuid4()), {
        "round_id": env[3]["round_id"], "preview_id": addition["preview_id"],
        "preview_hash": addition["preview_hash"]})
    document = models.HandoverDoc(
        handover_code="LEGACY-HO-1", status=models.HandoverStatusEnum.RECEIVED,
        author_employee_id=env[1].employee_id, author_name=env[1].name,
        received_by_employee_id=receiver.employee_id, received_by_name=receiver.name,
        from_department="튜브", to_department="고압", title="Legacy handover")
    db.add(document)
    db.flush()
    db.add(models.HandoverLine(handover_id=document.handover_id,
        item_id=env[2].item_id, item_name_snapshot=env[2].item_name, quantity=2))
    batch = None
    if extra_batch_document:
        batch = models.IoBatch(work_type="handover", sub_type="handover_receive", status="completed",
            requester_employee_id=receiver.employee_id, requester_name=receiver.name,
            requester_department="고압")
        db.add(batch)
        db.flush()
        extra = models.HandoverDoc(
            handover_code="LEGACY-HO-2", status=models.HandoverStatusEnum.RECEIVED,
            author_employee_id=env[1].employee_id, author_name=env[1].name,
            received_by_employee_id=receiver.employee_id, received_by_name=receiver.name,
            from_department="튜브", to_department="고압", title="Other document in execution batch")
        db.add(extra)
        db.flush()
        db.add(models.HandoverLine(handover_id=extra.handover_id,
            item_id=env[2].item_id, item_name_snapshot=env[2].item_name, quantity=1))
    effects = [{"scope": "location", "department": "튜브", "status": "PRODUCTION",
                "delta": -logged_quantity}]
    if destination_effect:
        effects.append({"scope": "location", "department": "고압", "status": "PRODUCTION",
                        "delta": logged_quantity})
    log = models.TransactionLog(
        item_id=env[2].item_id, transaction_type=models.TransactionTypeEnum.TRANSFER_DEPT,
        quantity_change=0, quantity_before=10, quantity_after=10, transfer_qty=logged_quantity,
        reference_no=document.handover_code, operation_batch_id=batch.batch_id if batch else None,
        department="고압", inventory_effect=effects)
    db.add(log)
    if batch:
        db.add(models.TransactionLog(
            item_id=env[2].item_id, transaction_type=models.TransactionTypeEnum.TRANSFER_DEPT,
            quantity_change=0, quantity_before=10, quantity_after=10, transfer_qty=1,
            reference_no="LEGACY-HO-2", operation_batch_id=batch.batch_id,
            department="고압", inventory_effect=[
                {"scope": "location", "department": "튜브", "status": "PRODUCTION", "delta": -1},
                {"scope": "location", "department": "고압", "status": "PRODUCTION", "delta": 1}]))
    db.commit()
    targets = stocktake.list_targets(db, uuid.UUID(env[3]["round_id"]))["items"]
    for scope_id, amount in ((scope_keys["튜브"], 8), (scope_keys["고압"], 2)):
        target = next(row for row in targets
                      if row["item_id"] == str(env[2].item_id) and row["scope_id"] == scope_id)
        department_env = (env[0], env[1], env[2], env[3], target)
        apply(db, department_env, preview(db, department_env, confirm(db, department_env, normal=amount)))
    assert db.get(models.StocktakeGate, (env[2].item_id, scope_keys["튜브"])).observation_epoch == 1
    assert db.get(models.StocktakeGate, (env[2].item_id, scope_keys["고압"])).observation_epoch == 1
    return env, receiver, document, log


def _reservation_only_prepare(db, make_item, *, after_observation):
    """Prepare is a reservation effect with no physical transaction log."""
    env = setup_round(db, make_item)
    if after_observation:
        apply(db, env, preview(db, env, confirm(db, env)))
    request = models.ShippingRequest(base_pf_item_id=env[2].item_id,
        status=models.ShippingRequestStatusEnum.PREPARED)
    db.add(request)
    db.flush()
    allocation = models.ShippingAllocation(request_id=request.request_id,
        item_id=env[2].item_id, quantity=2, department=None, status="RESERVED")
    db.add(allocation)
    db.flush()
    operation = inventory_operations.create_business_operation(db, domain="shipping",
        action="prepare", display_label="Reservation-only preparation",
        actor_name=env[1].name, actor_employee_id=env[1].employee_id)
    inventory_operations.record_effect(db, operation=operation, effect_kind="WORKFLOW",
        subject_type="ShippingRequest", subject_id=request.request_id, role="SOURCE",
        before_state={"status": "PREPARING"}, after_state={"status": "PREPARED"})
    inventory_operations.record_effect(db, operation=operation, effect_kind="ALLOCATION",
        subject_type="ShippingAllocation", subject_id=allocation.allocation_id, role="SOURCE",
        before_state={"status": "NONE"}, after_state={"status": "RESERVED"})
    db.commit()
    if not after_observation:
        apply(db, env, preview(db, env, confirm(db, env)))
    assert db.query(models.TransactionLog).count() == 0
    assert db.get(models.StocktakeGate, (env[2].item_id, "warehouse")).observation_epoch == 1
    return env, request, allocation, operation


def test_reservation_created_after_observation_cannot_use_earlier_application(db_session, make_item):
    env, _, allocation, operation = _reservation_only_prepare(
        db_session, make_item, after_observation=True)
    with pytest.raises(InventoryConflict) as error:
        _request(db_session, env[1], "InventoryOperation", operation.operation_id)
    assert (error.value.code, error.value.status_code) == ("CORRECTION_HELD", 422)
    epoch = db_session.query(models.StocktakeReservationEpoch).filter_by(
        allocation_id=allocation.allocation_id).one()
    assert epoch.scope_key == "warehouse" and epoch.observation_epoch == 1
    assert db_session.query(models.BusinessCorrection).count() == 0


def test_reservation_created_before_observation_can_be_released_without_stock_change(db_session, make_item):
    env, request, allocation, operation = _reservation_only_prepare(
        db_session, make_item, after_observation=False)
    epoch = db_session.query(models.StocktakeReservationEpoch).filter_by(
        allocation_id=allocation.allocation_id).one()
    assert epoch.scope_key == "warehouse" and epoch.observation_epoch == 0
    correction = _request(db_session, env[1], "InventoryOperation", operation.operation_id)
    result = approve(db_session, env[1], correction, approval_preview(db_session, env[1], correction))
    assert result["status"] == "APPLIED"
    assert request.status == models.ShippingRequestStatusEnum.PREPARING
    assert allocation.status == "RELEASED"
    inventory = db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one()
    assert inventory.quantity == inventory.warehouse_qty == 10


def test_post_observation_shipping_effect_is_not_covered_by_earlier_application(db_session, make_item):
    env = setup_round(db_session, make_item)
    apply(db_session, env, preview(db_session, env, confirm(db_session, env)))
    request = models.ShippingRequest(base_pf_item_id=env[2].item_id,
        status=models.ShippingRequestStatusEnum.PICKED_UP)
    db_session.add(request)
    db_session.flush()
    allocation = models.ShippingAllocation(request_id=request.request_id, item_id=env[2].item_id,
        quantity=1, department=None, status="CONSUMED")
    db_session.add(allocation)
    operation = inventory_operations.create_business_operation(db_session, domain="shipping",
        action="pickup", display_label="Later shipment", actor_name=env[1].name,
        actor_employee_id=env[1].employee_id)
    log = models.TransactionLog(item_id=env[2].item_id,
        transaction_type=models.TransactionTypeEnum.SHIP,
        quantity_change=-1, quantity_before=11, quantity_after=10,
        shipping_request_id=request.request_id, shipping_phase="pickup",
        inventory_effect=[{"scope": "warehouse", "delta": -1}])
    db_session.add(inventory_operations.attach_transaction(
        log, operation, models.InventoryOperationRoleEnum.PRIMARY))
    inventory_operations.record_effect(db_session, operation=operation, effect_kind="WORKFLOW",
        subject_type="ShippingRequest", subject_id=request.request_id, role="SOURCE",
        before_state={"status": "PREPARED"}, after_state={"status": "PICKED_UP"})
    inventory_operations.record_effect(db_session, operation=operation, effect_kind="ALLOCATION",
        subject_type="ShippingAllocation", subject_id=allocation.allocation_id, role="SOURCE",
        before_state={"status": "RESERVED"}, after_state={"status": "CONSUMED"})
    db_session.commit()
    epoch = db_session.get(models.StocktakeEffectEpoch, ("transaction", log.log_id, "warehouse"))
    assert epoch.observation_epoch == 1
    assert db_session.query(models.StocktakeApplicationLine).filter_by(
        item_id=env[2].item_id, scope_key="warehouse").count() == 1
    with pytest.raises(InventoryConflict) as error:
        _request(db_session, env[1], "InventoryOperation", operation.operation_id)
    assert (error.value.code, error.value.status_code) == ("CORRECTION_HELD", 422)
    assert db_session.query(models.BusinessCorrection).count() == 0


@pytest.mark.parametrize("variation", ["quantity", "missing_destination", "other_document"])
def test_incomplete_legacy_handover_group_is_held(db_session, make_item, variation):
    _, receiver, document, _ = _legacy_handover(
        db_session, make_item, logged_quantity=1 if variation == "quantity" else 2,
        destination_effect=variation != "missing_destination",
        extra_batch_document=variation == "other_document")
    with pytest.raises(InventoryConflict) as error:
        _request(db_session, receiver, "HandoverDoc", document.handover_id)
    assert (error.value.code, error.value.status_code) == ("CORRECTION_HELD", 422)
    assert db_session.query(models.BusinessCorrection).count() == 0


def test_complete_legacy_handover_group_can_be_corrected_without_stock_change(db_session, make_item):
    env, receiver, document, log = _legacy_handover(db_session, make_item)
    assert {effect["department"] for effect in log.inventory_effect} == {"튜브", "고압"}
    epochs = {(row.source_id, row.scope_key): row.observation_epoch
              for row in db_session.query(models.StocktakeEffectEpoch).all()}
    scope_keys = {row.physical_department: row.scope_key
                  for row in db_session.query(models.InventoryScope).all()}
    assert {(log.log_id, scope_keys[name]): 0 for name in ("튜브", "고압")} == {
        key: value for key, value in epochs.items() if key[0] == log.log_id}
    correction = _request(db_session, receiver, "HandoverDoc", document.handover_id)
    plan = approval_preview(db_session, env[1], correction)
    result = approve(db_session, env[1], correction, plan)
    assert result["status"] == "APPLIED"
    assert document.status == models.HandoverStatusEnum.CANCELLED
    assert not log.cancelled
    inventory = db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one()
    source = db_session.query(models.InventoryLocation).filter_by(
        item_id=env[2].item_id, department="튜브").one()
    destination = db_session.query(models.InventoryLocation).filter_by(
        item_id=env[2].item_id, department="고압").one()
    assert (inventory.quantity, inventory.warehouse_qty, source.quantity, destination.quantity) == (20, 10, 8, 2)
