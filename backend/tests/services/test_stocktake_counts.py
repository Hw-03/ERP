"""Count ownership, immutable confirmation and retry contracts in a disposable DB."""
import uuid
from datetime import datetime

import pytest

from app import models
from app.services.inventory_conflicts import InventoryConflict


def setup_round(db, make_item, *, new_policy=False):
    from app.services import stocktake
    item = make_item(name="Counted item", warehouse_qty=10)
    actor = models.Employee(employee_code="COUNT-ADMIN", name="Counter", role="admin", department_role="primary")
    db.add(actor)
    db.add(models.StocktakeControl(id=1, inventory_mode="POOL"))
    db.add(models.InventoryScope(scope_key="warehouse", physical_department="창고"))
    db.add(models.InventoryScope(scope_key="tube", physical_department="튜브"))
    db.add(models.SystemSetting(setting_key="inventory_operation_cutover_at", setting_value="2000-01-01T00:00:00"))
    db.commit()
    if new_policy:
        preview = stocktake.execute(db, actor, "round_start_preview", str(uuid.uuid4()), {"title": "Test census"})
    else:
        # Historical start manifests have no policy field and retain the old denominator.
        from app.services.stocktake_common import seal, preview_response
        from app.services.stocktake_targets import candidate_rows, candidate_fingerprint
        rows = candidate_rows(db)
        set_id = uuid.uuid4()
        prepared = seal(db, actor, "round_start", {"set_id": str(set_id), "title": "Test census",
            "target_count": len(rows), "candidate_fingerprint": candidate_fingerprint(rows),
            "control_epoch": db.get(models.StocktakeControl, 1).epoch, "target_generation": 0})
        db.add(models.StocktakeTargetSet(set_id=set_id, preview_id=prepared.preview_id))
        db.flush()
        db.bulk_insert_mappings(models.StocktakeTarget, [{**row, "item_id": uuid.UUID(row["item_id"]),
            "set_id": set_id, "target_id": uuid.uuid4()} for row in rows])
        db.commit()
        preview = preview_response(prepared)
    result = stocktake.execute(db, actor, "round_start", str(uuid.uuid4()), {"preview_id": preview["preview_id"], "preview_hash": preview["preview_hash"]})
    targets = stocktake.list_targets(db, uuid.UUID(result["round_id"]))["items"]
    return stocktake, actor, item, result, next(t for t in targets if t["item_id"] == str(item.item_id) and t["scope_id"] == "warehouse")


def start_count(db, setup):
    svc, actor, _, round_, target = setup
    return svc.execute(db, actor, "count_start", str(uuid.uuid4()), {"target_id": target["target_id"], "expected_target_version": target["version"], "round_epoch": round_["epoch"]})


def command(db, setup, kind, count, **extra):
    svc, actor, *_ = setup
    return svc.execute(db, actor, kind, str(uuid.uuid4()), {"count_id": count["count_id"], "expected_version": count["version"], "fence": count["fence"], **extra})


