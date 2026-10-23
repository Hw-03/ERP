"""Stocktake pauses preserve draft intent and require explicit, cell-complete resume."""
import uuid

import pytest

from app import models
from app.schemas.io import IoDraftUpsert
from app.services import io_draft
from app.services.work_reservation_errors import WorkReservationError
from tests.services.test_io_draft_reservations import draft_payload, owner
from tests.services.test_stocktake_counts import setup_round


def saved_work(db, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=10)
    payload = draft_payload(owner, item)
    saved = io_draft.save_draft(db, IoDraftUpsert.model_validate(payload))
    db.commit()
    return item, payload, saved


def start_with_work(db, make_item, owner):
    item, payload, saved = saved_work(db, make_item, owner)
    db.add(models.Department(name="조립", is_active=True))
    db.add(models.InventoryScope(scope_key="assembly", physical_department="조립"))
    db.commit()
    env = setup_round(db, make_item)
    return item, payload, saved, env


def mark_applied(db, round_id, item_id, *, scopes=("warehouse", "assembly")):
    """Seed the durable result boundary; application mechanics have their own tests."""
    from app.services.stocktake_targets import round_targets
    for target in round_targets(db, uuid.UUID(str(round_id))).filter(
        models.StocktakeTarget.item_id == item_id,
        models.StocktakeTarget.scope_key.in_(scopes),
    ).all():
        count = models.StocktakeCount(round_id=uuid.UUID(str(round_id)), target_id=target.target_id,
            owner_id=db.query(models.Employee).first().employee_id, owner_name="Counter",
            fence=1, quantity_revision=0, quantities={}, baseline={}, status="APPLIED")
        db.add(count)
        db.flush()
        target.latest_count_id = count.count_id
    db.commit()


def test_round_start_releases_draft_reservations_and_preserves_contents(db_session, make_item, owner):
    item, _, saved, _ = start_with_work(db_session, make_item, owner)
    batch = db_session.get(models.IoBatch, saved["batch_id"])
    assert batch.status == "draft"
    assert batch.reservation_status == "inactive"
    assert batch.effective_plan == saved["effective_plan"]
    assert batch.bundles[0].lines[0].quantity == 3
    assert db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 0
    assert batch.revision == saved["revision"] + 1


def test_paused_work_rejects_save_without_explicit_resume(db_session, make_item, owner):
    _, payload, saved, _ = start_with_work(db_session, make_item, owner)
    batch = db_session.get(models.IoBatch, saved["batch_id"])
    payload.update(batch_id=str(batch.batch_id), expected_revision=batch.revision)
    with pytest.raises(WorkReservationError) as error:
        io_draft.save_draft(db_session, IoDraftUpsert.model_validate(payload))
    assert error.value.code == "WORK_STOCKTAKE_PAUSED"
    db_session.rollback()


def test_resume_waits_for_both_transfer_cells_then_reserves_remaining_quantity(db_session, make_item, owner):
    item, payload, saved, env = start_with_work(db_session, make_item, owner)
    from app.services.work_stocktake_pause import pause_payload
    batch = db_session.get(models.IoBatch, saved["batch_id"])
    pause = pause_payload(db_session, "io", batch.batch_id)
    assert pause["pending_target_count"] == 2
    mark_applied(db_session, env[3]["round_id"], item.item_id, scopes=("warehouse",))
    assert pause_payload(db_session, "io", batch.batch_id)["state"] == "blocked"
    mark_applied(db_session, env[3]["round_id"], item.item_id, scopes=("assembly",))
    assert pause_payload(db_session, "io", batch.batch_id)["state"] == "ready"
    payload.update(batch_id=str(batch.batch_id), expected_revision=batch.revision,
                   stocktake_resume_token=pause["token"])
    payload["bundles"][0]["lines"][0]["quantity"] = 1
    result = io_draft.save_draft(db_session, IoDraftUpsert.model_validate(payload))
    db_session.commit()
    assert result["reservation_status"] == "reserved"
    assert pause_payload(db_session, "io", batch.batch_id) is None
    assert db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 1


def test_new_work_during_round_is_saved_without_reservation(db_session, make_item, owner):
    item, _, _, _ = start_with_work(db_session, make_item, owner)
    payload = draft_payload(owner, item)
    saved = io_draft.save_draft(db_session, IoDraftUpsert.model_validate(payload))
    assert saved["reservation_status"] == "inactive"
    assert db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 0


