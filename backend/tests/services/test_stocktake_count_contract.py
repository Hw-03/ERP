"""Count command boundaries beyond the basic lifecycle fixtures."""
import uuid
from datetime import timedelta

import pytest
from pydantic import ValidationError

from app import models
from app.services.inventory_conflicts import InventoryConflict
from app.services.operator_session import issue_session, resolve_session, utc_now_naive
from app.services import stocktake_guard
from tests.services.test_stocktake_counts import command, setup_round, start_count


QUANTITIES = {"normal": 10, "defect": 0, "b_grade": 0, "obsolete": 0}


def other_actor(db, *, admin):
    actor = models.Employee(employee_code=f"OTHER-{'ADMIN' if admin else 'STAFF'}",
                            name="Other counter", role="admin" if admin else "staff",
                            department_role="primary" if admin else "none")
    db.add(actor)
    db.commit()
    return actor


@pytest.mark.parametrize("kind", ["count_save", "count_confirm", "count_abandon"])
def test_non_owner_cannot_change_count(db_session, make_item, kind):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    stranger = other_actor(db_session, admin=True)
    payload = {"count_id": count["count_id"], "expected_version": count["version"], "fence": count["fence"]}
    if kind == "count_save":
        payload["quantities"] = QUANTITIES
    if kind == "count_abandon":
        payload.update(reason_code="LEAVE", reason="Shift end")
    with pytest.raises(InventoryConflict) as error:
        env[0].execute(db_session, stranger, kind, str(uuid.uuid4()), payload)
    assert (error.value.code, error.value.status_code) == ("NOT_COUNT_OWNER", 403)
    assert db_session.get(models.StocktakeCount, uuid.UUID(count["count_id"])).version == count["version"]