def test_snapshot_includes_zero_cells_and_start_changes_no_quantity(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    assert count["status"] == "DRAFT"
    assert count["confirmed_at"] is None
    assert count["quantities"] == {"normal": None, "defect": None, "b_grade": None, "obsolete": None}
    assert db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one().warehouse_qty == 10
    gate = db_session.get(models.StocktakeGate, (env[2].item_id, "warehouse"))
    assert str(gate.active_count_id) == count["count_id"]


def test_retry_is_replayed_before_version_and_round_checks(db_session, make_item):
    env = setup_round(db_session, make_item)
    svc, actor, _, round_, target = env
    key = str(uuid.uuid4())
    payload = {"target_id": target["target_id"], "expected_target_version": target["version"], "round_epoch": round_["epoch"]}
    first = svc.execute(db_session, actor, "count_start", key, payload)
    assert svc.execute(db_session, actor, "count_start", key, payload) == first
    changed = {**payload, "expected_target_version": 999}
    with pytest.raises(InventoryConflict, match="동일") as error:
        svc.execute(db_session, actor, "count_start", key, changed)
    assert error.value.code == "IDEMPOTENCY_CONFLICT"
    assert db_session.query(models.StocktakeCount).count() == 1


def test_blank_is_not_zero_and_late_save_cannot_overwrite(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    with pytest.raises(InventoryConflict) as error:
        command(db_session, env, "count_confirm", count)
    assert error.value.status_code == 422
    saved = command(db_session, env, "count_save", count, quantities={"normal": 10, "defect": 0, "b_grade": 0, "obsolete": 0})
    assert saved["confirmed_at"] is None
    with pytest.raises(InventoryConflict) as error:
        command(db_session, env, "count_save", count, quantities={"normal": 11, "defect": 0, "b_grade": 0, "obsolete": 0})
    assert error.value.code == "COUNT_VERSION_CONFLICT"
    confirmed = command(db_session, env, "count_confirm", saved)
    assert confirmed["status"] == "CONFIRMED"
    assert confirmed["confirmation_revision_id"]
    persisted = db_session.get(models.StocktakeCount, uuid.UUID(confirmed["count_id"]))
    assert confirmed["confirmed_at"] == persisted.confirmed_at.isoformat() + "Z"


def test_count_reads_preserve_stored_confirmation_time(db_session, make_item):
    from app.routers.stocktakes import get_count
    from app.services import stocktake_reads

    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    saved = command(db_session, env, "count_save", count, quantities={"normal": 10, "defect": 0, "b_grade": 0, "obsolete": 0})
    confirmed = command(db_session, env, "count_confirm", saved)
    count_id = uuid.UUID(confirmed["count_id"])
    persisted = db_session.get(models.StocktakeCount, count_id)
    stored_at = datetime(2026, 10, 8, 1, 2, 3, 456789)
    persisted.confirmed_at = stored_at
    db_session.commit()
    expected = "2026-10-08T01:02:03.456789Z"

    assert get_count(count_id, db_session, (env[1], None))["confirmed_at"] == expected
    targets = stocktake_reads.targets(db_session, uuid.UUID(env[3]["round_id"]), scope_id="warehouse")["items"]
    target = next(row for row in targets if row["target_id"] == env[4]["target_id"])
    assert target["count"]["confirmed_at"] == expected
    legacy_targets = env[0].list_targets(db_session, uuid.UUID(env[3]["round_id"]))["items"]
    legacy_target = next(row for row in legacy_targets if row["target_id"] == env[4]["target_id"])
    assert legacy_target["count"]["confirmed_at"] == expected
    assert db_session.get(models.StocktakeCount, count_id).confirmed_at == stored_at


def test_resume_abandon_and_recount_preserve_invalidated_confirmation(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    saved = command(db_session, env, "count_save", count, quantities={"normal": 0, "defect": 0, "b_grade": 0, "obsolete": 0})
    confirmed = command(db_session, env, "count_confirm", saved)
    resumed = command(db_session, env, "count_resume", confirmed, reason_code="EDIT", reason="Recheck")
    assert resumed["confirmed_at"] is None
    event = db_session.get(models.StocktakeEvent, uuid.UUID(resumed["event_id"]))
    assert event.payload["invalidated_confirmation_revision_id"] == confirmed["confirmation_revision_id"]
    assert resumed["quantities"] == saved["quantities"]
    abandoned = command(db_session, env, "count_abandon", resumed, reason_code="LEAVE", reason="Shift end")
    assert abandoned["status"] == "ABANDONED"
    target = db_session.get(models.StocktakeTarget, uuid.UUID(env[4]["target_id"]))
    fresh = env[0].execute(db_session, env[1], "count_start", str(uuid.uuid4()), {"target_id": str(target.target_id), "expected_target_version": target.version, "round_epoch": env[3]["epoch"]})
    assert fresh["count_id"] != count["count_id"] and all(v is None for v in fresh["quantities"].values())
    assert fresh["fence"] > abandoned["fence"]


@pytest.mark.parametrize("value", [True, -1, 1.2, "2", 2147483648])
def test_invalid_quantity_cannot_be_saved(db_session, make_item, value):
    from pydantic import ValidationError
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    with pytest.raises(ValidationError):
        command(db_session, env, "count_save", count, quantities={"normal": value, "defect": 0, "b_grade": 0, "obsolete": 0})
