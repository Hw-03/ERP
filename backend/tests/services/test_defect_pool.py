"""POOL authority must never consume or invent per-occurrence balances."""

from datetime import datetime
from decimal import Decimal

import pytest

from app.models import (
    DefectPoolCutover, DefectStockPool, DefectStockMovement,
    DefectQuarantineRecord, DefectInventoryMovement, DepartmentEnum,
    Employee, InventoryLocation, InventoryScope, LocationStatusEnum,
    StocktakeControl, SystemSetting,
)
from app.services import defect_actions, inventory_operations


def pool_environment(db, item, *, quantity=0, category="DEFECT"):
    """Create only synthetic POOL fixtures; this is not a data cutover tool."""
    actor = Employee(employee_code="POOL-ACTOR", name="Pool operator", role="warehouse",
                     department="창고", warehouse_role="primary", is_active=True)
    db.add(actor)
    db.add(SystemSetting(setting_key="inventory_operation_cutover_at", setting_value="2026-01-01T00:00:00"))
    db.add(StocktakeControl(id=1, inventory_mode="POOL", epoch=0))
    db.add(InventoryScope(scope_key="warehouse", physical_department="창고"))
    db.flush()
    operation = inventory_operations.create_business_operation(
        db, domain="pool", action="cutover", display_label="Fixture", actor_name=actor.name,
        actor_employee_id=actor.employee_id,
    )
    cutover = DefectPoolCutover(actor_employee_id=actor.employee_id, operation_id=operation.operation_id,
                               source_fingerprint="a" * 64, cutover_version=1,
                               performed_at=datetime(2026, 1, 2))
    db.add(cutover)
    db.flush()
    pool = DefectStockPool(item_id=item.item_id, scope_key="warehouse", category=category,
                           quantity=quantity, cutover_id=cutover.cutover_id)
    db.add(pool)
    if quantity:
        db.add(InventoryLocation(item_id=item.item_id, department=DepartmentEnum.WAREHOUSE,
                                 status=LocationStatusEnum.DEFECTIVE, quantity=quantity))
    db.commit()
    return actor, pool


def test_quarantine_writes_pool_movement_without_new_legacy_movement(db_session, make_item):
    item = make_item(name="Pool quarantine", warehouse_qty=Decimal(10))
    actor, pool = pool_environment(db_session, item)

    defect_actions.quarantine_inventory(
        db_session, item_id=item.item_id, qty=Decimal(3), source="warehouse",
        target_dept=DepartmentEnum.WAREHOUSE, source_dept=None, actor=actor,
        reason_category="test", reason_memo="quarantine", client_request_id=None,
    )

    db_session.refresh(pool)
    assert pool.quantity == 3
    assert db_session.query(DefectStockMovement).one().delta == 3
    assert db_session.query(DefectInventoryMovement).count() == 0
    assert db_session.query(DefectQuarantineRecord).one().remaining_quantity == 3


def test_unquarantine_can_use_pool_without_selecting_occurrence(db_session, make_item):
    item = make_item(name="Pool restore", warehouse_qty=Decimal(0))
    actor, pool = pool_environment(db_session, item, quantity=7)

    defect_actions.unquarantine_inventory(
        db_session, pool_id=pool.pool_id, item_id=item.item_id, qty=Decimal(5),
        dept=DepartmentEnum.WAREHOUSE, actor=actor, reason_category="test", reason_memo="restore",
    )

    db_session.refresh(pool)
    assert pool.quantity == 2
    assert db_session.query(DefectQuarantineRecord).count() == 0
    assert db_session.query(DefectStockMovement).one().delta == -5


def test_pool_rejects_fractional_changes_and_reserved_stock(db_session, make_item):
    from app.services import defect_pool

    item = make_item(name="Pool pending", warehouse_qty=Decimal(0))
    _actor, pool = pool_environment(db_session, item, quantity=7)
    pool.pending_quantity = 4
    db_session.flush()
    with pytest.raises(ValueError):
        defect_pool.ensure_available(pool, Decimal("0.5"))
    with pytest.raises(ValueError):
        defect_pool.ensure_available(pool, 4)
    defect_pool.ensure_available(pool, 3)