def test_paused_work_cannot_submit_or_be_backfilled(db_session, make_item, owner):
    from app.services.io_dispatch import submit_existing_draft
    from app.services.work_reservation_backfill import backfill_work_reservations
    _, _, saved, _ = start_with_work(db_session, make_item, owner)
    batch = db_session.get(models.IoBatch, saved["batch_id"])
    with pytest.raises(WorkReservationError) as error:
        submit_existing_draft(db_session, batch_id=batch.batch_id,
            requester_employee_id=owner.employee_id, expected_revision=batch.revision)
    assert error.value.code == "WORK_STOCKTAKE_PAUSED"
    db_session.rollback()
    report = backfill_work_reservations(db_session, apply=True)
    assert report == [{"batch_id": str(batch.batch_id), "status": "skipped", "issue": "stocktake_paused"}]


def test_revert_approval_during_round_returns_paused_work(db_session, make_item):
    from app.services import stock_request_actions
    from tests.services.test_work_reservation_approval_lifecycle import _case
    item, requester, _, batch, request = _case(db_session, make_item)
    setup_round(db_session, make_item)
    stock_request_actions.revert_to_draft(db_session, request=request, requester=requester,
        pin="0000", expected_revision=batch.revision)
    assert batch.status == "draft" and batch.reservation_status == "inactive"
    assert db_session.get(models.StocktakeWorkPause, ("io", batch.batch_id)) is not None
    assert db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 0


def test_recount_pauses_resumed_work_and_preserves_other_draft_items(db_session, make_item, owner):
    from app.services.work_stocktake_pause import pause_payload
    item, payload, saved, env = start_with_work(db_session, make_item, owner)
    mark_applied(db_session, env[3]["round_id"], item.item_id)
    batch = db_session.get(models.IoBatch, saved["batch_id"])
    original = pause_payload(db_session, "io", batch.batch_id)
    payload.update(batch_id=str(batch.batch_id), expected_revision=batch.revision,
                   stocktake_resume_token=original["token"])
    io_draft.save_draft(db_session, IoDraftUpsert.model_validate(payload))
    db_session.commit()
    target = next(row for row in env[0].list_targets(db_session, uuid.UUID(env[3]["round_id"]))["items"]
                  if row["item_id"] == str(item.item_id) and row["scope_id"] == "warehouse")
    env[0].execute(db_session, env[1], "count_start", str(uuid.uuid4()), {
        "target_id": target["target_id"], "expected_target_version": target["version"], "round_epoch": env[3]["epoch"]})
    renewed = pause_payload(db_session, "io", batch.batch_id)
    assert renewed["state"] == "blocked" and renewed["token"] != original["token"]
    assert db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 0


def test_resume_shortage_rolls_back_content_and_pause(db_session, make_item, owner):
    from app.services.work_stocktake_pause import pause_payload
    item, payload, saved, env = start_with_work(db_session, make_item, owner)
    mark_applied(db_session, env[3]["round_id"], item.item_id)
    batch = db_session.get(models.IoBatch, saved["batch_id"])
    original = pause_payload(db_session, "io", batch.batch_id)
    revision = batch.revision
    payload.update(batch_id=str(batch.batch_id), expected_revision=revision,
                   stocktake_resume_token=original["token"], notes="Must roll back")
    payload["bundles"][0]["lines"][0]["quantity"] = 11
    with pytest.raises(WorkReservationError) as error:
        io_draft.save_draft(db_session, IoDraftUpsert.model_validate(payload))
    assert error.value.code == "STOCK_SHORTAGE"
    db_session.rollback()
    assert batch.bundles[0].lines[0].quantity == 3 and batch.notes is None
    assert batch.revision == revision
    assert pause_payload(db_session, "io", batch.batch_id) == original


def test_direct_submit_blocked_until_all_its_cells_applied(db_session, make_item, owner):
    from app.services.io_dispatch import submit
    from app.schemas.io import IoSubmitRequest
    item, _, _, env = start_with_work(db_session, make_item, owner)
    with pytest.raises(WorkReservationError) as error:
        submit(db_session, IoSubmitRequest.model_validate(draft_payload(owner, item)))
    assert error.value.code == "WORK_STOCKTAKE_PAUSED"
    db_session.rollback()
    mark_applied(db_session, env[3]["round_id"], item.item_id)
    result = submit(db_session, IoSubmitRequest.model_validate(draft_payload(owner, item)))
    assert result["status"] != "draft"


