"""Counting fences distinguish real changes, reservation increases and safe releases."""
import uuid
from decimal import Decimal

import pytest

from app import models
from app.services.inventory_conflicts import InventoryConflict


def environment(db, make_item):
    assert hasattr(models, "StocktakeGate"), "Counting gates must be persisted"
    from app.services import stocktake_guard as guard
    item = make_item(name="Counted item", warehouse_qty=Decimal(10))
    round_id = uuid.uuid4()
    actor = models.Employee(employee_code="GUARD-ROUND-OWNER", name="Counter", role="staff")
    db.add(actor)
    db.flush()
    db.add(models.StocktakeRound(round_id=round_id, title="Guard fixture", epoch=1, started_by=actor.employee_id))
    db.flush()
    db.add(models.StocktakeControl(id=1, inventory_mode="POOL", active_round_id=round_id, epoch=1))
    db.add_all([
        models.InventoryScope(scope_key="warehouse", physical_department="창고"),
        models.InventoryScope(scope_key="department:987", physical_department="조립"),
    ])
    db.flush()
    gate = models.StocktakeGate(item_id=item.item_id, scope_key="warehouse", round_id=round_id,
        round_epoch=1, active_count_id=uuid.uuid4(), fence=2)
    db.add(gate)
    db.commit()
    return guard, item, gate


@pytest.mark.parametrize("kind,delta", [("quantity", 1), ("quantity", -1), ("reservation", 1), ("category", 1)])
def test_counted_cell_rejects_physical_category_and_reservation_increases(db_session, make_item, kind, delta):
    guard, item, gate = environment(db_session, make_item)
    guard.prepare_items(db_session, [item.item_id])
    with pytest.raises(InventoryConflict) as error:
        guard.record_change(db_session, item.item_id, "창고", kind=kind, delta=delta)
    assert error.value.code == "STOCKTAKE_CELL_LOCKED"
    assert error.value.status_code == 423
    assert error.value.extra["fence"] == 2
    assert gate.quantity_revision == 0 and gate.reservation_revision == 0


def test_other_position_is_writable_and_pure_release_advances_only_reservation_revision(db_session, make_item):
    guard, item, gate = environment(db_session, make_item)
    guard.prepare_items(db_session, [item.item_id])
    guard.record_change(db_session, item.item_id, "조립", kind="quantity", delta=1)
    guard.record_change(db_session, item.item_id, "창고", kind="reservation", delta=-1)
    assert gate.quantity_revision == 0 and gate.reservation_revision == 1
    db_session.commit()
    progress = db_session.get(models.StocktakeProgress, (gate.round_id, gate.scope_key))
    assert progress.progress_revision == 1


def test_old_round_gate_does_not_lock_new_writes(db_session, make_item):
    guard, item, gate = environment(db_session, make_item)
    db_session.get(models.StocktakeControl, 1).epoch = 2
    db_session.commit()
    guard.prepare_items(db_session, [item.item_id])
    guard.record_change(db_session, item.item_id, "창고", kind="quantity", delta=1)
    assert gate.quantity_revision == 1


def test_discovered_late_item_requires_rollback_instead_of_expanding_locks(db_session, make_item):
    guard, item, _ = environment(db_session, make_item)
    other = make_item(name="Late component", warehouse_qty=Decimal(4))
    guard.prepare_items(db_session, [item.item_id])
    with pytest.raises(InventoryConflict) as error:
        guard.prepare_items(db_session, [item.item_id, other.item_id])
    assert error.value.code == "INVENTORY_PLAN_CHANGED"


def test_transaction_end_discards_plan_and_rechecks_control(db_session, make_item):
    guard, item, gate = environment(db_session, make_item)
    guard.prepare_items(db_session, [item.item_id])
    db_session.rollback()
    guard.prepare_items(db_session, [item.item_id])
    with pytest.raises(InventoryConflict):
        guard.record_change(db_session, item.item_id, "창고", kind="quantity", delta=1)


def test_locked_transfer_does_not_change_either_position(db_session, make_item):
    guard, item, _ = environment(db_session, make_item)
    from app.services import inventory
    from app.services._tx import transactional
    with pytest.raises(InventoryConflict):
        with transactional(db_session):
            guard.prepare_items(db_session, [item.item_id])
            inventory.transfer_to_production(db_session, item.item_id, Decimal(2), models.DepartmentEnum.ASSEMBLY)
    assert db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == 10
    assert sum(int(row.quantity) for row in db_session.query(models.InventoryLocation).filter_by(item_id=item.item_id)) == 0