def test_reservations_protect_category_and_release_both_projections(db_session, make_item):
    from app.models import RequestBucketEnum
    from app.services import sr_reservation
    from app.services.sr_validation import LineInput

    item = make_item(name="Pool reservation", warehouse_qty=Decimal(0))
    _actor, pool = pool_environment(db_session, item, quantity=7)
    line = LineInput(pool_id=pool.pool_id, item_id=item.item_id, quantity=4,
                     from_bucket=RequestBucketEnum.DEFECTIVE, from_department=DepartmentEnum.WAREHOUSE,
                     to_bucket=RequestBucketEnum.NONE, to_department=None)
    sr_reservation.reserve_lines(db_session, [line])
    db_session.flush()
    assert pool.pending_quantity == 4
    location = db_session.query(InventoryLocation).one()
    assert location.pending_quantity == 4
    with pytest.raises(ValueError):
        sr_reservation.reserve_lines(db_session, [line])
    sr_reservation.release_lines(db_session, [line])
    db_session.refresh(location)
    assert pool.pending_quantity == location.pending_quantity == 0


def test_request_api_accepts_pool_source_and_scraps_without_occurrence(db_session, make_item, client):
    from app.models import StockRequestLine

    item = make_item(name="Pool request", warehouse_qty=Decimal(0))
    actor, pool = pool_environment(db_session, item, quantity=7)
    response = client.post("/api/stock-requests", json={
        "requester_employee_id": str(actor.employee_id), "request_type": "defect_scrap",
        "reason_category": "기타", "reason_memo": "scrap",
        "lines": [{"pool_id": str(pool.pool_id), "item_id": str(item.item_id), "quantity": 2,
                   "from_bucket": "defective", "from_department": "창고", "to_bucket": "none"}],
    })
    assert response.status_code == 201, response.text
    db_session.refresh(pool)
    assert pool.quantity == 5
    assert db_session.query(StockRequestLine).one().pool_id == pool.pool_id
    assert db_session.query(DefectQuarantineRecord).count() == 0


def test_native_pool_cancellation_restores_only_opposite_effect(db_session, make_item):
    from app.services import inventory_operation_cancellation as cancel
    from app.models import InventoryOperation

    item = make_item(name="Pool cancellation", warehouse_qty=Decimal(0))
    actor, pool = pool_environment(db_session, item, quantity=7)
    defect_actions.unquarantine_inventory(
        db_session, pool_id=pool.pool_id, item_id=item.item_id, qty=Decimal(2),
        dept=DepartmentEnum.WAREHOUSE, actor=actor, reason_category="test", reason_memo="restore",
    )
    operation = db_session.query(InventoryOperation).filter(InventoryOperation.action == "restore").one()
    preview = cancel.preview_cancellation(db_session, operation.operation_id)
    assert preview.can_cancel, preview.blockers
    reversal = cancel.cancel_operation(db_session, operation_id=operation.operation_id,
                                       canceller=actor, reason="cancel", plan_hash=preview.plan_hash)
    db_session.refresh(pool)
    assert pool.quantity == 7
    assert db_session.query(DefectStockMovement).filter_by(operation_id=reversal.operation_id).one().delta == 2
    assert db_session.query(DefectInventoryMovement).count() == 0


