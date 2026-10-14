"""A sealed close is an atomic round boundary, including optional selected apply."""
import uuid

import pytest
from pydantic import ValidationError

from app import models
from app.services.inventory_conflicts import InventoryConflict
from tests.services.test_stocktake_application import apply, confirm, preview
from tests.services.test_stocktake_counts import command, setup_round, start_count


def _close_preview(db, env, *, mode="PARTIAL", selected=None, reason="Unfinished targets reviewed"):
    return env[0].execute(db, env[1], "round_close_preview", str(uuid.uuid4()), {
        "round_id": env[3]["round_id"], "mode": mode, "reason": reason,
        "confirmation_revision_ids": selected or []})


def _close(db, env, proposal, *, actor=None, key=None):
    return env[0].execute(db, actor or env[1], "round_close", key or str(uuid.uuid4()), {
        "round_id": env[3]["round_id"], "preview_id": proposal["preview_id"],
        "preview_hash": proposal["preview_hash"]})


def _append_item(db, env, make_item, *, quantity=5):
    item = make_item(name="Later census item", warehouse_qty=quantity)
    db.commit()
    proposal = env[0].execute(db, env[1], "target_append_preview", str(uuid.uuid4()), {
        "round_id": env[3]["round_id"]})
    env[0].execute(db, env[1], "target_append", str(uuid.uuid4()), {
        "round_id": env[3]["round_id"], "preview_id": proposal["preview_id"],
        "preview_hash": proposal["preview_hash"]})
    target = next(row for row in env[0].list_targets(db, uuid.UUID(env[3]["round_id"]))["items"]
                  if row["item_id"] == str(item.item_id))
    return item, (env[0], env[1], item, env[3], target)


def test_full_close_with_zero_new_applies_requires_every_latest_count_applied(db_session, make_item):
    env = setup_round(db_session, make_item)
    counted = confirm(db_session, env)
    apply(db_session, env, preview(db_session, env, counted))
    proposal = _close_preview(db_session, env, mode="FULL", selected=[], reason="")
    assert proposal["manifest_id"] and proposal["summary"]["total"] == 1
    assert proposal["summary"]["applied"] == 1
    closed = _close(db_session, env, proposal)
    assert closed["status"] == "CLOSED_FULL"
    assert closed["summary"]["total"] == closed["summary"]["applied"] == 1
    assert db_session.get(models.StocktakeRound, uuid.UUID(env[3]["round_id"])).status == "CLOSED_FULL"
    control = db_session.get(models.StocktakeControl, 1)
    assert control.active_round_id is None and control.epoch > env[3]["epoch"]
    assert db_session.query(models.StocktakeApplication).count() == 1


