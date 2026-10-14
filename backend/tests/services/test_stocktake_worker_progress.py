"""Worker comparisons deduplicate items without changing location completion totals."""
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import event

from app import models
from app.services import stocktake_reports
from tests.services.test_stocktake_counts import setup_round, start_count, command


def test_workers_include_all_participants_and_deduplicate_locations(db_session, make_item):
    env = setup_round(db_session, make_item)
    service, actor, item, round_, target = env
    first = start_count(db_session, env)
    command(db_session, env, "count_abandon", first, reason="중단", reason_code="OPERATOR_REQUEST")
    other = models.Employee(employee_code="WORKER-OTHER", name="다른 작업자", role="staff")
    idle = models.Employee(employee_code="WORKER-IDLE", name="미참여 직원", role="staff")
    db_session.add_all([other, idle])
    db_session.commit()
    latest = db_session.get(models.StocktakeTarget, uuid.UUID(target["target_id"]))
    service.execute(db_session, other, "count_start", str(uuid.uuid4()), {
        "target_id": target["target_id"], "expected_target_version": latest.version,
        "round_epoch": round_["epoch"],
    })
    duplicate_target = models.StocktakeTarget(target_id=uuid.uuid4(), set_id=latest.set_id,
        item_id=item.item_id, scope_key="tube", item_code=latest.item_code,
        item_name=latest.item_name, unit=latest.unit, scope_name="튜브")
    db_session.add(duplicate_target)
    db_session.flush()
    duplicate = models.StocktakeCount(count_id=uuid.uuid4(), round_id=uuid.UUID(round_["round_id"]),
        target_id=duplicate_target.target_id, owner_id=other.employee_id, owner_name=other.name,
        status="DRAFT", version=0, fence=1, quantity_revision=0,
        quantities={"normal": None, "defect": None, "b_grade": None, "obsolete": None}, baseline={})
    db_session.add(duplicate)
    db_session.commit()
    entries = [
        {"owner_id": str(other.employee_id), "owner_name": other.name, "item_id": str(item.item_id), "classification": "ALREADY_APPLIED"},
        {"owner_id": str(other.employee_id), "owner_name": other.name, "item_id": str(item.item_id), "classification": "CONFIRMED_EXCLUDED"},
        {"owner_id": None, "item_id": str(uuid.uuid4()), "classification": "PENDING_UNADMITTED"},
    ]
    rows = stocktake_reports.worker_progress(db_session, uuid.UUID(round_["round_id"]), entries)
    by_id = {row["owner_id"]: row for row in rows}
    assert set(by_id) == {str(actor.employee_id), str(other.employee_id)}
    assert by_id[str(actor.employee_id)] == {"owner_id": str(actor.employee_id), "owner_name": actor.name, "surveyed": 1, "confirmed": 0, "applied": 0,
        "quantities_by_unit": [{"unit": "EA", "surveyed": 0, "confirmed": 0, "applied": 0}]}
    assert by_id[str(other.employee_id)] == {"owner_id": str(other.employee_id), "owner_name": other.name, "surveyed": 1, "confirmed": 1, "applied": 1,
        "quantities_by_unit": [{"unit": "EA", "surveyed": 0, "confirmed": None, "applied": None}]}
    assert rows[0]["owner_id"] == str(other.employee_id)
    assert not db_session.new and not db_session.dirty and not db_session.deleted


def test_closed_worker_counts_project_only_selected_application(db_session, make_item):
    env = setup_round(db_session, make_item)
    _, actor, item, round_, _ = env
    start_count(db_session, env)
    entries = [{"owner_id": str(actor.employee_id), "owner_name": actor.name,
        "item_id": str(item.item_id), "classification": "SELECTED_APPLY"}]
    live = stocktake_reports.worker_progress(db_session, uuid.UUID(round_["round_id"]), entries)
    closed = stocktake_reports.worker_progress(db_session, uuid.UUID(round_["round_id"]), entries, project_selected=True)
    assert live[0]["confirmed"] == closed[0]["confirmed"] == 1
    assert live[0]["applied"] == 0
    assert closed[0]["applied"] == 1