@pytest.mark.parametrize("legacy_adoption", [False, True])
def test_historical_scrap_bridge_restores_original_category_once(db_session, make_item, legacy_adoption):
    from app.models import (DefectPoolBridge, DefectQuarantineManagementCategoryRevision,
                            TransactionLog, TransactionTypeEnum, InventoryOperationRoleEnum)
    from app.services import pool_bridges, inventory_operation_cancellation as cancel

    item = make_item(name="Historical scrap", warehouse_qty=Decimal(0))
    actor, pool = pool_environment(db_session, item, quantity=8, category="B_GRADE")
    record = DefectQuarantineRecord(item_id=item.item_id, department="창고", original_quantity=10,
        remaining_quantity=8, management_category="B_GRADE", quarantined_at=datetime(2026, 1, 1))
    db_session.add(record)
    db_session.flush()
    for category, previous, hour in [("DEFECT", None, 0), ("B_GRADE", "DEFECT", 4)]:
        db_session.add(DefectQuarantineManagementCategoryRevision(record_id=record.record_id,
            previous_category=previous, next_category=category, edited_by_name=actor.name,
            edited_at=datetime(2026, 1, 1, hour), is_initial=previous is None))
    operation = inventory_operations.create_business_operation(db_session, domain="defect", action="scrap",
        display_label="Historical scrap", actor_name=actor.name, actor_employee_id=actor.employee_id,
        effective_at=datetime(2026, 1, 1, 3))
    log = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.DEFECT_SCRAP,
        quantity_change=-2, quantity_before=10, quantity_after=8, produced_by=actor.name,
        department="창고", operation_id=None if legacy_adoption else operation.operation_id,
        operation_role=None if legacy_adoption else InventoryOperationRoleEnum.PRIMARY,
        defect_quarantine_record_id=record.record_id, created_at=datetime(2026, 1, 1, 3),
        inventory_effect=[{"scope": "location", "department": "창고", "status": "DEFECTIVE", "delta": -2}])
    db_session.add(log)
    db_session.flush()
    candidates = pool_bridges.build_effect_bridges(db_session, [log])
    assert candidates[0]["source_payload"]["parts"] == [{"category": "DEFECT", "delta": -2, "record_id": str(record.record_id)}]
    for candidate in candidates:
        db_session.add(DefectPoolBridge(cutover_id=pool.cutover_id, **candidate))
    db_session.commit()

    if legacy_adoption:
        from app.services import legacy_inventory_operation_adoption
        legacy_inventory_operation_adoption.adopt_and_cancel(db_session, selected_log_id=log.log_id,
            canceller=actor, reason="cancel", now=datetime(2026, 1, 2))
    else:
        preview = cancel.preview_cancellation(db_session, operation.operation_id, now=datetime(2026, 1, 2))
        assert preview.can_cancel, preview.blockers
        cancel.cancel_operation(db_session, operation_id=operation.operation_id, canceller=actor,
            reason="cancel", plan_hash=preview.plan_hash, now=datetime(2026, 1, 2))
    balances = {row.category: int(row.quantity) for row in db_session.query(DefectStockPool).all()}
    assert balances == {"B_GRADE": 8, "DEFECT": 2}
    assert record.remaining_quantity == 8
    assert db_session.query(DefectStockMovement).one().delta == 2


def test_pool_queries_do_not_present_frozen_occurrence_balance_as_available(db_session, make_item, client):
    item = make_item(name="Pool query", warehouse_qty=Decimal(0))
    actor, pool = pool_environment(db_session, item, quantity=7, category="B_GRADE")
    record = DefectQuarantineRecord(item_id=item.item_id, department="창고", original_quantity=99,
        remaining_quantity=99, management_category="DEFECT", quarantined_at=datetime(2026, 1, 1))
    db_session.add(record)
    db_session.commit()
    response = client.get("/api/defects/locations")
    assert response.status_code == 200
    row = response.json()[0]
    assert row["record_id"] is None
    assert row["pool_id"] == str(pool.pool_id)
    assert row["quantity"] == "7"
    assert row["original_quantity"] is None
    assert row["management_category"] == "B_GRADE"
    from app.routers.items import _bulk_defective_breakdown
    breakdown = _bulk_defective_breakdown(db_session, [item.item_id], {})
    assert breakdown[item.item_id][0].quantity == 7
    assert breakdown[item.item_id][0].management_category == "B_GRADE"