def test_full_close_rejects_unapplied_latest_attempt(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = confirm(db_session, env)
    proposal = _close_preview(db_session, env, mode="FULL", selected=[])
    assert proposal["summary"]["applied"] == 0
    with pytest.raises(InventoryConflict) as error:
        _close(db_session, env, proposal)
    assert error.value.code == "STOCKTAKE_APPLY_HELD"
    assert db_session.get(models.StocktakeCount, uuid.UUID(count["count_id"])).status == "CONFIRMED"
    assert db_session.get(models.StocktakeRound, uuid.UUID(env[3]["round_id"])).status == "ACTIVE"


def test_partial_close_records_incomplete_target_and_keeps_existing_stock(db_session, make_item):
    env = setup_round(db_session, make_item)
    proposal = _close_preview(db_session, env, reason="Not counted before shift end")
    assert proposal["manifest_id"] and proposal["summary"]["total"] == 1
    assert proposal["summary"]["applied"] == 0
    closed = _close(db_session, env, proposal)
    assert closed["status"] == "CLOSED_PARTIAL"
    assert db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one().warehouse_qty == 10
    control = db_session.get(models.StocktakeControl, 1)
    assert control.active_round_id is None and control.epoch > env[3]["epoch"]
    assert db_session.query(models.StocktakeApplication).count() == 0


def test_closed_round_rejects_new_save_but_replays_saved_and_close_receipts(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    save_key = str(uuid.uuid4())
    save_payload = {"count_id": count["count_id"], "expected_version": count["version"],
                    "fence": count["fence"],
                    "quantities": {"normal": 10, "defect": 0, "b_grade": 0, "obsolete": 0}}
    saved = env[0].execute(db_session, env[1], "count_save", save_key, save_payload)
    proposal = _close_preview(db_session, env, reason="Draft excluded from close")
    close_key = str(uuid.uuid4())
    closed = _close(db_session, env, proposal, key=close_key)
    assert _close(db_session, env, proposal, key=close_key) == closed
    assert env[0].execute(db_session, env[1], "count_save", save_key, save_payload) == saved
    with pytest.raises(InventoryConflict) as error:
        command(db_session, env, "count_save", saved,
                quantities={"normal": 9, "defect": 0, "b_grade": 0, "obsolete": 0})
    assert error.value.code == "ROUND_CLOSED"
    assert db_session.get(models.StocktakeCount, uuid.UUID(count["count_id"])).status == "DRAFT"


@pytest.mark.parametrize("change", ["save", "resume", "pending_target"])
def test_close_preview_is_stale_after_count_or_target_generation_change(db_session, make_item, change):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env) if change == "save" else None
    if change == "resume":
        count = confirm(db_session, env)
    proposal = _close_preview(db_session, env, reason="Reviewed exclusions")
    if change == "save":
        command(db_session, env, "count_save", count,
                quantities={"normal": 10, "defect": 0, "b_grade": 0, "obsolete": 0})
    elif change == "resume":
        command(db_session, env, "count_resume", count,
                reason_code="CANCEL_CONFIRMATION", reason="Recheck")
    else:
        make_item(name="Pending after preview", warehouse_qty=0)
        db_session.commit()
        assert db_session.query(models.StocktakePendingTarget).count() >= 1
    with pytest.raises(InventoryConflict) as error:
        _close(db_session, env, proposal)
    assert error.value.code == "PREVIEW_STALE"
    assert db_session.get(models.StocktakeRound, uuid.UUID(env[3]["round_id"])).status == "ACTIVE"


def test_close_selected_apply_commit_failure_rolls_back_only_new_work(db_session, make_item, monkeypatch):
    env = setup_round(db_session, make_item)
    original = confirm(db_session, env)
    apply(db_session, env, preview(db_session, env, original))
    later_item, later_env = _append_item(db_session, env, make_item)
    selected = confirm(db_session, later_env, normal=7)
    proposal = _close_preview(db_session, env, mode="FULL",
                              selected=[selected["confirmation_revision_id"]], reason="")
    assert proposal["summary"]["total"] == 2
    assert proposal["summary"]["applied"] == 1
    before_applications = db_session.query(models.StocktakeApplication).count()
    def fail_commit():
        raise RuntimeError("simulated close commit failure")
    with monkeypatch.context() as patch:
        patch.setattr(db_session, "commit", fail_commit)
        with pytest.raises(RuntimeError, match="simulated close commit failure"):
            _close(db_session, env, proposal)
    assert db_session.get(models.StocktakeRound, uuid.UUID(env[3]["round_id"])).status == "ACTIVE"
    assert db_session.get(models.StocktakeCount, uuid.UUID(original["count_id"])).status == "APPLIED"
    assert db_session.get(models.StocktakeCount, uuid.UUID(selected["count_id"])).status == "CONFIRMED"
    assert db_session.query(models.StocktakeApplication).count() == before_applications
    assert db_session.query(models.Inventory).filter_by(item_id=later_item.item_id).one().warehouse_qty == 5
    assert db_session.get(models.StocktakeControl, 1).active_round_id == uuid.UUID(env[3]["round_id"])


def test_partial_close_requires_nonblank_reason(db_session, make_item):
    env = setup_round(db_session, make_item)
    with pytest.raises(ValidationError):
        _close_preview(db_session, env, reason="   ")
    assert db_session.query(models.StocktakePreview).filter_by(kind="round_close").count() == 0


def test_only_department_approver_may_preview_and_confirm_close(db_session, make_item):
    env = setup_round(db_session, make_item)
    staff = models.Employee(employee_code="CLOSE-STAFF", name="Staff", role="staff",)
    db_session.add(staff)
    db_session.commit()
    payload = {"round_id": env[3]["round_id"], "mode": "PARTIAL",
               "reason": "Unfinished target", "confirmation_revision_ids": []}
    with pytest.raises(InventoryConflict) as error:
        env[0].execute(db_session, staff, "round_close_preview", str(uuid.uuid4()), payload)
    assert (error.value.code, error.value.status_code) == ("FORBIDDEN", 403)
    proposal = _close_preview(db_session, env, reason="Unfinished target")
    with pytest.raises(InventoryConflict) as error:
        _close(db_session, env, proposal, actor=staff)
    assert (error.value.code, error.value.status_code) == ("FORBIDDEN", 403)
    assert _close(db_session, env, proposal)["status"] == "CLOSED_PARTIAL"