def test_force_release_requires_admin_and_reason_and_records_actual_actor(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    staff = other_actor(db_session, admin=False)
    admin = other_actor(db_session, admin=True)
    payload = {"count_id": count["count_id"], "expected_version": count["version"], "fence": count["fence"],
               "reason_code": "SHIFT_HANDOVER", "reason": "Owner cannot continue"}
    with pytest.raises(InventoryConflict) as error:
        env[0].execute(db_session, staff, "count_force_release", str(uuid.uuid4()), payload)
    assert (error.value.code, error.value.status_code) == ("FORBIDDEN", 403)
    with pytest.raises(ValidationError):
        env[0].execute(db_session, admin, "count_force_release", str(uuid.uuid4()), {**payload, "reason": ""})
    released = env[0].execute(db_session, admin, "count_force_release", str(uuid.uuid4()), payload)
    event = db_session.get(models.StocktakeEvent, uuid.UUID(released["event_id"]))
    assert released["status"] == "ABANDONED"
    assert event.kind == "COUNT_FORCE_RELEASED"
    assert event.actor_id == admin.employee_id and event.actor_name == admin.name
    assert event.payload["reason_code"] == "SHIFT_HANDOVER"
    assert event.payload["reason"] == "Owner cannot continue"


def test_confirmation_cancel_keeps_observation_and_records_reason(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    saved = command(db_session, env, "count_save", count, quantities=QUANTITIES)
    confirmed = command(db_session, env, "count_confirm", saved)
    resumed = command(db_session, env, "count_resume", confirmed,
                      reason_code="CANCEL_CONFIRMATION", reason="Recheck classification")
    event = db_session.get(models.StocktakeEvent, uuid.UUID(resumed["event_id"]))
    assert resumed["status"] == "DRAFT" and resumed["quantities"] == QUANTITIES
    assert resumed["confirmation_revision_id"] is None
    assert event.kind == "CONFIRMATION_CANCELLED"
    assert event.payload["invalidated_confirmation_revision_id"] == confirmed["confirmation_revision_id"]
    assert event.payload["reason_code"] == "CANCEL_CONFIRMATION"
    assert event.payload["reason"] == "Recheck classification"
    assert event.actor_id == env[1].employee_id


def test_expired_operator_session_does_not_release_gate(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    token, session = issue_session(db_session, employee=env[1], tab_id="count-tab")
    session.expires_at = utc_now_naive() - timedelta(seconds=1)
    db_session.commit()
    assert resolve_session(db_session, token) is None
    gate = db_session.get(models.StocktakeGate, (env[2].item_id, "warehouse"))
    assert gate.active_count_id == uuid.UUID(count["count_id"])
    assert db_session.get(models.StocktakeCount, uuid.UUID(count["count_id"])).status == "DRAFT"


def test_recount_starts_blank_and_preserves_prior_attempt(db_session, make_item):
    env = setup_round(db_session, make_item)
    first = start_count(db_session, env)
    saved = command(db_session, env, "count_save", first, quantities=QUANTITIES)
    abandoned = command(db_session, env, "count_abandon", saved, reason_code="RECOUNT", reason="Fresh count")
    target = db_session.get(models.StocktakeTarget, uuid.UUID(env[4]["target_id"]))
    fresh = env[0].execute(db_session, env[1], "count_start", str(uuid.uuid4()), {
        "target_id": str(target.target_id), "expected_target_version": target.version, "round_epoch": env[3]["epoch"]})
    row = db_session.get(models.StocktakeCount, uuid.UUID(fresh["count_id"]))
    assert row.previous_count_id == uuid.UUID(first["count_id"])
    assert fresh["count_id"] != first["count_id"] and fresh["fence"] > abandoned["fence"]
    assert fresh["quantities"] == dict.fromkeys(QUANTITIES)
    assert db_session.get(models.StocktakeCount, uuid.UUID(first["count_id"])).quantities == QUANTITIES


def test_box_tracking_blocks_warehouse_count_start(db_session, make_item):
    env = setup_round(db_session, make_item)
    db_session.add(models.SystemSetting(setting_key="warehouse_box_tracking_enabled", setting_value="true"))
    db_session.commit()
    with pytest.raises(InventoryConflict) as error:
        start_count(db_session, env)
    assert (error.value.code, error.value.status_code) == ("STOCKTAKE_APPLY_HELD", 422)
    assert db_session.query(models.StocktakeCount).count() == 0


def test_reservation_release_advances_preview_revision_without_invalidating_count(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    gate = db_session.get(models.StocktakeGate, (env[2].item_id, "warehouse"))
    original_quantity_revision = gate.quantity_revision
    original_reservation_revision = gate.reservation_revision
    progress = db_session.get(models.StocktakeProgress, (uuid.UUID(env[3]["round_id"]), "warehouse"))
    original_progress_revision = progress.progress_revision
    stocktake_guard.prepare_items(db_session, [env[2].item_id])
    stocktake_guard.record_change(db_session, env[2].item_id, "창고", kind="reservation", delta=-1)
    db_session.commit()
    db_session.refresh(gate)
    db_session.refresh(progress)
    assert gate.reservation_revision == original_reservation_revision + 1
    assert gate.quantity_revision == original_quantity_revision
    assert progress.progress_revision == original_progress_revision + 1
    saved = command(db_session, env, "count_save", count, quantities=QUANTITIES)
    assert command(db_session, env, "count_confirm", saved)["status"] == "CONFIRMED"


def test_quantity_revision_change_rejects_confirmation(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    saved = command(db_session, env, "count_save", count, quantities=QUANTITIES)
    gate = db_session.get(models.StocktakeGate, (env[2].item_id, "warehouse"))
    gate.quantity_revision += 1
    db_session.commit()
    with pytest.raises(InventoryConflict) as error:
        command(db_session, env, "count_confirm", saved)
    assert error.value.code == "COUNT_VERSION_CONFLICT"
    assert db_session.get(models.StocktakeCount, uuid.UUID(count["count_id"])).status == "DRAFT"


def test_reservation_release_invalidates_sealed_application_preview(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    saved = command(db_session, env, "count_save", count, quantities=QUANTITIES)
    confirmed = command(db_session, env, "count_confirm", saved)
    preview = env[0].execute(db_session, env[1], "application_preview", str(uuid.uuid4()), {
        "round_id": env[3]["round_id"],
        "confirmation_revision_ids": [confirmed["confirmation_revision_id"]]})
    original_revision = preview["entries"][0]["reservation_revision"]
    stocktake_guard.prepare_items(db_session, [env[2].item_id])
    stocktake_guard.record_change(db_session, env[2].item_id, "창고", kind="reservation", delta=-1)
    db_session.commit()
    gate = db_session.get(models.StocktakeGate, (env[2].item_id, "warehouse"))
    assert gate.reservation_revision == original_revision + 1
    with pytest.raises(InventoryConflict) as error:
        env[0].execute(db_session, env[1], "application_apply", str(uuid.uuid4()), {
            "round_id": env[3]["round_id"], "preview_id": preview["preview_id"],
            "preview_hash": preview["preview_hash"]})
    assert error.value.code == "PREVIEW_STALE"
    assert db_session.get(models.StocktakeCount, uuid.UUID(count["count_id"])).status == "CONFIRMED"


def test_closed_round_rejects_new_save_but_replays_prior_receipt(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    key = str(uuid.uuid4())
    payload = {"count_id": count["count_id"], "expected_version": count["version"],
               "fence": count["fence"], "quantities": QUANTITIES}
    saved = env[0].execute(db_session, env[1], "count_save", key, payload)
    round_ = db_session.get(models.StocktakeRound, uuid.UUID(env[3]["round_id"]))
    round_.status = "CLOSED_FULL"
    db_session.commit()
    assert env[0].execute(db_session, env[1], "count_save", key, payload) == saved
    with pytest.raises(InventoryConflict) as error:
        env[0].execute(db_session, env[1], "count_save", str(uuid.uuid4()), {
            **payload, "expected_version": saved["version"]})
    assert error.value.code == "ROUND_CLOSED"
    assert db_session.query(models.StocktakeReceipt).filter_by(command_kind="count_save").count() == 1


def test_failed_save_commit_rolls_back_count_event_and_receipt(db_session, make_item, monkeypatch):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    before_events = db_session.query(models.StocktakeEvent).count()
    before_receipts = db_session.query(models.StocktakeReceipt).count()
    def fail_commit():
        raise RuntimeError("simulated commit failure")
    with monkeypatch.context() as patch:
        patch.setattr(db_session, "commit", fail_commit)
        with pytest.raises(RuntimeError, match="simulated commit failure"):
            command(db_session, env, "count_save", count, quantities=QUANTITIES)
    persisted = db_session.get(models.StocktakeCount, uuid.UUID(count["count_id"]))
    assert persisted.version == count["version"] and persisted.quantities == count["quantities"]
    assert db_session.query(models.StocktakeEvent).count() == before_events
    assert db_session.query(models.StocktakeReceipt).count() == before_receipts


@pytest.mark.parametrize("quantities", [
    {"normal": 2147483647, "defect": 1, "b_grade": 0, "obsolete": 0},
    {"normal": 1, "defect": 0, "b_grade": 0},
    {"normal": 1, "defect": 0, "b_grade": 0, "obsolete": 0, "extra": 0},
])
def test_quantity_payload_requires_exact_four_categories_and_bounded_sum(db_session, make_item, quantities):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    with pytest.raises(ValidationError):
        command(db_session, env, "count_save", count, quantities=quantities)
    assert db_session.query(models.StocktakeEvent).filter_by(kind="DRAFT_SAVED").count() == 0