def test_category_move_preserves_occurrence_and_reserved_quantity(db_session, make_item):
    from app.services import defect_pool
    item = make_item(name="Pool category", warehouse_qty=Decimal(0))
    actor, pool = pool_environment(db_session, item, quantity=7)
    pool.pending_quantity = 3
    location = db_session.query(InventoryLocation).one()
    location.pending_quantity = 3
    db_session.commit()
    destination = defect_pool.move_category(db_session, pool_id=pool.pool_id, quantity=4,
        category="B_GRADE", expected_version=0, actor=actor, reason="classification")
    assert pool.quantity == pool.pending_quantity == 3
    assert destination.quantity == 4
    assert db_session.query(DefectStockMovement).count() == 2
    with pytest.raises(ValueError):
        defect_pool.move_category(db_session, pool_id=pool.pool_id, quantity=1,
            category="OBSOLETE", expected_version=1, actor=actor, reason="classification")


def test_bulk_restore_accepts_pool_and_rolls_back_insufficient_total(db_session, make_item, client):
    item = make_item(name="Bulk pool", warehouse_qty=Decimal(0))
    actor, pool = pool_environment(db_session, item, quantity=7)
    line = {"pool_id": str(pool.pool_id), "item_id": str(item.item_id), "department": "창고", "quantity": 3}
    response = client.post("/api/defects/unquarantine/bulk", json={
        "actor_employee_id": str(actor.employee_id), "lines": [line],
        "reason_category": "기타", "reason_memo": "bulk restore",
    })
    assert response.status_code == 200, response.text
    db_session.refresh(pool)
    assert pool.quantity == 4
    response = client.post("/api/defects/unquarantine/bulk", json={
        "actor_employee_id": str(actor.employee_id), "lines": [line, line],
        "reason_category": "기타", "reason_memo": "duplicate",
    })
    assert response.status_code == 422
    db_session.refresh(pool)
    assert pool.quantity == 4


def test_pool_integrity_ignores_frozen_occurrence_and_detects_missing_movement(db_session, make_item):
    from app.services.inventory_integrity import _defect_stock_issues
    item = make_item(name="Pool integrity", warehouse_qty=Decimal(10))
    actor, pool = pool_environment(db_session, item)
    defect_actions.quarantine_inventory(db_session, item_id=item.item_id, qty=Decimal(3),
        source="warehouse", target_dept=DepartmentEnum.WAREHOUSE, source_dept=None,
        actor=actor, reason_category="test", reason_memo="in", client_request_id=None)
    defect_actions.unquarantine_inventory(db_session, pool_id=pool.pool_id,
        item_id=item.item_id, qty=Decimal(1), dept=DepartmentEnum.WAREHOUSE,
        actor=actor, reason_category="test", reason_memo="out")
    assert db_session.query(DefectQuarantineRecord).one().remaining_quantity == 3
    assert _defect_stock_issues(db_session) == []
    db_session.query(DefectStockMovement).filter_by(delta=-1).delete()
    db_session.flush()
    assert _defect_stock_issues(db_session)


def test_pool_category_api_uses_pin_version_and_has_cancellable_history(db_session, make_item, client):
    from app.models import InventoryOperation
    from app.services import pin_auth, inventory_operation_cancellation as cancel
    from app.services.inventory_integrity import _partial_cancellation_issues
    item = make_item(name="Category API", warehouse_qty=Decimal(0))
    actor, pool = pool_environment(db_session, item, quantity=7)
    actor.pin_hash = pin_auth.hash_pin("0000")
    db_session.commit()
    payload = {"management_category": "B_GRADE", "quantity": 3, "expected_version": 0,
        "actor_employee_id": str(actor.employee_id), "pin": "0000", "memo": "move"}
    path = f"/api/defects/pools/{pool.pool_id}/management-category"
    assert client.put(path, json={**payload, "pin": "9999"}).status_code == 403
    response = client.put(path, json=payload)
    assert response.status_code == 200, response.text
    assert client.put(path, json=payload).status_code == 409
    operation = db_session.query(InventoryOperation).filter_by(action="category_transfer").one()
    history = client.get(f"/api/inventory/operations?item_id={item.item_id}")
    assert history.status_code == 200, history.text
    row = next(row for row in history.json()["items"] if row["operation_id"] == str(operation.operation_id))
    assert sorted(row["delta"] for row in row["pool_movements"]) == [-3, 3]
    preview = cancel.preview_cancellation(db_session, operation.operation_id)
    assert preview.can_cancel, preview.blockers
    cancel.cancel_operation(db_session, operation_id=operation.operation_id, canceller=actor,
        reason="undo", plan_hash=preview.plan_hash)
    db_session.refresh(pool)
    assert pool.quantity == 7
    assert _partial_cancellation_issues(db_session) == []


