"""The explicit cutover preserves physical stock and either commits once or not at all."""
import uuid
from decimal import Decimal

import pytest

from app.models import (DefectPoolBridge, DefectPoolCutover, DefectQuarantineRecord,
    DefectStockMovement, DefectStockPool, DepartmentEnum, Employee, Inventory,
    InventoryLocation, StocktakeControl, SystemSetting)
from app.services import defect_actions


def legacy_environment(db, make_item, *, category="DEFECT"):
    item = make_item(name="Cutover stock", warehouse_qty=Decimal(10))
    actor = Employee(employee_code="CUTOVER-ACTOR", name="Cutover operator", role="대표",
        department="창고", department_role="primary", is_active=True)
    db.add_all([actor, StocktakeControl(id=1, inventory_mode="LEGACY", epoch=0),
        SystemSetting(setting_key="inventory_operation_cutover_at", setting_value="2020-01-01T00:00:00")])
    db.commit()
    defect_actions.quarantine_inventory(db, item_id=item.item_id, qty=Decimal(4),
        source="warehouse", target_dept=DepartmentEnum.WAREHOUSE, source_dept=None,
        actor=actor, reason_category="test", reason_memo="fixture", client_request_id=None, management_category=category)
    return item, actor


def test_preflight_is_read_only_and_cutover_preserves_physical_stock(db_session, make_item):
    from app.services import pool_cutover
    item, actor = legacy_environment(db_session, make_item)
    plan = pool_cutover.preflight(db_session)
    assert not plan["blocking"]
    assert db_session.query(DefectStockPool).count() == 0
    assert db_session.query(DefectPoolBridge).count() == 0
    assert db_session.get(StocktakeControl, 1).inventory_mode == "LEGACY"
    assert pool_cutover.preflight(db_session)["source_fingerprint"] == plan["source_fingerprint"]
    cutover_id = uuid.uuid4()
    receipt = pool_cutover.apply_cutover(db_session, cutover_id=cutover_id,
        expected_fingerprint=plan["source_fingerprint"], actor_id=actor.employee_id)
    assert receipt["cutover_id"] == str(cutover_id)
    assert db_session.get(StocktakeControl, 1).inventory_mode == "POOL"
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == 6
    assert db_session.query(InventoryLocation).one().quantity == 4
    assert db_session.query(DefectQuarantineRecord).one().remaining_quantity == 4
    assert db_session.query(DefectStockPool).one().quantity == 4
    movement = db_session.query(DefectStockMovement).one()
    assert (movement.before_quantity, movement.delta, movement.after_quantity) == (0, 4, 4)
    assert db_session.query(DefectPoolBridge).count() >= 2
    assert pool_cutover.apply_cutover(db_session, cutover_id=cutover_id,
        expected_fingerprint=plan["source_fingerprint"], actor_id=actor.employee_id) == receipt
    assert db_session.query(DefectStockMovement).count() == 1
    with pytest.raises(ValueError, match="전환"):
        pool_cutover.apply_cutover(db_session, cutover_id=uuid.uuid4(),
            expected_fingerprint=plan["source_fingerprint"], actor_id=actor.employee_id)


def test_cutover_rejects_stale_fingerprint_without_writes(db_session, make_item):
    from app.services import pool_cutover
    _, actor = legacy_environment(db_session, make_item)
    with pytest.raises(ValueError, match="지문"):
        pool_cutover.apply_cutover(db_session, cutover_id=uuid.uuid4(), expected_fingerprint="0" * 64,
            actor_id=actor.employee_id)
    assert db_session.query(DefectPoolCutover).count() == 0
    assert db_session.get(StocktakeControl, 1).inventory_mode == "LEGACY"


def test_missing_legacy_effect_is_preserved_without_inventing_an_effect(db_session, make_item):
    from app.models import TransactionLog
    from app.services import pool_cutover
    legacy_environment(db_session, make_item)
    log = db_session.query(TransactionLog).one()
    log.operation_id = None
    log.inventory_effect = None
    db_session.commit()
    plan = pool_cutover.preflight(db_session)
    assert any(warning["code"] == "MISSING_LEGACY_EFFECT" for warning in plan["warnings"])
    assert not any(bridge["source_key"].startswith(f"effect:{log.log_id}") for bridge in plan["_bridges"])
    assert log.inventory_effect is None


@pytest.mark.parametrize("reserved,category,kind", [(False, "DEFECT", "DEFECT_SCRAP"),
    (True, "DEFECT", "DEFECT_SCRAP"), (False, "B_GRADE", "SUPPLIER_RETURN")])
def test_pending_request_links_preserve_existing_reservation_once(db_session, make_item, reserved, category, kind):
    from app.models import RequestBucketEnum, StockRequest, StockRequestLine, StockRequestStatusEnum, StockRequestTypeEnum
    from app.services import pool_cutover
    item, actor = legacy_environment(db_session, make_item, category=category)
    record = db_session.query(DefectQuarantineRecord).one()
    state = StockRequestStatusEnum.RESERVED if reserved else StockRequestStatusEnum.SUBMITTED
    request = StockRequest(requester_employee_id=actor.employee_id, requester_name=actor.name,
        requester_department="창고", request_type=StockRequestTypeEnum[kind], status=state)
    db_session.add(request)
    db_session.flush()
    line = StockRequestLine(request_id=request.request_id, item_id=item.item_id, item_name_snapshot=item.item_name, quantity=2,
        from_bucket=RequestBucketEnum.DEFECTIVE, from_department="창고", to_bucket=RequestBucketEnum.NONE,
        status=state, defect_quarantine_record_id=record.record_id)
    db_session.add(line)
    db_session.query(InventoryLocation).one().pending_quantity = 2 if reserved else 0
    db_session.commit()
    plan = pool_cutover.preflight(db_session)
    assert not plan["blocking"], plan["blocking"]
    pool_cutover.apply_cutover(db_session, cutover_id=uuid.uuid4(),
        expected_fingerprint=plan["source_fingerprint"], actor_id=actor.employee_id)
    pool = db_session.query(DefectStockPool).one()
    assert line.pool_id == pool.pool_id
    assert pool.pending_quantity == db_session.query(InventoryLocation).one().pending_quantity == (2 if reserved else 0)
    assert request.status == line.status == state
    assert db_session.query(DefectPoolBridge).filter_by(source_key=f"reservation:{line.line_id}").one().source_payload["reserved"] is reserved


