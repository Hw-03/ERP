"""Two-cell rounds and dashboard queries over disposable, explicitly admitted data."""
import base64
import json
import uuid
from datetime import datetime

import pytest
from sqlalchemy import event

from app import models
from app.services import stocktake_reads, stocktake_targets
from app.services.inventory_conflicts import InventoryConflict
from app.services.stocktake_target_policy import DASHBOARD_POLICY, LEGACY_POLICY, round_policy
from tests.services.test_stocktake_counts import setup_round, start_count, command


def append_targets(db, env):
    svc, actor, _, round_, _ = env
    preview = svc.execute(db, actor, "target_append_preview", str(uuid.uuid4()), {"round_id": round_["round_id"]})
    return svc.execute(db, actor, "target_append", str(uuid.uuid4()), {"round_id": round_["round_id"],
        "preview_id": preview["preview_id"], "preview_hash": preview["preview_hash"]})


def pages(db, env, **filters):
    rows, cursor = [], None
    while True:
        page = stocktake_reads.targets(db, uuid.UUID(env[3]["round_id"]), cursor=cursor, **filters)
        rows.extend(page["items"])
        cursor = page["next_cursor"]
        if cursor is None:
            return rows


def test_confirmer_comes_from_confirmation_event_not_count_start_name(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    count = start_count(db_session, env)
    assert next(row for row in pages(db_session, env) if row["scope_id"] == "warehouse")["confirmed_name"] is None
    env[1].name = "Confirmation actor"
    db_session.commit()
    saved = command(db_session, env, "count_save", count, quantities={"normal": 10, "defect": 0, "b_grade": 0, "obsolete": 0})
    confirmed = command(db_session, env, "count_confirm", saved)
    env[1].name = "Renamed later"
    db_session.commit()
    row = next(row for row in pages(db_session, env) if row["scope_id"] == "warehouse")
    assert row["confirmed_name"] == "Confirmation actor"
    assert row["count"]["owner_name"] == "Counter"
    command(db_session, env, "count_resume", confirmed, reason_code="RECOUNT_EDIT", reason="Recheck")
    assert next(row for row in pages(db_session, env) if row["scope_id"] == "warehouse")["confirmed_name"] is None


def test_new_policy_has_two_zero_cells_without_inventory_and_ignores_office(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    db_session.add(models.Department(name="연구", is_active=True))
    empty = make_item(name="No inventory row")
    db_session.query(models.Inventory).filter_by(item_id=empty.item_id).delete()
    db_session.commit()
    pending = stocktake_targets.pending_rows(db_session, uuid.UUID(env[3]["round_id"]))
    assert {(row["item_id"], row["scope_key"]) for row in pending} == {(str(empty.item_id), "tube"), (str(empty.item_id), "warehouse")}
    appended = append_targets(db_session, env)
    assert appended["target_count"] == 2
    assert round_policy(db_session, uuid.UUID(env[3]["round_id"])) == DASHBOARD_POLICY
    assert len(pages(db_session, env)) == 4
    assert all(row["current_inventory"]["quantity"] == 0 for row in pages(db_session, env) if row["item_id"] == str(empty.item_id))


def test_historical_policy_stays_legacy_when_new_department_is_added(db_session, make_item):
    env = setup_round(db_session, make_item)
    db_session.add(models.Department(name="연구", is_active=True))
    db_session.commit()
    assert round_policy(db_session, uuid.UUID(env[3]["round_id"])) == LEGACY_POLICY
    original = env[4]["target_id"]
    assert append_targets(db_session, env)["target_count"] == 1
    rows = pages(db_session, env, limit=1)
    assert rows[0]["target_id"] == original
    assert [row["scope_name"] for row in rows] == ["창고", "연구"]


@pytest.mark.parametrize("problem", ["missing_mapping", "outside_stock", "outside_pending"])
def test_new_preparation_names_unsafe_item_without_moving_stock(db_session, make_item, problem):
    env = setup_round(db_session, make_item, new_policy=True)
    item = make_item(name="Blocked catalog item", process_type_code="AR" if problem == "missing_mapping" else "TR")
    if problem != "missing_mapping":
        db_session.add(models.InventoryScope(scope_key="assembly", physical_department="조립"))
        db_session.add(models.InventoryLocation(item_id=item.item_id, department="조립",
            status=models.LocationStatusEnum.PRODUCTION, quantity=2,
            pending_quantity=1 if problem == "outside_pending" else 0))
    db_session.commit()
    before = db_session.query(models.StocktakeTarget).count()
    with pytest.raises(InventoryConflict) as conflict:
        append_targets(db_session, env)
    assert conflict.value.code == "TARGET_SET_CHANGED"
    assert item.mes_code in str(conflict.value)
    assert any(row["item_id"] == str(item.item_id) for row in conflict.value.extra["items"])
    assert db_session.query(models.StocktakeTarget).count() == before


def test_admitted_code_edit_does_not_create_a_third_cell(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    db_session.add(models.InventoryScope(scope_key="assembly", physical_department="조립"))
    env[2].process_type_code = "AR"
    db_session.commit()
    assert stocktake_targets.pending_rows(db_session, uuid.UUID(env[3]["round_id"])) == []
    assert {row["scope_id"] for row in pages(db_session, env)} == {"tube", "warehouse"}


def test_server_filters_before_paging_with_group_or_search_and_kpi(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    db_session.add_all([models.ProductSymbol(slot=1, symbol="1", model_name="DX3000"),
        models.ProductSymbol(slot=2, symbol="2", model_name="COCOON")])
    for index in range(30):
        make_item(name=f"Earlier item {index}")
    chosen = make_item(name="Chosen match", process_type_code="TA", model_symbol="12")
    other = make_item(name="Chosen raw", model_symbol="2")
    chosen.sort_order, other.sort_order = 100, 101
    db_session.commit()
    append_targets(db_session, env)
    filters = {"model_slots": [1, 2], "process_steps": ["A"], "scope_kind": "warehouse"}
    both = pages(db_session, env, limit=1, **filters)
    assert [(row["item_id"], row["scope_id"]) for row in both] == [(str(chosen.item_id), "warehouse")]
    either = pages(db_session, env, limit=1, logic="OR", search="Chosen", **filters)
    assert {row["item_id"] for row in either} == {str(chosen.item_id), str(other.item_id)}
    assert len(either) == 4  # Both model matches include their code cells under OR.
    assert pages(db_session, env, logic="OR", search="Chosen", status_group="CONFIRMED_ALL", **filters) == []
    assert len(pages(db_session, env, process_steps=["R", "A"], scope_kind="warehouse")) == 33
    assert pages(db_session, env, search="Earlier item %") == []


def test_departments_use_current_codes_without_inventory_and_preserve_all_locations(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    items = [make_item(name=f"Department {index}") for index in range(7)]
    db_session.commit()
    append_targets(db_session, env)
    db_session.add_all([models.ProcessType(code=prefix + "R", prefix=prefix, suffix="R", stage_order=0)
                       for prefix in ["X"]])
    db_session.flush()
    for item, prefix in zip(items, ["T", "H", "V", "N", "A", "P", "X"]):
        item.process_type_code = prefix + "R"
        db_session.query(models.Inventory).filter_by(item_id=item.item_id).delete()
    db_session.commit()
    target_count = db_session.query(models.StocktakeTarget).count()
    for item, department in zip(items, ["튜브", "고압", "진공", "튜닝", "조립", "출하"]):
        result = pages(db_session, env, departments=[department], group_by_item=True, limit=1)
        assert str(item.item_id) in {row["item_id"] for row in result}
        assert all(row["current_item_code"].split("-")[1][0] == item.process_type_code[0] for row in result)
        assert all({location["scope_id"] for location in row["location_targets"]} == {"tube", "warehouse"} for row in result)
    selected = pages(db_session, env, departments=["고압", "진공", "고압"], group_by_item=True, limit=1)
    assert {row["item_id"] for row in selected} == {str(items[1].item_id), str(items[2].item_id)}
    assert len(selected) == 2
    assert str(items[-1].item_id) in {row["item_id"] for row in pages(db_session, env, group_by_item=True)}
    assert db_session.query(models.StocktakeTarget).count() == target_count


def test_department_groups_and_cursor_bind_normalized_selection(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    items = [make_item(name=f"Chosen {index}", model_symbol="1") for index in range(4)]
    db_session.add(models.ProductSymbol(slot=1, symbol="1", model_name="DX3000"))
    db_session.commit()
    append_targets(db_session, env)
    items[0].process_type_code = "HA"
    db_session.commit()
    filters = dict(group_by_item=True, departments=["고압"], model_slots=[1], process_steps=["A"], search="Chosen")
    assert [row["item_id"] for row in pages(db_session, env, limit=1, **filters)] == [str(items[0].item_id)]
    assert len(pages(db_session, env, limit=1, logic="OR", **filters)) == 4
    assert pages(db_session, env, logic="OR", status_group="CONFIRMED_ALL", **filters) == []
    round_id = uuid.UUID(env[3]["round_id"])
    first = stocktake_reads.targets(db_session, round_id, group_by_item=True, limit=1, departments=["튜브", "고압", "튜브"])
    remaining = stocktake_reads.targets(db_session, round_id, group_by_item=True, departments=["고압", "튜브"], cursor=first["next_cursor"])
    assert len(remaining["items"]) == 4
    with pytest.raises(InventoryConflict) as conflict:
        stocktake_reads.targets(db_session, round_id, group_by_item=True, departments=["고압"], cursor=first["next_cursor"])
    assert conflict.value.code == "TARGET_CURSOR_STALE"


def test_dashboard_order_and_two_cells_survive_every_page_boundary(db_session, make_item, client):
    env = setup_round(db_session, make_item, new_policy=True)
    for index, order in enumerate([50, -1, 0, None, 50]):
        item = make_item(name=f"Ordered {index}")
        item.sort_order = order
    db_session.commit()
    append_targets(db_session, env)
    dashboard = client.get("/api/items", params={"limit": 200})
    assert dashboard.status_code == 200, dashboard.text
    expected = [row["item_id"] for row in dashboard.json()]
    for limit in [1, 3, 7]:
        rows = pages(db_session, env, limit=limit)
        assert [row["item_id"] for row in rows[::2]] == expected
        assert [row["scope_id"] for row in rows] == ["tube", "warehouse"] * len(expected)
        assert len({row["target_id"] for row in rows}) == 2 * len(expected)


def test_grouped_items_page_before_locations_in_dashboard_order(db_session, make_item, client):
    env = setup_round(db_session, make_item, new_policy=True)
    for index in range(12):
        item = make_item(name=f"Grouped {index}")
        item.sort_order = index // 3
    db_session.commit()
    append_targets(db_session, env)
    expected = [row["item_id"] for row in client.get("/api/items", params={"limit": 200}).json()]
    for limit in [1, 3, 7]:
        rows = pages(db_session, env, group_by_item=True, limit=limit)
        assert [row["item_id"] for row in rows] == expected
        assert len({row["item_id"] for row in rows}) == len(expected)
        assert all([location["scope_id"] for location in row["location_targets"]] == ["tube", "warehouse"] for row in rows)
        assert all("location_targets" not in location for row in rows for location in row["location_targets"])


def test_grouped_filters_keep_both_editor_locations_and_exact_matching_anchor(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    count = start_count(db_session, env)
    round_id = uuid.UUID(env[3]["round_id"])
    warehouse = stocktake_reads.targets(db_session, round_id, group_by_item=True, scope_kind="warehouse", status="DRAFT")["items"]
    assert len(warehouse) == 1 and warehouse[0]["scope_id"] == "warehouse"
    assert [row["status"] for row in warehouse[0]["location_targets"]] == ["UNCOUNTED", "DRAFT"]
    assert warehouse[0]["count"]["count_id"] == count["count_id"]
    assert stocktake_reads.targets(db_session, round_id, group_by_item=True, scope_kind="code", status="DRAFT")["items"] == []
    assert len(stocktake_reads.targets(db_session, round_id, group_by_item=True, scope_kind="code",
        process_steps=["R"], logic="OR", status_group="UNCONFIRMED")["items"]) == 1


def test_legacy_group_hides_other_cells_without_changing_raw_targets_or_counts(db_session, make_item):
    env = setup_round(db_session, make_item)
    db_session.add(models.Department(name="연구", is_active=True))
    warehouse = db_session.get(models.StocktakeTarget, uuid.UUID(env[4]["target_id"]))
    db_session.add(models.StocktakeTarget(target_id=uuid.uuid4(), set_id=warehouse.set_id,
        item_id=warehouse.item_id, scope_key="tube", item_code=warehouse.item_code,
        item_name=warehouse.item_name, unit=warehouse.unit, scope_name="튜브"))
    db_session.commit()
    append_targets(db_session, env)
    start_count(db_session, env)
    raw = pages(db_session, env)
    grouped = pages(db_session, env, group_by_item=True, limit=1)
    assert len(raw) == 3 and len(grouped) == 1
    assert [row["scope_name"] for row in grouped[0]["location_targets"]] == ["튜브", "창고"]
    assert len(pages(db_session, env)) == 3
    assert db_session.query(models.StocktakeCount).count() == 1


def test_raw_target_cursor_cannot_skip_grouped_items(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    raw = stocktake_reads.targets(db_session, uuid.UUID(env[3]["round_id"]), limit=1)
    with pytest.raises(InventoryConflict) as conflict:
        stocktake_reads.targets(db_session, uuid.UUID(env[3]["round_id"]), group_by_item=True, cursor=raw["next_cursor"])
    assert conflict.value.code == "TARGET_CURSOR_STALE"


def test_cursor_invalidates_changed_filter_and_old_format(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    first = stocktake_reads.targets(db_session, uuid.UUID(env[3]["round_id"]), limit=1)
    old = base64.urlsafe_b64encode(json.dumps({"last": env[4]["target_id"], "context": "old"}).encode()).decode()
    for cursor, filters in [(old, {}), (first["next_cursor"], {"scope_kind": "warehouse"}),
                            (first["next_cursor"], {"logic": "OR"})]:
        with pytest.raises(InventoryConflict) as conflict:
            stocktake_reads.targets(db_session, uuid.UUID(env[3]["round_id"]), cursor=cursor, **filters)
        assert conflict.value.code == "TARGET_CURSOR_STALE"


def test_live_inventory_equals_dashboard_and_never_count_draft(db_session, make_item, client):
    env = setup_round(db_session, make_item, new_policy=True)
    inventory = db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one()
    inventory.pending_quantity = 3
    db_session.commit()
    count = start_count(db_session, env)
    command(db_session, env, "count_save", count, quantities={"normal": 99, "defect": 0, "b_grade": 0, "obsolete": 0})
    dashboard = client.get(f"/api/items/{env[2].item_id}").json()
    row = next(row for row in pages(db_session, env) if row["scope_id"] == "warehouse")
    assert row["quantities"]["normal"] == 99
    assert row["current_inventory"] == {key: dashboard[key] for key in row["current_inventory"]}
    assert row["current_inventory"]["warehouse_qty"] == 10
    assert row["current_inventory"]["available_quantity"] == 7


def test_managed_stock_projection_and_filters_match_dashboard(db_session, make_item, client):
    from tests.services.test_stocktake_apply_contract import _pool
    env = setup_round(db_session, make_item, new_policy=True)
    for category, quantity in [("DEFECT", 2), ("B_GRADE", 3), ("OBSOLETE", 4)]:
        _pool(db_session, env, category, quantity, pending=1)
    db_session.add(models.InventoryLocation(item_id=env[2].item_id, department="창고",
        status=models.LocationStatusEnum.DEFECTIVE, quantity=9, pending_quantity=3))
    db_session.commit()
    row = pages(db_session, env, process_steps=["OBSOLETE"])[0]
    live = client.get(f"/api/items/{env[2].item_id}").json()
    assert row["current_inventory"] == {key: live[key] for key in row["current_inventory"]}
    assert {entry["management_category"] for entry in row["current_inventory"]["defective_breakdown"]} == {"DEFECT", "B_GRADE", "OBSOLETE"}
    assert len(pages(db_session, env, process_steps=["DEFECT"])) == 2
    assert len(pages(db_session, env)) == 2  # Unfiltered includes obsolete stock.


def test_off_code_shipping_reservation_blocks_preparation(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    db_session.add(models.InventoryScope(scope_key="assembly", physical_department="조립"))
    request = models.ShippingRequest(base_pf_item_id=env[2].item_id)
    db_session.add(request)
    db_session.flush()
    db_session.add(models.ShippingAllocation(request_id=request.request_id, item_id=env[2].item_id,
        department="조립", quantity=1, status="RESERVED"))
    db_session.commit()
    with pytest.raises(InventoryConflict) as conflict:
        stocktake_targets.pending_rows(db_session, uuid.UUID(env[3]["round_id"]))
    assert conflict.value.extra["items"][0]["scope_id"] == "assembly"


def test_page_inventory_queries_are_batched(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    for index in range(25):
        make_item(name=f"Batch {index}")
    db_session.commit()
    append_targets(db_session, env)
    statements = []
    def capture(_conn, _cursor, statement, _parameters, _context, _many):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)
    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", capture)
    try:
        stocktake_reads.targets(db_session, uuid.UUID(env[3]["round_id"]), limit=2)
        small = len(statements)
        statements.clear()
        stocktake_reads.targets(db_session, uuid.UUID(env[3]["round_id"]), limit=50)
        assert len(statements) <= small + 1
    finally:
        event.remove(connection, "before_cursor_execute", capture)