def test_conflict_survives_internal_use_failure_boundary(db_session, make_item, monkeypatch):
    from app.services import sr_approval, internal_use_approval
    from app.services.inventory_conflicts import InventoryConflict
    def held(*args, **kwargs):
        raise InventoryConflict("STOCKTAKE_HELD", "held")
    monkeypatch.setattr(internal_use_approval, "settle_if_decided", held)
    with pytest.raises(InventoryConflict) as error:
        sr_approval._settle_internal_use_or_fail(db_session, batch=None, requests=[], actor=None)
    assert error.value.code == "STOCKTAKE_HELD"


def test_unproven_history_has_structured_conflict_but_old_week_takes_priority(db_session, make_item):
    from app.models import TransactionLog, TransactionTypeEnum, InventoryOperationRoleEnum
    from app.services import inventory_operation_cancellation as cancel
    from app.services.inventory_conflicts import InventoryConflict
    item = make_item(name="Unproven history", warehouse_qty=Decimal(0))
    actor, pool = pool_environment(db_session, item, quantity=7)
    operation = inventory_operations.create_business_operation(db_session, domain="defect", action="scrap",
        display_label="unproven", actor_name=actor.name, actor_employee_id=actor.employee_id,
        effective_at=datetime(2026, 1, 1))
    db_session.add(TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.DEFECT_SCRAP,
        quantity_change=-2, quantity_before=9, quantity_after=7, produced_by=actor.name,
        operation_id=operation.operation_id, operation_role=InventoryOperationRoleEnum.PRIMARY,
        created_at=datetime(2026, 1, 1), inventory_effect=[
            {"scope": "location", "department": "창고", "status": "DEFECTIVE", "delta": -2}]))
    db_session.commit()
    preview = cancel.preview_cancellation(db_session, operation.operation_id, now=datetime(2026, 1, 2))
    assert preview.blocker_code == "AMBIGUOUS_LEGACY_EFFECT"
    with pytest.raises(InventoryConflict):
        cancel.cancel_operation(db_session, operation_id=operation.operation_id, canceller=actor,
            reason="undo", plan_hash=preview.plan_hash, now=datetime(2026, 1, 2))
    preview = cancel.preview_cancellation(db_session, operation.operation_id, now=datetime(2026, 1, 20))
    assert not preview.can_cancel and preview.blocker_code is None
    db_session.refresh(pool)
    assert pool.quantity == 7