@pytest.mark.parametrize("operation", [
    "receive", "consume", "reserve", "adjust", "consume_pending", "transfer_back",
    "location_receive", "location_consume", "location_reserve", "department_transfer",
    "mark", "unmark", "scrap", "return", "defect_receive", "normal_scrap", "reverse",
])
def test_inventory_mutators_enforce_the_cell_fence(db_session, make_item, operation):
    guard, item, gate = environment(db_session, make_item)
    from app.services import inventory as inv
    from app.services.inv_effect import apply_effect_reverse
    from app.services._tx import transactional
    dept = models.DepartmentEnum.ASSEMBLY
    if operation.startswith("location_") or operation == "department_transfer":
        gate.scope_key = "department:987"
    db_session.add_all([
        models.InventoryLocation(item_id=item.item_id, department=dept, status=models.LocationStatusEnum.PRODUCTION, quantity=5),
        models.InventoryLocation(item_id=item.item_id, department=models.DepartmentEnum.WAREHOUSE,
                                 status=models.LocationStatusEnum.DEFECTIVE, quantity=5),
    ])
    parent = db_session.query(models.Inventory).filter_by(item_id=item.item_id).one()
    parent.pending_quantity = 2
    db_session.commit()
    reason = inv.ReasonContext(category="test")
    actions = {
        "receive": lambda: inv.receive_confirmed(db_session, item.item_id, Decimal(1)),
        "consume": lambda: inv.consume_warehouse(db_session, item.item_id, Decimal(1)),
        "reserve": lambda: inv.reserve(db_session, item.item_id, Decimal(1)),
        "adjust": lambda: inv.adjust_warehouse(db_session, item.item_id, Decimal(9)),
        "consume_pending": lambda: inv.consume_pending(db_session, item.item_id, Decimal(1)),
        "transfer_back": lambda: inv.transfer_to_warehouse(db_session, item.item_id, Decimal(1), dept),
        "location_receive": lambda: inv.receive_confirmed(db_session, item.item_id, Decimal(1), bucket="production", dept=dept),
        "location_consume": lambda: inv.consume_from_department(db_session, item.item_id, Decimal(1), dept),
        "location_reserve": lambda: inv.reserve_location(db_session, item.item_id, Decimal(1), department=dept,
                                                         status=models.LocationStatusEnum.PRODUCTION),
        "department_transfer": lambda: inv.transfer_between_departments(db_session, item.item_id, Decimal(1), dept, models.DepartmentEnum.WAREHOUSE),
        "mark": lambda: inv.mark_defective(db_session, item.item_id, Decimal(1), inv.DefectSource("warehouse", dept)),
        "unmark": lambda: inv.unmark_defective(db_session, item.item_id, Decimal(1), models.DepartmentEnum.WAREHOUSE, reason),
        "scrap": lambda: inv.scrap_defective(db_session, item.item_id, Decimal(1), models.DepartmentEnum.WAREHOUSE, reason),
        "return": lambda: inv.return_to_supplier(db_session, item.item_id, Decimal(1), models.DepartmentEnum.WAREHOUSE),
        "defect_receive": lambda: inv.receive_defective(db_session, item.item_id, Decimal(1), models.DepartmentEnum.WAREHOUSE, reason),
        "normal_scrap": lambda: inv.scrap_normal(db_session, item.item_id, Decimal(1), inv.NormalSource("warehouse", models.DepartmentEnum.WAREHOUSE), reason),
        "reverse": lambda: apply_effect_reverse(db_session, item.item_id, [{"scope": "warehouse", "delta": -1}]),
    }
    with pytest.raises(InventoryConflict) as error:
        with transactional(db_session):
            guard.prepare_items(db_session, [item.item_id])
            actions[operation]()
    assert error.value.code == "STOCKTAKE_CELL_LOCKED"
    assert db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == 10


def test_pure_reservation_release_remains_available(db_session, make_item):
    _, item, gate = environment(db_session, make_item)
    from app.services import inventory
    from app.services._tx import transactional
    db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().pending_quantity = 2
    db_session.commit()
    with transactional(db_session):
        inventory.release(db_session, item.item_id, Decimal(1))
    assert gate.quantity_revision == 0 and gate.reservation_revision == 1
    assert db_session.get(models.StocktakeProgress, (gate.round_id, gate.scope_key)).progress_revision == 1


