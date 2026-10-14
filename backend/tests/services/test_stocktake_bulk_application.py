"""Whole owned selections apply across locations in one receipted transaction."""
from datetime import datetime, timedelta
import uuid

import pytest
from pydantic import ValidationError
from sqlalchemy.exc import DBAPIError

from app import models
from app.services import stocktake_application, stocktake_reads
from app.services.inventory_conflicts import InventoryConflict
from tests.services.test_stocktake_application import confirm, apply
from tests.services.test_stocktake_counts import setup_round, command
from tests.services.test_stocktake_owned_waiting import location_env, other_actor


def bulk_preview(db, env, counts, *, actor=None):
    return env[0].execute(db, actor or env[1], "application_bulk_preview", str(uuid.uuid4()), {
        "round_id": env[3]["round_id"],
        "confirmation_revision_ids": [count["confirmation_revision_id"] for count in counts]})


def bulk_apply(db, env, proposal, *, key=None, actor=None):
    return env[0].execute(db, actor or env[1], "application_bulk_apply", key or str(uuid.uuid4()), {
        "round_id": env[3]["round_id"], "preview_id": proposal["preview_id"],
        "preview_hash": proposal["preview_hash"]})


def two_locations(db, make_item):
    env = setup_round(db, make_item, new_policy=True)
    warehouse = confirm(db, env, normal=7)
    tube = confirm(db, location_env(db, env, "tube"), normal=3)
    return env, [warehouse, tube]


def test_bulk_applies_both_locations_with_one_replayable_receipt(db_session, make_item):
    env, counts = two_locations(db_session, make_item)
    proposal = bulk_preview(db_session, env, counts)
    assert len(proposal["entries"]) == 2 and proposal["can_apply"]
    assert "scope_previews" not in proposal
    key = str(uuid.uuid4())
    result = bulk_apply(db_session, env, proposal, key=key)
    assert bulk_apply(db_session, env, proposal, key=key) == result
    assert len(result["applications"]) == 2
    assert set(result["confirmation_revision_ids"]) == {c["confirmation_revision_id"] for c in counts}
    inventory = db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one()
    assert inventory.quantity == 10 and inventory.warehouse_qty == 7
    assert db_session.query(models.StocktakeApplicationLine).count() == 2
    assert all(db_session.get(models.StocktakeCount, uuid.UUID(c["count_id"])).status == "APPLIED" for c in counts)
    assert stocktake_reads.owned_waiting_summary(db_session, uuid.UUID(env[3]["round_id"]), env[1].employee_id)["items"] == 0


def test_failure_after_first_cell_rolls_back_quantities_evidence_and_receipt(db_session, make_item, monkeypatch):
    env, counts = two_locations(db_session, make_item)
    proposal = bulk_preview(db_session, env, counts)
    original = stocktake_application.apply_cell
    calls = []

    def failing(*args):
        calls.append(args[2])
        if len(calls) == 2:
            raise InventoryConflict("INJECTED", "Fail the second location")
        return original(*args)

    monkeypatch.setattr(stocktake_application, "apply_cell", failing)
    key = str(uuid.uuid4())
    with pytest.raises(InventoryConflict, match="Fail"):
        bulk_apply(db_session, env, proposal, key=key)
    inventory = db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one()
    assert inventory.quantity == 10 and inventory.warehouse_qty == 10
    assert db_session.query(models.StocktakeApplication).count() == 0
    assert db_session.query(models.StocktakeApplicationLine).count() == 0
    assert db_session.query(models.TransactionLog).count() == 0
    assert db_session.query(models.StocktakeReceipt).filter_by(idempotency_key=key).count() == 0
    assert all(db_session.get(models.StocktakeCount, uuid.UUID(c["count_id"])).status == "CONFIRMED" for c in counts)