def test_zero_legacy_bridge_preserves_parent_child_and_full_allocation_without_stock(db_session, make_item):
    from app.models import (DefectQuarantineReconstruction, DefectQuarantineReconstructionAllocation,
        DefectQuarantineManagementCategoryRevision, TransactionLog, TransactionTypeEnum)
    from app.services import pool_bridges
    item = make_item(name="Zero legacy", warehouse_qty=Decimal(0))
    actor, pool = pool_environment(db_session, item)
    records = [DefectQuarantineRecord(item_id=item.item_id, department="창고", original_quantity=q,
        remaining_quantity=0, management_category="DEFECT", is_legacy=True,
        quarantined_at=datetime(2026, 1, 1)) for q in (6, 1, 4)]
    db_session.add_all(records)
    db_session.flush()
    for record in records:
        db_session.add(DefectQuarantineManagementCategoryRevision(record_id=record.record_id,
            previous_category=None, next_category="DEFECT", edited_by_name=actor.name,
            edited_at=datetime(2026, 1, 1), is_initial=True))
    parent, child, other = records
    logs = []
    for record in (child, other):
        log = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
            quantity_change=record.original_quantity, produced_by=actor.name, department="창고",
            defect_quarantine_record_id=record.record_id, created_at=datetime(2026, 1, 1),
            inventory_effect=[{"scope": "location", "department": "창고", "status": "DEFECTIVE", "delta": int(record.original_quantity)}])
        db_session.add(log)
        db_session.flush()
        db_session.add(DefectQuarantineReconstruction(parent_record_id=parent.record_id,
            child_record_id=record.record_id, source_transaction_log_id=log.log_id))
        logs.append(log)
    consumption = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.DEFECT_SCRAP,
        quantity_change=-5, produced_by=actor.name, department="창고", created_at=datetime(2026, 1, 1, 1),
        inventory_effect=[{"scope": "location", "department": "창고", "status": "DEFECTIVE", "delta": -5}])
    db_session.add(consumption)
    db_session.flush()
    for record in (child, other):
        db_session.add(DefectQuarantineReconstructionAllocation(transaction_log_id=consumption.log_id,
            record_id=record.record_id, quantity=record.original_quantity))
    db_session.commit()
    evidence = pool_bridges.build_record_bridges(db_session, [parent, child])
    assert sum(row["cutover_remaining"] for row in evidence) == 0
    assert len(evidence[0]["source_payload"]["children"]) == 2
    assert evidence[1]["source_payload"]["parent_id"] == str(parent.record_id)
    assert evidence[1]["source_payload"]["allocations"][0]["quantity"] == 1
    effects = pool_bridges.build_effect_bridges(db_session, [consumption])
    assert sorted(part["delta"] for part in effects[0]["source_payload"]["parts"]) == [-4, -1]
    assert len(effects[0]["source_payload"]["allocation_ids"]) == 2
    original = pool_bridges.build_effect_bridges(db_session, [logs[0]])[0]
    assert original["source_payload"]["original_consumed"] is True
    assert db_session.query(DefectStockMovement).count() == 0
    assert not db_session.new and not db_session.dirty


def test_multiline_pool_rework_produces_children_once(db_session, make_item, make_bom, client):
    import json
    parent = make_item(name="Pool parent", process_type_code="PF", warehouse_qty=Decimal(0))
    child = make_item(name="Pool child", process_type_code="VR", warehouse_qty=Decimal(0))
    make_bom(parent.item_id, child.item_id, Decimal(1))
    actor, pool = pool_environment(db_session, parent, quantity=3)
    db_session.add(InventoryScope(scope_key="department:vacuum", physical_department=DepartmentEnum.VACUUM.value))
    db_session.commit()
    response = client.post("/api/stock-requests", json={
        "requester_employee_id": str(actor.employee_id), "request_type": "defect_disassemble",
        "reason_category": "기타", "reason_memo": "rework", "notes": json.dumps({"child_decisions": [
            {"item_id": str(child.item_id), "qty": "3", "normal_qty": "3", "defective_qty": "0", "scrap_qty": "0"}]}),
        "lines": [{"pool_id": str(pool.pool_id), "item_id": str(parent.item_id), "quantity": q,
                   "from_bucket": "defective", "from_department": "창고", "to_bucket": "none"} for q in (1, 2)],
    })
    assert response.status_code == 201, response.text
    db_session.refresh(pool)
    assert pool.quantity == 0
    location = db_session.query(InventoryLocation).filter_by(item_id=child.item_id,
        status=LocationStatusEnum.PRODUCTION).one()
    assert location.quantity == 3