def test_round_without_participants_has_no_worker_rows(db_session, make_item):
    env = setup_round(db_session, make_item)
    assert stocktake_reports.worker_progress(db_session, uuid.UUID(env[3]["round_id"]), []) == []


def _quantities(normal, defect=0, b_grade=0, obsolete=0):
    return {"normal": normal, "defect": defect, "b_grade": b_grade, "obsolete": obsolete}


def _worker_row(db, env):
    round_id = uuid.UUID(env[3]["round_id"])
    report = stocktake_reports.snapshot(db, round_id, set())
    return stocktake_reports.worker_progress(db, round_id, report["entries"])[0]


def _recount(db, env):
    target = db.get(models.StocktakeTarget, uuid.UUID(env[4]["target_id"]))
    return env[0].execute(db, env[1], "count_start", str(uuid.uuid4()), {
        "target_id": str(target.target_id), "expected_target_version": target.version,
        "round_epoch": env[3]["epoch"],
    })


def test_worker_quantities_use_last_saved_attempt_without_accumulating_autosaves(db_session, make_item):
    env = setup_round(db_session, make_item)
    first = start_count(db_session, env)
    first = command(db_session, env, "count_save", first, quantities=_quantities(100))
    first = command(db_session, env, "count_save", first, quantities=_quantities(105))
    command(db_session, env, "count_abandon", first, reason="Recount", reason_code="EDIT")
    latest = _recount(db_session, env)
    latest = command(db_session, env, "count_save", latest, quantities=_quantities(110, 2, 3, 4))
    command(db_session, env, "count_save", latest, quantities=_quantities(110, 2, 3, 4))

    row = _worker_row(db_session, env)
    assert row["surveyed"] == 1
    assert row["quantities_by_unit"] == [{"unit": "EA", "surveyed": 119, "confirmed": 0, "applied": 0}]


@pytest.mark.parametrize("partial, expected", [(_quantities(0, None, None, None), 0),
                                                (_quantities(None, 2, None, 3), 5)])
def test_worker_quantities_keep_partial_saved_zero_and_abandoned_work(db_session, make_item, partial, expected):
    env = setup_round(db_session, make_item)
    first = start_count(db_session, env)
    first = command(db_session, env, "count_save", first, quantities=_quantities(100))
    command(db_session, env, "count_abandon", first, reason="Recount", reason_code="EDIT")
    latest = _recount(db_session, env)
    latest = command(db_session, env, "count_save", latest, quantities=partial)
    command(db_session, env, "count_abandon", latest, reason="Leave", reason_code="LEAVE")
    _recount(db_session, env)  # A fresh blank attempt must retain the actual last observation.

    assert _worker_row(db_session, env)["quantities_by_unit"] == [
        {"unit": "EA", "surveyed": expected, "confirmed": 0, "applied": 0}]


def test_worker_quantities_start_only_has_target_unit_and_zero(db_session, make_item):
    env = setup_round(db_session, make_item)
    target = db_session.get(models.StocktakeTarget, uuid.UUID(env[4]["target_id"]))
    target.unit = " ea "
    db_session.commit()
    start_count(db_session, env)

    assert _worker_row(db_session, env)["quantities_by_unit"] == [
        {"unit": "EA", "surveyed": 0, "confirmed": 0, "applied": 0}]


