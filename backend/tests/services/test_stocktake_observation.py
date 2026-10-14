"""Zero-difference counts fence old whole operations but permit later exact effects."""
import uuid

import pytest

from app import models
from app.services import inventory_operations, inventory_operation_cancellation as cancellation
from app.services.inventory_conflicts import InventoryConflict
from tests.services.test_stocktake_application import confirm, preview, apply
from tests.services.test_stocktake_counts import setup_round


def source_operation(db, actor, item):
    operation = inventory_operations.create_business_operation(db, domain="inventory", action="receipt",
        display_label="Receipt", actor_name=actor.name, actor_employee_id=actor.employee_id)
    log = models.TransactionLog(log_id=uuid.uuid4(), item_id=item.item_id,
        transaction_type=models.TransactionTypeEnum.RECEIVE, quantity_change=1,
        quantity_before=9, quantity_after=10, inventory_effect=[{"scope": "warehouse", "delta": 1}])
    db.add(inventory_operations.attach_transaction(log, operation, models.InventoryOperationRoleEnum.PRIMARY))
    db.commit()
    return operation, log


def test_zero_observation_blocks_old_operation_and_new_effect_records_current_epoch(db_session, make_item):
    env = setup_round(db_session, make_item)
    old, log = source_operation(db_session, env[1], env[2])
    assert cancellation.preview_cancellation(db_session, old.operation_id).can_cancel
    counted = confirm(db_session, env)
    apply(db_session, env, preview(db_session, env, counted))
    old_plan = cancellation.preview_cancellation(db_session, old.operation_id)
    assert not old_plan.can_cancel
    assert old_plan.blocker_code == "STOCKTAKE_OBSERVED_EFFECT"
    with pytest.raises(InventoryConflict) as error:
        cancellation.cancel_operation(db_session, operation_id=old.operation_id, plan_hash=old_plan.plan_hash, canceller=env[1], reason="mistake")
    assert error.value.code == "STOCKTAKE_OBSERVED_EFFECT" and error.value.status_code == 409
    new, new_log = source_operation(db_session, env[1], env[2])
    epoch = db_session.get(models.StocktakeEffectEpoch, ("transaction", new_log.log_id, "warehouse"))
    assert epoch.observation_epoch == 1
    assert cancellation.preview_cancellation(db_session, new.operation_id).can_cancel


def test_stocktake_application_is_not_an_ordinary_cancellation(db_session, make_item):
    env = setup_round(db_session, make_item)
    counted = confirm(db_session, env)
    result = apply(db_session, env, preview(db_session, env, counted))
    plan = cancellation.preview_cancellation(db_session, uuid.UUID(result["operation_id"]))
    assert not plan.can_cancel