@pytest.mark.parametrize("normal_effect", [False, True])
def test_original_quarantine_reclassified_before_cutover_reverses_b_without_inventing_normal(db_session, make_item, normal_effect):
    from app.models import (Inventory, DefectPoolBridge, DefectQuarantineManagementCategoryRevision,
        TransactionLog, TransactionTypeEnum, InventoryOperationRoleEnum)
    from app.services import pool_bridges, inventory_operation_cancellation as cancel
    item = make_item(name="Reclassified original", warehouse_qty=Decimal(0))
    actor, pool = pool_environment(db_session, item, quantity=10, category="B_GRADE")
    record = DefectQuarantineRecord(item_id=item.item_id, department="창고", original_quantity=10,
        remaining_quantity=10, management_category="B_GRADE", quarantined_at=datetime(2026, 1, 1))
    db_session.add(record)
    db_session.flush()
    for category, previous, hour in [("DEFECT", None, 0), ("B_GRADE", "DEFECT", 4)]:
        db_session.add(DefectQuarantineManagementCategoryRevision(record_id=record.record_id,
            previous_category=previous, next_category=category, edited_by_name=actor.name,
            edited_at=datetime(2026, 1, 1, hour), is_initial=previous is None))
    operation = inventory_operations.create_business_operation(db_session, domain="defect", action="quarantine",
        display_label="original", actor_name=actor.name, actor_employee_id=actor.employee_id,
        effective_at=datetime(2026, 1, 1, 3))
    effects = [{"scope": "location", "department": "창고", "status": "DEFECTIVE", "delta": 10}]
    if normal_effect:
        effects.append({"scope": "warehouse", "delta": -10})
    log = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
        quantity_change=0 if normal_effect else 10, quantity_before=0, quantity_after=10,
        produced_by=actor.name, department="창고", operation_id=operation.operation_id,
        operation_role=InventoryOperationRoleEnum.PRIMARY, defect_quarantine_record_id=record.record_id,
        created_at=datetime(2026, 1, 1, 3), inventory_effect=effects)
    db_session.add(log)
    db_session.flush()
    for candidate in pool_bridges.build_effect_bridges(db_session, [log]):
        db_session.add(DefectPoolBridge(cutover_id=pool.cutover_id, **candidate))
    db_session.commit()
    preview = cancel.preview_cancellation(db_session, operation.operation_id, now=datetime(2026, 1, 2))
    assert preview.can_cancel, preview.blockers
    cancel.cancel_operation(db_session, operation_id=operation.operation_id, canceller=actor,
        reason="undo", plan_hash=preview.plan_hash, now=datetime(2026, 1, 2))
    db_session.refresh(pool)
    assert pool.quantity == 0
    assert record.remaining_quantity == 10
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == (10 if normal_effect else 0)


def test_native_original_cannot_hide_followup_consumption_by_replenishing_pool(db_session, make_item):
    from app.models import InventoryOperation
    from app.services import inventory_operation_cancellation as cancel
    item = make_item(name="Followup original", warehouse_qty=Decimal(10))
    actor, pool = pool_environment(db_session, item)
    kwargs = dict(item_id=item.item_id, source="warehouse", target_dept=DepartmentEnum.WAREHOUSE,
        source_dept=None, actor=actor, reason_category="test", reason_memo="original", client_request_id=None)
    defect_actions.quarantine_inventory(db_session, qty=Decimal(3), **kwargs)
    original = db_session.query(InventoryOperation).filter_by(action="quarantine").one()
    defect_actions.unquarantine_inventory(db_session, pool_id=pool.pool_id, item_id=item.item_id,
        qty=Decimal(1), dept=DepartmentEnum.WAREHOUSE, actor=actor, reason_category="test", reason_memo="followup")
    defect_actions.quarantine_inventory(db_session, qty=Decimal(3), **kwargs)
    preview = cancel.preview_cancellation(db_session, original.operation_id)
    assert not preview.can_cancel


