"""Shipping reversal must preserve stocktake-observed physical history."""

from datetime import datetime

import pytest

from app import models
from app.services import inventory_operation_cancellation, inventory_operations, shipping_actions
from app.services.inventory_conflicts import InventoryConflict


def _observed_shipping_case(db, make_item, *, phase, with_operation=False):
    item = make_item(name=f"Observed {phase}", process_type_code="PF", warehouse_qty=0)
    actor = models.Employee(employee_code=f"OBS-{phase}-{with_operation}", name="Shipping actor",
                            role="staff", is_active=True)
    db.add(actor)
    db.add(models.StocktakeControl(id=1, inventory_mode="POOL"))
    db.add(models.InventoryScope(scope_key="shipping", physical_department=models.DepartmentEnum.SHIPPING.value))
    db.add(models.SystemSetting(setting_key="inventory_operation_cutover_at", setting_value="2000-01-01T00:00:00"))
    db.flush()
    cutover_operation = inventory_operations.create_business_operation(
        db, domain="pool", action="cutover", display_label="Fixture",
        actor_name=actor.name, actor_employee_id=actor.employee_id,
    )
    db.add(models.DefectPoolCutover(
        actor_employee_id=actor.employee_id, operation_id=cutover_operation.operation_id,
        source_fingerprint="e" * 64, cutover_version=1, performed_at=datetime(2026, 1, 2),
    ))
    db.flush()
    request = models.ShippingRequest(
        base_pf_item_id=item.item_id, final_pf_item_id=item.item_id,
        status=models.ShippingRequestStatusEnum.PREPARED if phase == "PREPARE"
        else models.ShippingRequestStatusEnum.PICKED_UP,
        prepared_at=datetime.utcnow(), picked_up_at=datetime.utcnow() if phase == "PICKUP" else None,
        request_quantity=1,
    )
    db.add(request)
    db.flush()
    prepared_quantity = 2 if phase == "PREPARE" and with_operation else 1
    location = models.InventoryLocation(
        item_id=item.item_id, department=models.DepartmentEnum.SHIPPING,
        status=models.LocationStatusEnum.PRODUCTION, quantity=prepared_quantity if phase == "PREPARE" else 0,
    )
    db.add(location)
    stock = db.query(models.Inventory).filter_by(item_id=item.item_id).one()
    stock.quantity = prepared_quantity if phase == "PREPARE" else 0
    allocation = models.ShippingAllocation(
        request_id=request.request_id, item_id=item.item_id, quantity=1,
        department=models.DepartmentEnum.SHIPPING.value,
        status="RESERVED" if phase == "PREPARE" else "CONSUMED",
    )
    db.add(allocation)
    db.flush()
    operation = None
    if with_operation:
        operation = inventory_operations.create_business_operation(
            db, domain="shipping", action="prepare" if phase == "PREPARE" else "pickup",
            display_label="Shipping fixture", actor_name=actor.name,
            actor_employee_id=actor.employee_id,
        )
        db.add(models.InventoryOperationEffect(
            operation_id=operation.operation_id,
            effect_kind=models.InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type="ShippingRequest", subject_id=str(request.request_id),
            role="PREPARE_STATUS" if phase == "PREPARE" else "PICKUP_STATUS",
            before_state={"status": "PREPARING" if phase == "PREPARE" else "PREPARED"},
            after_state={"status": request.status.value},
        ))
    if phase == "PICKUP":
        db.add(models.TransactionLog(
            item_id=item.item_id, transaction_type=models.TransactionTypeEnum.PRODUCE,
            quantity_change=1, quantity_before=0, quantity_after=1,
            department=models.DepartmentEnum.SHIPPING.value,
            shipping_request_id=request.request_id, shipping_phase="PREPARE",
            inventory_effect=[{"scope": "location", "department": models.DepartmentEnum.SHIPPING.value,
                               "status": "PRODUCTION", "delta": 1}],
        ))
    delta = 1 if phase == "PREPARE" else -1
    log = models.TransactionLog(
        item_id=item.item_id,
        transaction_type=models.TransactionTypeEnum.PRODUCE if delta > 0 else models.TransactionTypeEnum.SHIP,
        quantity_change=delta,
        quantity_before=prepared_quantity - 1 if delta > 0 else 1,
        quantity_after=prepared_quantity if delta > 0 else 0,
        department=models.DepartmentEnum.SHIPPING.value,
        shipping_request_id=request.request_id, shipping_phase=phase,
        operation_id=operation.operation_id if operation else None,
        inventory_effect=[{"scope": "location", "department": models.DepartmentEnum.SHIPPING.value,
                           "status": "PRODUCTION", "delta": delta}],
    )
    db.add(log)
    db.commit()
    gate = models.StocktakeGate(item_id=item.item_id, scope_key="shipping", observation_epoch=1)
    db.add(gate)
    db.commit()
    return request, item, stock, location, allocation, log, actor


@pytest.mark.parametrize("phase", ["PREPARE", "PICKUP"])
def test_legacy_shipping_cancel_cannot_reverse_observed_effect(db_session, make_item, phase):
    request, item, stock, location, allocation, log, actor = _observed_shipping_case(
        db_session, make_item, phase=phase,
    )
    before = (request.status, stock.quantity, location.quantity, allocation.status)
    with pytest.raises(InventoryConflict) as error:
        if phase == "PREPARE":
            shipping_actions.prepare_cancel(db_session, request.request_id, "observed", actor=actor)
        else:
            shipping_actions.pickup_cancel(db_session, request.request_id, actor=actor)
    assert error.value.code == "STOCKTAKE_OBSERVED_EFFECT"
    assert error.value.status_code == 409
    db_session.expire_all()
    assert (request.status, stock.quantity, location.quantity, allocation.status) == before
    assert not db_session.get(models.TransactionLog, log.log_id).cancelled
    assert db_session.query(models.ShippingRequestEvent).filter_by(request_id=request.request_id,
        event_type=f"{phase}_CANCELLED").count() == 0


def test_operation_shipping_cancel_preserves_observed_effect_code_and_409(db_session, make_item):
    request, item, stock, location, allocation, log, actor = _observed_shipping_case(
        db_session, make_item, phase="PREPARE", with_operation=True,
    )
    before = (request.status, stock.quantity, location.quantity, allocation.status)
    operation = db_session.get(models.InventoryOperation, log.operation_id)
    plan = inventory_operation_cancellation.preview_cancellation(db_session, operation.operation_id)
    assert plan.blocker_code == "STOCKTAKE_OBSERVED_EFFECT"
    with pytest.raises(InventoryConflict) as error:
        shipping_actions.prepare_cancel(db_session, request.request_id, "observed", actor=actor)
    assert error.value.code == "STOCKTAKE_OBSERVED_EFFECT"
    assert error.value.status_code == 409
    db_session.expire_all()
    assert (request.status, stock.quantity, location.quantity, allocation.status) == before
    assert not db_session.get(models.TransactionLog, log.log_id).cancelled