def test_business_transaction_locks_control_before_its_body(db_session, make_item):
    guard, _, _ = environment(db_session, make_item)
    from app.services._tx import transactional
    with transactional(db_session):
        assert guard.STATE_KEY in db_session.info
        assert db_session.info[guard.STATE_KEY]["control"].active_round_id is not None


def test_savepoint_commit_does_not_lock_progress_before_remaining_stock_work(db_session, make_item):
    guard, item, gate = environment(db_session, make_item)
    guard.prepare_items(db_session, [item.item_id])
    with db_session.begin_nested():
        guard.record_change(db_session, item.item_id, "창고", kind="reservation", delta=-1)
    assert db_session.get(models.StocktakeProgress, (gate.round_id, gate.scope_key)) is None
    db_session.commit()
    assert db_session.get(models.StocktakeProgress, (gate.round_id, gate.scope_key)).progress_revision == 1


def test_savepoint_rollback_does_not_hide_a_later_successful_release_revision(db_session, make_item):
    guard, item, gate = environment(db_session, make_item)
    guard.prepare_items(db_session, [item.item_id])
    with pytest.raises(ValueError):
        with db_session.begin_nested():
            guard.record_change(db_session, item.item_id, "창고", kind="reservation", delta=-1)
            db_session.flush()
            raise ValueError("business validation failed")
    guard.record_change(db_session, item.item_id, "창고", kind="reservation", delta=-1)
    db_session.commit()
    assert gate.reservation_revision == 1
    assert db_session.get(models.StocktakeProgress, (gate.round_id, gate.scope_key)).progress_revision == 1


def test_progress_is_written_before_global_realtime_revision(db_session, make_item):
    guard, item, gate = environment(db_session, make_item)
    from app.services import realtime
    if db_session.get(models.DataRevision, 1) is None:
        db_session.add(models.DataRevision(id=1, revision=0))
        db_session.commit()
    guard.prepare_items(db_session, [item.item_id])
    guard.record_change(db_session, item.item_id, "창고", kind="reservation", delta=-1)
    realtime._advance_revision_before_commit(db_session)
    assert db_session.get(models.StocktakeProgress, (gate.round_id, gate.scope_key)) is not None


def test_box_tracking_cannot_be_enabled_while_a_warehouse_cell_is_counted(db_session, make_item):
    _, _, gate = environment(db_session, make_item)
    from app.services.warehouse_map import set_box_tracking_enabled, is_box_tracking_enabled
    with pytest.raises(InventoryConflict) as error:
        set_box_tracking_enabled(db_session, True)
    assert error.value.code == "STOCKTAKE_CELL_LOCKED"
    db_session.rollback()
    assert not is_box_tracking_enabled(db_session)
    gate.active_count_id = None
    db_session.commit()
    set_box_tracking_enabled(db_session, True)
    db_session.commit()
    assert is_box_tracking_enabled(db_session)


def test_control_lock_cannot_be_upgraded_after_stock_locks(db_session, make_item):
    guard, item, _ = environment(db_session, make_item)
    guard.prepare_items(db_session, [item.item_id])
    with pytest.raises(InventoryConflict) as error:
        guard.lock_control(db_session, exclusive=True)
    assert error.value.code == "INVENTORY_PLAN_CHANGED"


def test_total_repair_prepares_its_whole_inventory_set_before_writing(db_session, make_item):
    guard, item, _ = environment(db_session, make_item)
    from app.services.integrity import repair_inventory_totals
    parent = db_session.query(models.Inventory).filter_by(item_id=item.item_id).one()
    parent.quantity = 999
    db_session.commit()
    report = repair_inventory_totals(db_session, dry_run=False)
    assert report.repaired == 1 and parent.quantity == 10
    assert item.item_id in db_session.info[guard.STATE_KEY]["items"]


def test_warehouse_map_prepares_parent_and_gate_even_on_sqlite(db_session, make_item):
    guard, item, _ = environment(db_session, make_item)
    from app.services.warehouse_map import lock_warehouse_map_rows
    lock_warehouse_map_rows(db_session, item_ids=[item.item_id])
    assert item.item_id in db_session.info[guard.STATE_KEY]["items"]