def test_worker_quantities_keep_each_owner_last_saved_value_after_takeover(db_session, make_item):
    env = setup_round(db_session, make_item)
    first = start_count(db_session, env)
    first = command(db_session, env, "count_save", first, quantities=_quantities(100))
    command(db_session, env, "count_abandon", first, reason="Leave", reason_code="LEAVE")
    other = models.Employee(employee_code="QUANTITY-OTHER", name="Other", role="staff")
    db_session.add(other)
    db_session.commit()
    other_env = (env[0], other, *env[2:])
    latest = _recount(db_session, other_env)
    saved = command(db_session, other_env, "count_save", latest, quantities=_quantities(110))
    command(db_session, other_env, "count_confirm", saved)
    round_id = uuid.UUID(env[3]["round_id"])
    entries = stocktake_reports.snapshot(db_session, round_id, set())["entries"]
    rows = {row["owner_id"]: row for row in stocktake_reports.worker_progress(db_session, round_id, entries)}

    assert rows[str(env[1].employee_id)]["quantities_by_unit"] == [
        {"unit": "EA", "surveyed": 100, "confirmed": 0, "applied": 0}]
    assert rows[str(other.employee_id)]["quantities_by_unit"] == [
        {"unit": "EA", "surveyed": 110, "confirmed": 110, "applied": 0}]


def _insert_attempt(db, env, item, scope, unit, quantities, *, order, status="DRAFT"):
    target = models.StocktakeTarget(target_id=uuid.uuid4(),
        set_id=db.get(models.StocktakeTarget, uuid.UUID(env[4]["target_id"])).set_id,
        item_id=item.item_id, scope_key=scope, item_code=item.mes_code,
        item_name=item.item_name, unit=unit, scope_name=scope)
    db.add(target)
    db.flush()
    count = models.StocktakeCount(count_id=uuid.uuid4(), round_id=uuid.UUID(env[3]["round_id"]),
        target_id=target.target_id, owner_id=env[1].employee_id, owner_name=env[1].name,
        quantities=quantities, baseline={}, fence=1, quantity_revision=0, status=status,
        created_at=datetime(2026, 1, 1) + timedelta(seconds=order))
    db.add(count)
    target.latest_count_id = count.count_id
    db.commit()
    return target


def test_worker_quantities_sum_locations_but_keep_different_units_separate(db_session, make_item):
    env = setup_round(db_session, make_item)
    original = db_session.get(models.StocktakeTarget, uuid.UUID(env[4]["target_id"]))
    original.unit = "개"
    db_session.commit()
    first = start_count(db_session, env)
    command(db_session, env, "count_save", first, quantities=_quantities(10))
    _insert_attempt(db_session, env, env[2], "tube", "eA", _quantities(20), order=1)
    meter = make_item(name="Measured length")
    _insert_attempt(db_session, env, meter, "warehouse", " m ", _quantities(7), order=2, status="CONFIRMED")
    db_session.commit()

    row = _worker_row(db_session, env)
    assert row["surveyed"] == 2
    assert row["confirmed"] == 1
    assert row["quantities_by_unit"] == [
        {"unit": "EA", "surveyed": 30, "confirmed": 0, "applied": 0},
        {"unit": "m", "surveyed": 7, "confirmed": 7, "applied": 0}]