@pytest.mark.parametrize("normal_stock", [False, True])
def test_cancellation_preview_rejects_physical_or_item_sum_overflow(db_session, make_item, normal_stock):
    from app.models import Inventory, InventoryOperation, TransactionLog, TransactionTypeEnum, InventoryOperationRoleEnum
    from app.services import defect_pool, inventory_operation_cancellation as cancel
    item = make_item(name="Pool upper bound", warehouse_qty=Decimal(0))
    actor, pool = pool_environment(db_session, item, quantity=defect_pool.MAX_QUANTITY - 1)
    if normal_stock:
        db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty = 1
    else:
        db_session.add(DefectStockPool(item_id=item.item_id, scope_key="warehouse", category="B_GRADE",
            quantity=1, cutover_id=pool.cutover_id))
        db_session.query(InventoryLocation).one().quantity = defect_pool.MAX_QUANTITY
    operation = inventory_operations.create_business_operation(db_session, domain="defect", action="scrap",
        display_label="scrap", actor_name=actor.name, actor_employee_id=actor.employee_id)
    db_session.add(DefectStockMovement(pool_id=pool.pool_id, operation_id=operation.operation_id,
        effect_ordinal=0, delta=-1, before_quantity=defect_pool.MAX_QUANTITY,
        after_quantity=defect_pool.MAX_QUANTITY - 1, reason="scrap"))
    db_session.add(TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.DEFECT_SCRAP,
        quantity_change=-1, operation_id=operation.operation_id, operation_role=InventoryOperationRoleEnum.PRIMARY,
        inventory_effect=[{"scope": "location", "department": "창고", "status": "DEFECTIVE", "delta": -1}]))
    db_session.commit()
    preview = cancel.preview_cancellation(db_session, operation.operation_id)
    assert not preview.can_cancel


def test_database_triggers_freeze_pool_evidence_and_occurrence_quantities(db_session, make_item, monkeypatch):
    import importlib.util
    from pathlib import Path
    from alembic import context
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text
    from sqlalchemy.exc import DatabaseError
    item = make_item(name="Immutable pool", warehouse_qty=Decimal(10))
    actor, pool = pool_environment(db_session, item)
    defect_actions.quarantine_inventory(db_session, item_id=item.item_id, qty=Decimal(3),
        source="warehouse", target_dept=DepartmentEnum.WAREHOUSE, source_dept=None,
        actor=actor, reason_category="test", reason_memo="in", client_request_id=None)
    path = Path(__file__).resolve().parents[2] / "alembic/versions/20261001_0040_pool_consumers.py"
    spec = importlib.util.spec_from_file_location("phase2b_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    monkeypatch.setattr(context, "is_offline_mode", lambda: False)
    with Operations.context(MigrationContext.configure(db_session.connection())):
        migration.upgrade()
    for sql in (
        "UPDATE defect_stock_movements SET delta=2",
        "DELETE FROM defect_stock_movements",
        "UPDATE defect_pool_cutovers SET cutover_version=2",
        "UPDATE defect_quarantine_records SET remaining_quantity=1",
        "UPDATE defect_quarantine_records SET management_category='B_GRADE'",
    ):
        with pytest.raises(DatabaseError):
            with db_session.begin_nested():
                db_session.execute(text(sql))
    defect_actions.unquarantine_inventory(db_session, pool_id=pool.pool_id, item_id=item.item_id,
        qty=Decimal(1), dept=DepartmentEnum.WAREHOUSE, actor=actor,
        reason_category="test", reason_memo="allowed append")
    db_session.refresh(pool)
    assert pool.quantity == 2
    assert db_session.query(DefectQuarantineRecord).one().remaining_quantity == 3


def test_pool_integrity_keeps_normal_reservation_authority_separate(db_session, make_item):
    from app.models import StockRequest, StockRequestLine, StockRequestStatusEnum, StockRequestTypeEnum, RequestBucketEnum
    from app.services import pool_integrity
    item = make_item(name="Normal reserved", warehouse_qty=Decimal(10))
    actor, pool = pool_environment(db_session, item)
    request = StockRequest(request_code="NORMAL-RESERVE", requester_employee_id=actor.employee_id,
        requester_name=actor.name, requester_department="창고", request_type=StockRequestTypeEnum.RAW_SHIP,
        status=StockRequestStatusEnum.RESERVED)
    db_session.add(request)
    db_session.flush()
    db_session.add(StockRequestLine(request_id=request.request_id, item_id=item.item_id,
        item_name_snapshot=item.item_name,
        quantity=1, from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.NONE,
        status=StockRequestStatusEnum.RESERVED))
    db_session.flush()
    assert pool_integrity.stock_issues(db_session) == []