def test_missing_target_and_latest_abandoned_attempt_stay_blocked(db_session, make_item, owner):
    from app.services.work_stocktake_pause import pause_payload
    item, _, saved, env = start_with_work(db_session, make_item, owner)
    mark_applied(db_session, env[3]["round_id"], item.item_id)
    pause = db_session.get(models.StocktakeWorkPause, ("io", saved["batch_id"]))
    target = db_session.query(models.StocktakeTarget).filter_by(item_id=item.item_id, scope_key="warehouse").one()
    previous = target.latest_count_id
    count = models.StocktakeCount(round_id=pause.round_id, target_id=target.target_id,
        owner_id=owner.employee_id, owner_name=owner.name, status="ABANDONED", fence=2,
        quantity_revision=0, quantities={}, baseline={}, previous_count_id=previous)
    db_session.add(count)
    db_session.flush()
    target.latest_count_id = count.count_id
    pause.required_cells = [*pause.required_cells, {"item_id": str(item.item_id), "scope_key": "missing"}]
    db_session.commit()
    result = pause_payload(db_session, "io", pause.work_id)
    assert result["state"] == "blocked"
    assert result["pending_target_count"] == result["missing_target_count"] == 1


def test_resume_token_cannot_be_replayed_as_an_ordinary_save(db_session, make_item, owner):
    from app.services.work_stocktake_pause import ensure_work_save
    item = make_item(warehouse_qty=10)
    with pytest.raises(WorkReservationError) as error:
        ensure_work_save(db_session, "stock_request", uuid.uuid4(),
            [{"item_id": str(item.item_id), "scope_key": "warehouse"}], uuid.uuid4())
    assert error.value.code == "WORK_STOCKTAKE_PAUSED"


def test_new_io_work_rejects_stray_resume_token(db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=10)
    payload = draft_payload(owner, item)
    payload["stocktake_resume_token"] = str(uuid.uuid4())
    with pytest.raises(WorkReservationError) as error:
        io_draft.save_draft(db_session, IoDraftUpsert.model_validate(payload))
    assert error.value.code == "WORK_STOCKTAKE_PAUSED"


def test_partial_close_keeps_pause_and_next_round_replaces_its_boundary(db_session, make_item, owner):
    from app.services.work_stocktake_pause import pause_payload
    from tests.services.test_stocktake_close_contract import _close, _close_preview
    _, _, saved, env = start_with_work(db_session, make_item, owner)
    before = pause_payload(db_session, "io", saved["batch_id"])
    proposal = _close_preview(db_session, env)
    _close(db_session, env, proposal)
    assert pause_payload(db_session, "io", saved["batch_id"]) == before
    proposal = env[0].execute(db_session, env[1], "round_start_preview", str(uuid.uuid4()), {"title": "Next"})
    next_round = env[0].execute(db_session, env[1], "round_start", str(uuid.uuid4()), {
        "preview_id": proposal["preview_id"], "preview_hash": proposal["preview_hash"]})
    after = pause_payload(db_session, "io", saved["batch_id"])
    assert after["round_id"] == next_round["round_id"] != before["round_id"]
    assert after["token"] != before["token"] and after["state"] == "blocked"


def test_round_start_prepares_all_drafts_item_union_once(db_session, make_item, owner):
    items = [saved_work(db_session, make_item, owner)[0] for _ in range(2)]
    setup_round(db_session, make_item)
    assert db_session.query(models.StocktakeWorkPause).count() == 2
    assert all(db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 0
               for item in items)


def test_append_only_refreshes_affected_pause(db_session, make_item, owner):
    from app.services.work_stocktake_pause import pause_payload
    _, _, first, env = start_with_work(db_session, make_item, owner)
    before = pause_payload(db_session, "io", first["batch_id"])
    later = make_item(process_type_code="AR", warehouse_qty=10)
    second = io_draft.save_draft(db_session, IoDraftUpsert.model_validate(draft_payload(owner, later)))
    db_session.commit()
    missing = pause_payload(db_session, "io", second["batch_id"])
    assert missing["missing_target_count"] == 2
    proposal = env[0].execute(db_session, env[1], "target_append_preview", str(uuid.uuid4()), {"round_id": env[3]["round_id"]})
    env[0].execute(db_session, env[1], "target_append", str(uuid.uuid4()), {"round_id": env[3]["round_id"],
        "preview_id": proposal["preview_id"], "preview_hash": proposal["preview_hash"]})
    assert pause_payload(db_session, "io", first["batch_id"]) == before
    admitted = pause_payload(db_session, "io", second["batch_id"])
    assert admitted["missing_target_count"] == 0 and admitted["pending_target_count"] == 2
    assert admitted["token"] != missing["token"]