def test_worker_quantities_drop_invalidated_confirmation_but_keep_survey(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    saved = command(db_session, env, "count_save", count, quantities=_quantities(10, 2, 3, 4))
    confirmed = command(db_session, env, "count_confirm", saved)
    assert _worker_row(db_session, env)["quantities_by_unit"][0]["confirmed"] == 19
    command(db_session, env, "count_resume", confirmed, reason_code="CANCEL_CONFIRMATION", reason="Review")

    assert _worker_row(db_session, env)["quantities_by_unit"] == [
        {"unit": "EA", "surveyed": 19, "confirmed": 0, "applied": 0}]


def test_closed_worker_quantities_use_manifest_evidence_and_project_selected(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    command(db_session, env, "count_save", count, quantities=_quantities(999))
    entries = [{"owner_id": str(env[1].employee_id), "owner_name": env[1].name,
        "item_id": str(env[2].item_id), "unit": "EA", "classification": "SELECTED_APPLY",
        "quantities": _quantities(10, 2, 3, 4)}]
    round_id = uuid.UUID(env[3]["round_id"])
    live = stocktake_reports.worker_progress(db_session, round_id, entries)
    closed = stocktake_reports.worker_progress(db_session, round_id, entries, project_selected=True)

    assert live[0]["quantities_by_unit"] == [{"unit": "EA", "surveyed": 999, "confirmed": 19, "applied": 0}]
    assert closed[0]["quantities_by_unit"] == [{"unit": "EA", "surveyed": 999, "confirmed": 19, "applied": 19}]


@pytest.mark.parametrize("quantities, expected", [(None, None), ({}, None), (_quantities(0), 0)])
def test_worker_quantities_distinguish_missing_legacy_evidence_from_zero(db_session, make_item, quantities, expected):
    env = setup_round(db_session, make_item)
    start_count(db_session, env)
    entries = [{"owner_id": str(env[1].employee_id), "owner_name": env[1].name,
        "item_id": str(env[2].item_id), "classification": "ALREADY_APPLIED", "quantities": quantities}]

    rows = stocktake_reports.worker_progress(db_session, uuid.UUID(env[3]["round_id"]), entries)
    assert rows[0]["quantities_by_unit"] == [
        {"unit": "EA", "surveyed": 0, "confirmed": expected, "applied": expected}]


def test_worker_quantities_bulk_read_does_not_flush_pending_changes(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    command(db_session, env, "count_save", count, quantities=_quantities(10))
    round_id = uuid.UUID(env[3]["round_id"])
    entries = stocktake_reports.snapshot(db_session, round_id, set())["entries"]
    target = db_session.get(models.StocktakeTarget, uuid.UUID(env[4]["target_id"]))
    target.item_name = "Pending display edit"
    db_session.add(models.Employee(employee_code="UNFLUSHED", name="Pending", role="staff"))
    statements = []
    connection = db_session.connection()

    def observe(_connection, _cursor, statement, _parameters, _context, _executemany):
        statements.append(statement)

    event.listen(connection, "before_cursor_execute", observe)
    db_session.autoflush = True
    try:
        rows = stocktake_reports.worker_progress(db_session, round_id, entries)
    finally:
        db_session.autoflush = False
        event.remove(connection, "before_cursor_execute", observe)

    assert rows[0]["quantities_by_unit"][0]["surveyed"] == 10
    assert len(statements) == 1 and statements[0].lstrip().upper().startswith("SELECT")
    assert db_session.new and db_session.dirty


def test_worker_quantities_unknown_evidence_propagates_within_its_unit_only(db_session, make_item):
    env = setup_round(db_session, make_item)
    start_count(db_session, env)
    entries = [{"owner_id": str(env[1].employee_id), "owner_name": env[1].name,
        "item_id": str(uuid.uuid4()), "unit": unit, "classification": "ALREADY_APPLIED",
        "quantities": quantities} for unit, quantities in [
            ("EA", _quantities(10)), ("개", None), (" m ", _quantities(3))]]
    rows = stocktake_reports.worker_progress(db_session, uuid.UUID(env[3]["round_id"]), entries)

    assert rows[0]["quantities_by_unit"] == [
        {"unit": "EA", "surveyed": 0, "confirmed": None, "applied": None},
        {"unit": "m", "surveyed": 0, "confirmed": 3, "applied": 3}]


def test_worker_quantities_missing_target_and_entry_units_are_unspecified(db_session, make_item):
    env = setup_round(db_session, make_item)
    entries = [{"owner_id": str(env[1].employee_id), "owner_name": env[1].name,
        "item_id": str(uuid.uuid4()), "classification": "ALREADY_APPLIED"}]
    rows = stocktake_reports.worker_progress(db_session, uuid.UUID(env[3]["round_id"]), entries)

    assert rows[0]["quantities_by_unit"] == [
        {"unit": "미지정", "surveyed": 0, "confirmed": None, "applied": None}]


def test_worker_quantities_missing_legacy_count_evidence_is_unknown(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = start_count(db_session, env)
    row = db_session.get(models.StocktakeCount, uuid.UUID(count["count_id"]))
    row.quantities = {}
    db_session.commit()

    assert _worker_row(db_session, env)["quantities_by_unit"] == [
        {"unit": "EA", "surveyed": None, "confirmed": 0, "applied": 0}]