def test_foreign_confirmation_mixed_with_owned_is_entirely_rejected(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    mine = confirm(db_session, env)
    foreign = confirm(db_session, location_env(db_session, env, "tube", other_actor(db_session)), normal=0)
    with pytest.raises(InventoryConflict) as error:
        bulk_preview(db_session, env, [mine, foreign])
    assert error.value.code == "FORBIDDEN"
    assert db_session.query(models.StocktakeApplication).count() == 0


def test_internal_scope_seal_cannot_be_applied_separately(db_session, make_item):
    env, counts = two_locations(db_session, make_item)
    bulk_preview(db_session, env, counts)
    child = db_session.query(models.StocktakePreview).filter_by(kind="application_bulk_scope").first()
    assert child is not None
    with pytest.raises(InventoryConflict) as error:
        apply(db_session, env, {"preview_id": str(child.preview_id), "preview_hash": child.preview_hash})
    assert error.value.code == "PREVIEW_STALE"


@pytest.mark.parametrize("change", ["recount", "reservation", "expiry", "foreign_actor"])
def test_changed_preview_does_not_partially_apply(db_session, make_item, change):
    env, counts = two_locations(db_session, make_item)
    proposal = bulk_preview(db_session, env, counts)
    actor = None
    if change == "recount":
        command(db_session, env, "count_resume", counts[0], reason_code="RECOUNT_EDIT", reason="Recheck")
    elif change == "reservation":
        from app.services import stocktake_guard
        stocktake_guard.prepare_items(db_session, [env[2].item_id])
        stocktake_guard.record_change(db_session, env[2].item_id, "창고", kind="reservation", delta=-1)
        db_session.commit()
    elif change == "expiry":
        db_session.get(models.StocktakePreview, uuid.UUID(proposal["preview_id"])).expires_at = datetime.utcnow() - timedelta(seconds=1)
        db_session.commit()
    else:
        actor = other_actor(db_session)
    with pytest.raises(InventoryConflict) as error:
        bulk_apply(db_session, env, proposal, actor=actor)
    assert error.value.code == ("FORBIDDEN" if actor else "PREVIEW_STALE")
    assert db_session.query(models.StocktakeApplication).count() == 0


def test_bulk_reservation_shortage_holds_other_location_too(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one().pending_quantity = 4
    db_session.commit()
    counts = [confirm(db_session, env, normal=3), confirm(db_session, location_env(db_session, env, "tube"), normal=5)]
    proposal = bulk_preview(db_session, env, counts)
    assert not proposal["can_apply"]
    with pytest.raises(InventoryConflict) as error:
        bulk_apply(db_session, env, proposal)
    assert error.value.code == "STOCKTAKE_APPLY_HELD"
    assert db_session.query(models.StocktakeApplication).count() == 0


def test_zero_difference_still_records_each_location(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    counts = [confirm(db_session, env), confirm(db_session, location_env(db_session, env, "tube"), normal=0)]
    bulk_apply(db_session, env, bulk_preview(db_session, env, counts))
    assert db_session.query(models.StocktakeApplicationLine).count() == 2
    assert db_session.query(models.TransactionLog).count() == 0


def test_bulk_supports_entire_round_beyond_single_limits(db_session, make_item):
    for index in range(100):
        make_item(name=f"Scale item {index}", warehouse_qty=10)
    env = setup_round(db_session, make_item, new_policy=True)
    rid = uuid.UUID(env[3]["round_id"])
    from tests.services.test_stocktake_apply_contract import _cutover
    _cutover(db_session, env)
    db_session.commit()
    targets = stocktake_reads.targets(db_session, rid, scope_id="warehouse", limit=None)["items"]
    counts = [confirm(db_session, (env[0], env[1], db_session.get(models.Item, uuid.UUID(target["item_id"])), env[3], target),
                      normal=7, defect=1, b_grade=1, obsolete=1) for target in targets]
    counts.append(confirm(db_session, location_env(db_session, env, "tube"), normal=0))
    assert len(counts) > stocktake_application.MAX_TARGETS
    proposal = bulk_preview(db_session, env, counts)
    assert proposal["can_apply"] and len(proposal["entries"]) == len(counts)
    result = bulk_apply(db_session, env, proposal)
    assert len(result["confirmation_revision_ids"]) == len(counts)
    assert db_session.query(models.StocktakeApplicationLine).count() == len(counts)
    assert db_session.query(models.StocktakeEvent).filter_by(kind="COUNT_APPLIED").count() == len(counts)
    assert db_session.query(models.Inventory).filter(models.Inventory.quantity != 10).count() == 0
    assert stocktake_reads.owned_waiting_summary(db_session, rid, env[1].employee_id)["items"] == 0


def test_bulk_rejects_duplicate_unknown_and_above_round_selection(db_session, make_item):
    env, counts = two_locations(db_session, make_item)
    ids = [count["confirmation_revision_id"] for count in counts]
    for selected in ([ids[0], ids[0]], [str(uuid.uuid4())], [*ids, str(uuid.uuid4())]):
        with pytest.raises((InventoryConflict, ValidationError)):
            env[0].execute(db_session, env[1], "application_bulk_preview", str(uuid.uuid4()),
                           {"round_id": env[3]["round_id"], "confirmation_revision_ids": selected})
    assert db_session.query(models.StocktakePreview).filter_by(kind="application_bulk").count() == 0


def test_bulk_validates_final_item_total_and_applies_decreases_first(db_session, make_item):
    from app.services.defect_pool import MAX_QUANTITY
    env = setup_round(db_session, make_item, new_policy=True)
    inventory = db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one()
    inventory.quantity = inventory.warehouse_qty = MAX_QUANTITY
    db_session.commit()
    counts = [confirm(db_session, env, normal=MAX_QUANTITY - 10),
              confirm(db_session, location_env(db_session, env, "tube"), normal=10)]
    proposal = bulk_preview(db_session, env, counts)
    assert proposal["can_apply"]
    bulk_apply(db_session, env, proposal)
    assert db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one().quantity == MAX_QUANTITY


@pytest.mark.parametrize("kind", ["application_bulk_preview", "application_bulk_apply"])
def test_lost_commit_acknowledgement_keeps_original_receipt(db_session, make_item, monkeypatch, kind):
    env, counts = two_locations(db_session, make_item)
    if kind == "application_bulk_preview":
        payload = {"round_id": env[3]["round_id"], "confirmation_revision_ids": [c["confirmation_revision_id"] for c in counts]}
    else:
        proposal = bulk_preview(db_session, env, counts)
        payload = {"round_id": env[3]["round_id"], "preview_id": proposal["preview_id"], "preview_hash": proposal["preview_hash"]}
    commit = db_session.commit

    def committed_without_ack():
        commit()
        raise DBAPIError(None, None, Exception("ack lost"), connection_invalidated=True)

    monkeypatch.setattr(db_session, "commit", committed_without_ack)
    key = str(uuid.uuid4())
    with pytest.raises(InventoryConflict) as error:
        env[0].execute(db_session, env[1], kind, key, payload)
    assert error.value.code == "COMMAND_RESULT_UNKNOWN"
    original = stocktake_reads.receipt(db_session, env[1].employee_id, kind, key)
    assert env[0].execute(db_session, env[1], kind, key, payload) == original
    assert db_session.query(models.StocktakeApplication).count() == (2 if kind.endswith("apply") else 0)
