"""Selected confirmations apply atomically, including zero-difference observations."""
import uuid

import pytest

from app import models
from app.services.inventory_conflicts import InventoryConflict
from tests.services.test_stocktake_counts import setup_round, start_count, command


def confirm(db, env, normal=10, defect=0, b_grade=0, obsolete=0):
    count = start_count(db, env)
    saved = command(db, env, "count_save", count, quantities={"normal": normal, "defect": defect, "b_grade": b_grade, "obsolete": obsolete})
    return command(db, env, "count_confirm", saved)


def preview(db, env, count):
    return env[0].execute(db, env[1], "application_preview", str(uuid.uuid4()), {"round_id": env[3]["round_id"], "confirmation_revision_ids": [count["confirmation_revision_id"]]})


def apply(db, env, proposal, *, key=None, actor=None):
    return env[0].execute(db, actor or env[1], "application_apply", key or str(uuid.uuid4()), {"round_id": env[3]["round_id"], "preview_id": proposal["preview_id"], "preview_hash": proposal["preview_hash"]})


def test_zero_difference_is_an_observation_without_fake_transaction(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = confirm(db_session, env)
    proposal = preview(db_session, env, count)
    key = str(uuid.uuid4())
    result = apply(db_session, env, proposal, key=key)
    assert apply(db_session, env, proposal, key=key) == result
    assert db_session.query(models.TransactionLog).count() == 0
    line = db_session.query(models.StocktakeApplicationLine).one()
    assert line.observation_epoch_before == 0 and line.observation_epoch_after == 1
    gate = db_session.get(models.StocktakeGate, (env[2].item_id, "warehouse"))
    assert gate.active_count_id is None and gate.observation_epoch == 1
    assert db_session.get(models.StocktakeCount, uuid.UUID(count["count_id"])).status == "APPLIED"


def test_other_active_employee_cannot_apply_and_owner_evidence_is_retained(db_session, make_item):
    env = setup_round(db_session, make_item)
    confirmed = confirm(db_session, env, normal=12)
    proposal = preview(db_session, env, confirmed)
    actor = models.Employee(employee_code="SECOND", name="Applier", role="staff")
    db_session.add(actor)
    db_session.commit()
    with pytest.raises(InventoryConflict) as error:
        apply(db_session, env, proposal, actor=actor)
    assert error.value.code == "FORBIDDEN"
    assert db_session.query(models.StocktakeApplication).count() == 0
    apply(db_session, env, proposal)
    application = db_session.query(models.StocktakeApplication).one()
    assert application.actor_id == env[1].employee_id
    assert db_session.get(models.StocktakeCount, uuid.UUID(confirmed["count_id"])).owner_id == env[1].employee_id
    log = db_session.query(models.TransactionLog).one()
    assert log.quantity_change == 2 and log.transaction_type == models.TransactionTypeEnum.ADJUST


def test_reservation_shortage_holds_the_entire_count(db_session, make_item):
    env = setup_round(db_session, make_item)
    inventory = db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one()
    inventory.pending_quantity = 4
    db_session.commit()
    count = confirm(db_session, env, normal=3)
    proposal = preview(db_session, env, count)
    assert not proposal["can_apply"]
    with pytest.raises(InventoryConflict) as error:
        apply(db_session, env, proposal)
    assert error.value.code == "STOCKTAKE_APPLY_HELD"
    assert db_session.query(models.StocktakeApplication).count() == 0
    assert db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one().warehouse_qty == 10


def test_reservation_revision_change_requires_new_preview(db_session, make_item):
    from app.services import stocktake_guard
    env = setup_round(db_session, make_item)
    count = confirm(db_session, env)
    proposal = preview(db_session, env, count)
    stocktake_guard.prepare_items(db_session, [env[2].item_id])
    stocktake_guard.record_change(db_session, env[2].item_id, "창고", kind="reservation", delta=-1)
    db_session.commit()
    with pytest.raises(InventoryConflict) as error:
        apply(db_session, env, proposal)
    assert error.value.code == "PREVIEW_STALE"
    assert db_session.query(models.StocktakeApplication).count() == 0