def test_changed_resume_cells_must_also_have_applied_targets(db_session, make_item, owner):
    from app.services.work_stocktake_pause import pause_payload
    item, payload, saved, env = start_with_work(db_session, make_item, owner)
    mark_applied(db_session, env[3]["round_id"], item.item_id)
    batch = db_session.get(models.IoBatch, saved["batch_id"])
    original = pause_payload(db_session, "io", batch.batch_id)
    added = make_item(process_type_code="AR", warehouse_qty=10)
    db_session.commit()
    payload.update(batch_id=str(batch.batch_id), expected_revision=batch.revision, stocktake_resume_token=original["token"])
    payload["bundles"].extend(draft_payload(owner, added)["bundles"])
    with pytest.raises(WorkReservationError) as error:
        io_draft.save_draft(db_session, IoDraftUpsert.model_validate(payload))
    assert error.value.code == "WORK_STOCKTAKE_PAUSED"
    db_session.rollback()
    assert len(batch.bundles) == 1
    assert pause_payload(db_session, "io", batch.batch_id) == original


def test_paused_delete_discards_pause_without_reacquiring_stock(db_session, make_item, owner):
    _, _, saved, _ = start_with_work(db_session, make_item, owner)
    batch = db_session.get(models.IoBatch, saved["batch_id"])
    io_draft.delete_draft(db_session, batch_id=batch.batch_id, requester_employee_id=owner.employee_id,
                          expected_revision=batch.revision)
    assert db_session.get(models.StocktakeWorkPause, ("io", batch.batch_id)) is None
    assert batch.status == "cancelled"
    assert db_session.query(models.IoDraftReservation).count() == 0


def test_backfill_cannot_revive_an_unpaused_legacy_draft_inside_round(db_session, make_item, owner):
    from app.services.work_reservation_backfill import backfill_work_reservations
    _, _, saved, _ = start_with_work(db_session, make_item, owner)
    pause = db_session.get(models.StocktakeWorkPause, ("io", saved["batch_id"]))
    db_session.delete(pause)
    db_session.commit()
    for apply in (False, True):
        result = backfill_work_reservations(db_session, apply=apply)
        assert result == [{"batch_id": str(saved["batch_id"]), "status": "skipped", "issue": "stocktake_paused"}]
        assert db_session.query(models.IoDraftReservation).count() == 0


def test_returned_draft_pauses_without_acquiring_late_inventory_locks(db_session, make_item, owner):
    from app.services import stocktake_guard, work_stocktake_pause
    item, _, saved, env = start_with_work(db_session, make_item, owner)
    mark_applied(db_session, env[3]["round_id"], item.item_id)
    work_stocktake_pause.remove_pause(db_session, "io", saved["batch_id"])
    db_session.commit()
    stocktake_guard.lock_control(db_session)
    batch = db_session.get(models.IoBatch, saved["batch_id"])
    work_stocktake_pause.pause_returned_draft(db_session, batch)
    assert db_session.info[stocktake_guard.STATE_KEY]["items"] is None
    assert work_stocktake_pause.pause_payload(db_session, "io", batch.batch_id)["state"] == "ready"


def test_work_depends_on_output_item_as_well_as_input_item(db_session, make_item, owner):
    from app.services.work_stocktake_pause import pause_payload
    material, _, saved = saved_work(db_session, make_item, owner)
    output = make_item(process_type_code="AR", warehouse_qty=0)
    batch = db_session.get(models.IoBatch, saved["batch_id"])
    input_effect = {**batch.effective_plan["effects"][0], "to": None, "kind": "out"}
    output_effect = {**input_effect, "item_id": str(output.item_id), "kind": "in",
                     "from": None, "to": {"bucket": "warehouse", "department": None}}
    batch.effective_plan = {**batch.effective_plan, "effects": [input_effect, output_effect]}
    db_session.commit()
    env = setup_round(db_session, make_item)
    mark_applied(db_session, env[3]["round_id"], material.item_id, scopes=("warehouse",))
    pause = pause_payload(db_session, "io", batch.batch_id)
    assert pause["state"] == "blocked" and pause["pending_target_count"] == 1
    mark_applied(db_session, env[3]["round_id"], output.item_id, scopes=("warehouse",))
    assert pause_payload(db_session, "io", batch.batch_id)["state"] == "ready"


def test_legacy_without_effective_plan_preserves_included_line_dependencies(db_session, make_item, owner):
    item, _, saved = saved_work(db_session, make_item, owner)
    batch = db_session.get(models.IoBatch, saved["batch_id"])
    batch.effective_plan = None
    db_session.commit()
    setup_round(db_session, make_item)
    pause = db_session.get(models.StocktakeWorkPause, ("io", batch.batch_id))
    assert {cell["scope_key"] for cell in pause.required_cells} == {"warehouse", "unresolved:production:조립"}
    assert batch.effective_plan is None and batch.bundles[0].lines[0].quantity == 3
    assert db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 0