def test_quantity_mismatch_blocks_without_repair(db_session, make_item):
    from app.services import pool_cutover
    _, actor = legacy_environment(db_session, make_item)
    location = db_session.query(InventoryLocation).one()
    location.pending_quantity = 1
    db_session.commit()
    plan = pool_cutover.preflight(db_session)
    assert plan["blocking"]
    with pytest.raises(ValueError, match="차단"):
        pool_cutover.apply_cutover(db_session, cutover_id=uuid.uuid4(),
            expected_fingerprint=plan["source_fingerprint"], actor_id=actor.employee_id)
    assert db_session.query(InventoryLocation).one().pending_quantity == 1
    assert db_session.query(DefectStockPool).count() == 0


def test_positive_legacy_balance_without_movement_is_not_the_zero_history_exception(db_session, make_item):
    from datetime import datetime
    from app.models import DefectInventoryMovement
    from app.services import pool_cutover
    legacy_environment(db_session, make_item)
    record = db_session.query(DefectQuarantineRecord).one()
    record.is_legacy = True
    record.quarantined_at = datetime(2019, 1, 1)
    db_session.query(DefectInventoryMovement).delete()
    db_session.commit()
    plan = pool_cutover.preflight(db_session)
    assert any(entry["code"] == "UNPROVEN_MISSING_MOVEMENT" for entry in plan["blocking"])


def test_ledger_configuration_is_bound_to_reviewed_fingerprint(db_session, make_item):
    from app.services import pool_cutover
    legacy_environment(db_session, make_item)
    fingerprint = pool_cutover.preflight(db_session)["source_fingerprint"]
    db_session.get(SystemSetting, "inventory_operation_cutover_at").setting_value = "2021-01-01T00:00:00"
    db_session.commit()
    assert pool_cutover.preflight(db_session)["source_fingerprint"] != fingerprint


@pytest.mark.parametrize("empty", [False, True])
def test_v2_integrity_recognizes_pool_evidence_and_cutover_is_not_business_cancel(db_session, make_item, empty):
    from app.services import inventory_integrity, inventory_operation_cancellation, pool_cutover
    item, actor = legacy_environment(db_session, make_item)
    if empty:
        record = db_session.query(DefectQuarantineRecord).one()
        defect_actions.unquarantine_inventory(db_session, record_id=record.record_id, item_id=item.item_id,
            qty=Decimal(4), dept=DepartmentEnum.WAREHOUSE, actor=actor, reason_category="test", reason_memo="empty fixture")
    db_session.add(SystemSetting(setting_key="inventory_operation_v2_cutover_at", setting_value="2020-01-01T00:00:00"))
    db_session.commit()
    plan = pool_cutover.preflight(db_session)
    result = pool_cutover.apply_cutover(db_session, cutover_id=uuid.uuid4(),
        expected_fingerprint=plan["source_fingerprint"], actor_id=actor.employee_id)
    assert inventory_integrity.diagnose_inventory_integrity(db_session).blocking_count == 0
    preview = inventory_operation_cancellation.preview_cancellation(db_session,
        operation_id=uuid.UUID(result["operation_id"]))
    assert not preview.can_cancel


@pytest.mark.parametrize("stage", ["scopes", "pools", "bridges", "mode"])
def test_injected_failure_rolls_back_whole_cutover(db_session, make_item, monkeypatch, stage):
    from app.services import pool_cutover
    _, actor = legacy_environment(db_session, make_item)
    plan = pool_cutover.preflight(db_session)
    def fail_at(current: str) -> None:
        if current == stage:
            raise RuntimeError("injected cutover interruption")
    monkeypatch.setattr(pool_cutover, "_checkpoint", fail_at)
    with pytest.raises(RuntimeError, match="interruption"):
        pool_cutover.apply_cutover(db_session, cutover_id=uuid.uuid4(),
            expected_fingerprint=plan["source_fingerprint"], actor_id=actor.employee_id)
    assert db_session.get(StocktakeControl, 1).inventory_mode == "LEGACY"
    assert db_session.query(DefectPoolCutover).count() == 0
    assert db_session.query(DefectStockPool).count() == 0
    assert db_session.query(DefectPoolBridge).count() == 0


def test_cutover_acquires_exclusive_control_before_any_shared_stock_guard(db_session, make_item, monkeypatch):
    from app.services import pool_cutover, stocktake_guard
    _, actor = legacy_environment(db_session, make_item)
    plan = pool_cutover.preflight(db_session)
    observed = []
    monkeypatch.setattr(pool_cutover, "_checkpoint", lambda stage: observed.append(
        db_session.info[stocktake_guard.STATE_KEY]["exclusive"]))
    pool_cutover.apply_cutover(db_session, cutover_id=uuid.uuid4(),
        expected_fingerprint=plan["source_fingerprint"], actor_id=actor.employee_id)
    assert observed and all(observed)
