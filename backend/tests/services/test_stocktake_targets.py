"""A frozen denominator survives catalog changes; additions require explicit admission."""
from datetime import datetime
import uuid

import pytest

from app import models
from app.services.inventory_conflicts import InventoryConflict
from tests.services.test_stocktake_counts import setup_round


def test_empty_append_is_receipted_without_targets_and_replays_after_catalog_changes(db_session, make_item):
    env = setup_round(db_session, make_item)
    svc, actor, _, round_, _ = env
    key = str(uuid.uuid4())
    before = db_session.query(models.StocktakeTargetSet).count()
    target_count = db_session.query(models.StocktakeTarget).count()
    event_count = db_session.query(models.StocktakeEvent).count()
    generation = db_session.get(models.StocktakeRound, uuid.UUID(round_["round_id"])).target_generation
    result = svc.execute(db_session, actor, "target_append_preview", key, {"round_id": round_["round_id"]})
    assert result["no_targets"] is True and result["target_count"] == 0
    assert result["receipt_id"] and "preview_id" not in result
    assert db_session.query(models.StocktakeTargetSet).count() == before
    assert db_session.query(models.StocktakeTarget).count() == target_count
    assert db_session.query(models.StocktakeEvent).count() == event_count
    assert db_session.get(models.StocktakeRound, uuid.UUID(round_["round_id"])).target_generation == generation
    make_item(name="Later item")
    db_session.commit()
    assert svc.execute(db_session, actor, "target_append_preview", key, {"round_id": round_["round_id"]}) == result


def test_new_item_is_pending_and_deactivation_does_not_erase_it(db_session, make_item):
    from app.services import stocktake_targets
    env = setup_round(db_session, make_item)
    other = make_item(name="New item")
    db_session.commit()
    pending = db_session.query(models.StocktakePendingTarget).one()
    assert pending.item_id == other.item_id
    other.deleted_at = datetime.utcnow()
    db_session.commit()
    assert any(row["item_id"] == str(other.item_id) for row in stocktake_targets.pending_rows(db_session, uuid.UUID(env[3]["round_id"])))
    proposal = env[0].execute(db_session, env[1], "target_append_preview", str(uuid.uuid4()), {"round_id": env[3]["round_id"]})
    assert proposal["targets"][0]["item_id"] == str(other.item_id)
    result = env[0].execute(db_session, env[1], "target_append", str(uuid.uuid4()), {"round_id": env[3]["round_id"], "preview_id": proposal["preview_id"], "preview_hash": proposal["preview_hash"]})
    assert result["target_generation"] == 2
    assert len(env[0].list_targets(db_session, uuid.UUID(env[3]["round_id"]))["items"]) == 2
    assert stocktake_targets.pending_rows(db_session, uuid.UUID(env[3]["round_id"])) == []


def test_unit_change_is_blocked_but_name_uses_original_snapshot(db_session, make_item):
    env = setup_round(db_session, make_item)
    item = env[2]
    item.unit = "BOX"
    with pytest.raises(InventoryConflict):
        db_session.commit()
    db_session.rollback()
    item.item_name = "Changed name"
    db_session.commit()
    target = db_session.get(models.StocktakeTarget, uuid.UUID(env[4]["target_id"]))
    assert target.item_name == "Counted item"


def test_new_department_gets_canonical_scope_and_pending_zero_cells(db_session, make_item):
    env = setup_round(db_session, make_item)
    department = models.Department(name="연구", is_active=True)
    db_session.add(department)
    db_session.commit()
    scope = db_session.get(models.InventoryScope, f"department:{department.id}")
    assert scope is not None and scope.physical_department == "연구"
    assert db_session.query(models.StocktakePendingTarget).filter_by(scope_key=scope.scope_key).count() == 1
