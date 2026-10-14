"""Owned waiting reads and ordinary apply cannot authorize another employee's work."""
import uuid

import pytest

from app import models
from app.routers.stocktakes import round_progress
from app.services import stocktake_reads
from app.services.inventory_conflicts import InventoryConflict
from tests.services.test_stocktake_application import confirm, preview, apply
from tests.services.test_stocktake_counts import setup_round


def other_actor(db):
    actor = models.Employee(employee_code="WAIT-OTHER", name="Other counter", role="staff")
    db.add(actor)
    db.commit()
    return actor


def location_env(db, env, scope, actor=None):
    rows = stocktake_reads.targets(db, uuid.UUID(env[3]["round_id"]), limit=None)["items"]
    target = next(row for row in rows if row["item_id"] == str(env[2].item_id) and row["scope_id"] == scope)
    return env[0], actor or env[1], env[2], env[3], target


def test_foreign_confirmation_cannot_be_previewed(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    count = confirm(db_session, env)
    other = other_actor(db_session)
    with pytest.raises(InventoryConflict) as error:
        preview(db_session, (env[0], other, *env[2:]), count)
    assert error.value.code == "FORBIDDEN"
    assert db_session.query(models.StocktakeApplication).count() == 0


def test_foreign_preview_cannot_be_applied(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    count = confirm(db_session, env)
    proposal = preview(db_session, env, count)
    with pytest.raises(InventoryConflict) as error:
        apply(db_session, env, proposal, actor=other_actor(db_session))
    assert error.value.code == "FORBIDDEN"
    assert db_session.query(models.StocktakeApplication).count() == 0


def test_waiting_groups_owned_locations_and_progress_counts_items(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    confirm(db_session, env)
    confirm(db_session, location_env(db_session, env, "tube"), normal=0)
    rid = uuid.UUID(env[3]["round_id"])
    result = stocktake_reads.targets(db_session, rid, group_by_item=True, waiting_owner_id=env[1].employee_id)
    assert len(result["items"]) == 1
    assert result["total_items"] == 1
    assert {row["scope_id"] for row in result["items"][0]["location_targets"]} == {"tube", "warehouse"}
    progress = round_progress(rid, db_session, (env[1], None))
    assert progress["my_waiting"] == {"items": 1, "locations": 2}
    assert stocktake_reads.targets(db_session, rid, group_by_item=True,
        waiting_owner_id=other_actor(db_session).employee_id)["items"] == []


def test_waiting_includes_partial_confirmation_but_not_other_employee_locations(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    mine = confirm(db_session, env)
    other = other_actor(db_session)
    confirm(db_session, location_env(db_session, env, "tube", other), normal=0)
    rid = uuid.UUID(env[3]["round_id"])
    result = stocktake_reads.waiting_selection(db_session, rid, env[1].employee_id)
    assert [row["confirmation_revision_id"] for row in result["items"]] == [mine["confirmation_revision_id"]]
    assert result["total_items"] == 1
    assert round_progress(rid, db_session, (env[1], None))["my_waiting"] == {"items": 1, "locations": 1}
    proposal = preview(db_session, env, mine)
    apply(db_session, env, proposal)
    assert stocktake_reads.waiting_selection(db_session, rid, env[1].employee_id)["items"] == []
    assert round_progress(rid, db_session, (other, None))["my_waiting"] == {"items": 1, "locations": 1}


def test_waiting_filters_page_before_locations_and_bind_actor_cursor(db_session, make_item):
    from tests.services.test_stocktake_dashboard_reads import append_targets, pages
    env = setup_round(db_session, make_item, new_policy=True)
    items = [make_item(name=f"Chosen {index}", model_symbol="1") for index in range(4)]
    db_session.add(models.ProductSymbol(slot=1, symbol="1", model_name="DX3000"))
    db_session.commit()
    append_targets(db_session, env)
    rid = uuid.UUID(env[3]["round_id"])
    for row in stocktake_reads.targets(db_session, rid, scope_id="warehouse", limit=None)["items"]:
        item = db_session.get(models.Item, uuid.UUID(row["item_id"]))
        confirm(db_session, (env[0], env[1], item, env[3], row), normal=0)
    items[0].process_type_code = "HA"
    db_session.commit()
    filters = dict(group_by_item=True, waiting_owner_id=env[1].employee_id, departments=["고압"],
                   model_slots=[1], process_steps=["A"], search="Chosen")
    assert [row["item_id"] for row in pages(db_session, env, limit=1, **filters)] == [str(items[0].item_id)]
    listed = pages(db_session, env, limit=1, logic="OR", **filters)
    assert len(listed) == len({row["item_id"] for row in listed}) == 4
    selected = stocktake_reads.waiting_selection(db_session, rid, env[1].employee_id,
        departments=["튜브", "고압"], model_slots=[1], search="Chosen")
    assert len(selected["items"]) == selected["total_items"] == 4
    assert stocktake_reads.owned_waiting_summary(db_session, rid, env[1].employee_id) == {"items": 5, "locations": 5}
    first = stocktake_reads.targets(db_session, rid, limit=1, group_by_item=True, waiting_owner_id=env[1].employee_id)
    for override in (dict(waiting_owner_id=other_actor(db_session).employee_id), dict(search="Chosen")):
        with pytest.raises(InventoryConflict) as error:
            stocktake_reads.targets(db_session, rid, group_by_item=True,
                **{"waiting_owner_id": env[1].employee_id, **override}, cursor=first["next_cursor"])
        assert error.value.code == "TARGET_CURSOR_STALE"
