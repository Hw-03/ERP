"""Selected stocktake application contracts against disposable stock and pool rows."""

import uuid
from datetime import datetime
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app import models
from app.services import inventory_operations, stocktake_application
from app.services.inventory_conflicts import InventoryConflict
from tests.services.test_stocktake_application import apply, confirm, preview
from tests.services.test_stocktake_counts import command, setup_round, start_count


def _targets(db, env):
    return {
        row.item_id: row
        for row in db.query(models.StocktakeTarget).filter_by(set_id=db.get(
            models.StocktakeTarget, uuid.UUID(env[4]["target_id"])
        ).set_id).all()
    }


def _confirm_target(db, env, target, **quantities):
    svc, actor, _, round_, _ = env
    current = {"normal": 10, "defect": 0, "b_grade": 0, "obsolete": 0}
    current.update(quantities)
    started = svc.execute(db, actor, "count_start", str(uuid.uuid4()), {
        "target_id": str(target.target_id), "expected_target_version": target.version,
        "round_epoch": round_["epoch"],
    })
    saved = command(db, env, "count_save", started, quantities=current)
    return command(db, env, "count_confirm", saved)


def _preview_selected(db, env, confirmations):
    return env[0].execute(db, env[1], "application_preview", str(uuid.uuid4()), {
        "round_id": env[3]["round_id"],
        "confirmation_revision_ids": [row["confirmation_revision_id"] for row in confirmations],
    })


def _cutover(db, env):
    operation = inventory_operations.create_business_operation(
        db, domain="pool", action="cutover", display_label="Fixture",
        actor_name=env[1].name, actor_employee_id=env[1].employee_id,
    )
    assert operation is not None
    row = models.DefectPoolCutover(
        actor_employee_id=env[1].employee_id, operation_id=operation.operation_id,
        source_fingerprint="c" * 64, cutover_version=1,
        performed_at=datetime(2026, 1, 2),
    )
    db.add(row)
    db.flush()
    return row


def _pool(db, env, category, quantity, *, pending=0):
    cutover = db.query(models.DefectPoolCutover).one_or_none() or _cutover(db, env)
    row = models.DefectStockPool(
        item_id=env[2].item_id, scope_key="warehouse", category=category,
        quantity=quantity, pending_quantity=pending, cutover_id=cutover.cutover_id,
    )
    db.add(row)
    db.flush()
    return row


def test_one_held_row_keeps_entire_selected_batch_unapplied(db_session, make_item):
    second = make_item(name="Held second", warehouse_qty=10, pending=6)
    env = setup_round(db_session, make_item)
    targets = _targets(db_session, env)
    first_count = _confirm_target(db_session, env, targets[env[2].item_id], normal=11)
    second_count = _confirm_target(db_session, env, targets[second.item_id], normal=5)
    proposal = _preview_selected(db_session, env, [first_count, second_count])

    assert not proposal["can_apply"]
    assert len([entry for entry in proposal["entries"] if entry["held"]]) == 1
    with pytest.raises(InventoryConflict) as error:
        apply(db_session, env, proposal)
    assert error.value.code == "STOCKTAKE_APPLY_HELD"
    assert db_session.query(models.StocktakeApplication).count() == 0
    assert db_session.query(models.TransactionLog).count() == 0
    assert db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one().warehouse_qty == 10
    assert all(db_session.get(models.StocktakeCount, uuid.UUID(row["count_id"])).status == "CONFIRMED"
               for row in (first_count, second_count))


def test_exception_on_later_row_rolls_back_stock_gate_count_evidence_and_receipt(
    db_session, make_item, monkeypatch,
):
    make_item(name="Second rollback", warehouse_qty=10)
    env = setup_round(db_session, make_item)
    counts = [_confirm_target(db_session, env, target, normal=12)
              for target in _targets(db_session, env).values()]
    proposal = _preview_selected(db_session, env, counts)
    key = str(uuid.uuid4())
    original = stocktake_application._apply_quantities
    calls = 0

    def fail_on_second(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("injected second-row failure")
        return original(*args, **kwargs)

    monkeypatch.setattr(stocktake_application, "_apply_quantities", fail_on_second)
    with pytest.raises(RuntimeError, match="second-row failure"):
        apply(db_session, env, proposal, key=key)
    assert calls == 2
    assert db_session.query(models.StocktakeApplication).count() == 0
    assert db_session.query(models.TransactionLog).count() == 0
    assert db_session.query(models.InventoryOperation).filter_by(domain="stocktake").count() == 0
    assert db_session.query(models.StocktakeReceipt).filter_by(command_kind="application_apply", idempotency_key=key).count() == 0
    for count in counts:
        row = db_session.get(models.StocktakeCount, uuid.UUID(count["count_id"]))
        target = db_session.get(models.StocktakeTarget, row.target_id)
        gate = db_session.get(models.StocktakeGate, (target.item_id, target.scope_key))
        stock = db_session.query(models.Inventory).filter_by(item_id=target.item_id).one()
        assert row.status == "CONFIRMED" and gate.active_count_id == row.count_id
        assert gate.fence == count["fence"] and gate.observation_epoch == 0
        assert stock.warehouse_qty == 10 and stock.quantity == 10


def test_category_transfer_preserves_physical_total_and_writes_only_pool_movements(db_session, make_item):
    env = setup_round(db_session, make_item)
    _pool(db_session, env, "DEFECT", 4)
    _pool(db_session, env, "B_GRADE", 1)
    db_session.add(models.InventoryLocation(
        item_id=env[2].item_id, department=models.DepartmentEnum.WAREHOUSE,
        status=models.LocationStatusEnum.DEFECTIVE, quantity=5,
    ))
    inventory = db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one()
    inventory.quantity = 15
    db_session.commit()

    count = confirm(db_session, env, normal=10, defect=2, b_grade=3)
    proposal = preview(db_session, env, count)
    assert proposal["effect_count"] == 2
    apply(db_session, env, proposal)

    pools = {pool.category: pool.quantity for pool in db_session.query(models.DefectStockPool).all()}
    movements = sorted(row.delta for row in db_session.query(models.DefectStockMovement).all())
    physical = db_session.query(models.InventoryLocation).filter_by(item_id=env[2].item_id,
        status=models.LocationStatusEnum.DEFECTIVE).one()
    assert pools == {"DEFECT": 2, "B_GRADE": 3}
    assert movements == [-2, 2]
    assert physical.quantity == 5 and inventory.quantity == 15
    assert db_session.query(models.TransactionLog).count() == 0


def test_normal_and_defect_differences_share_one_adjust_and_one_pool_effect(db_session, make_item):
    env = setup_round(db_session, make_item)
    _pool(db_session, env, "DEFECT", 2)
    db_session.add(models.InventoryLocation(item_id=env[2].item_id,
        department=models.DepartmentEnum.WAREHOUSE,
        status=models.LocationStatusEnum.DEFECTIVE, quantity=2))
    stock = db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one()
    stock.quantity = 12
    db_session.commit()

    count = confirm(db_session, env, normal=12, defect=3)
    apply(db_session, env, preview(db_session, env, count))
    log = db_session.query(models.TransactionLog).one()
    movement = db_session.query(models.DefectStockMovement).one()
    assert log.transaction_type == models.TransactionTypeEnum.ADJUST
    assert (log.quantity_before, log.quantity_change, log.quantity_after) == (12, 3, 15)
    assert movement.delta == 1
    assert stock.warehouse_qty == 12 and stock.quantity == 15


def test_duplicate_confirmation_and_over_limit_selection_are_rejected(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = confirm(db_session, env)
    revision = count["confirmation_revision_id"]
    for selected in ([revision, revision], [str(uuid.uuid4()) for _ in range(101)]):
        with pytest.raises(ValidationError):
            env[0].execute(db_session, env[1], "application_preview", str(uuid.uuid4()), {
                "round_id": env[3]["round_id"], "confirmation_revision_ids": selected,
            })
    assert db_session.query(models.StocktakeApplication).count() == 0


@pytest.mark.parametrize("reservation_source", ["stock_request", "shipping"])
def test_each_normal_reservation_source_holds_application(
    db_session, make_item, reservation_source,
):
    env = setup_round(db_session, make_item)
    if reservation_source == "stock_request":
        inventory = db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one()
        inventory.pending_quantity = 4
    else:
        request = models.ShippingRequest(
            base_pf_item_id=env[2].item_id, status=models.ShippingRequestStatusEnum.PREPARED,
            request_quantity=4,
        )
        db_session.add(request)
        db_session.flush()
        db_session.add(models.ShippingAllocation(
            request_id=request.request_id, item_id=env[2].item_id,
            quantity=4, department=None, status="RESERVED",
        ))
    db_session.commit()

    count = confirm(db_session, env, normal=3)
    proposal = preview(db_session, env, count)
    entry = proposal["entries"][0]
    assert entry["reservations"]["normal"] == 4
    assert entry["normal_reservations"][reservation_source] == 4
    assert not proposal["can_apply"]
    with pytest.raises(InventoryConflict) as error:
        apply(db_session, env, proposal)
    assert error.value.code == "STOCKTAKE_APPLY_HELD"
    assert db_session.query(models.StocktakeApplication).count() == 0


def test_selection_mixing_two_scopes_is_rejected(db_session, make_item):
    second = make_item(name="Assembly count", warehouse_qty=10)
    env = setup_round(db_session, make_item)
    db_session.add(models.InventoryScope(
        scope_key="assembly", physical_department=models.DepartmentEnum.ASSEMBLY.value,
    ))
    db_session.flush()
    target = _targets(db_session, env)[second.item_id]
    target.scope_key = "assembly"
    stock = db_session.query(models.Inventory).filter_by(item_id=second.item_id).one()
    stock.warehouse_qty = 0
    db_session.add(models.InventoryLocation(
        item_id=second.item_id, department=models.DepartmentEnum.ASSEMBLY,
        status=models.LocationStatusEnum.PRODUCTION, quantity=10,
    ))
    db_session.commit()
    targets = _targets(db_session, env)
    first = _confirm_target(db_session, env, targets[env[2].item_id])
    second_count = _confirm_target(db_session, env, targets[second.item_id])
    with pytest.raises(InventoryConflict) as error:
        _preview_selected(db_session, env, [first, second_count])
    assert error.value.code == "SCALE_LIMIT"
    assert db_session.query(models.StocktakeApplication).count() == 0


def test_resumed_confirmation_invalidates_sealed_preview(db_session, make_item):
    env = setup_round(db_session, make_item)
    count = confirm(db_session, env)
    proposal = preview(db_session, env, count)
    resumed = command(db_session, env, "count_resume", count, reason_code="EDIT", reason="Recount")
    with pytest.raises(InventoryConflict) as error:
        apply(db_session, env, proposal)
    assert error.value.code == "PREVIEW_STALE"
    assert db_session.get(models.StocktakeCount, uuid.UUID(count["count_id"])).status == "DRAFT"
    assert resumed["confirmation_revision_id"] is None
    assert db_session.query(models.StocktakeApplication).count() == 0


def test_zero_difference_second_epoch_still_creates_observation(db_session, make_item):
    env = setup_round(db_session, make_item)
    first = confirm(db_session, env)
    apply(db_session, env, preview(db_session, env, first))
    target = db_session.get(models.StocktakeTarget, uuid.UUID(env[4]["target_id"]))
    second = _confirm_target(db_session, env, target)
    apply(db_session, env, preview(db_session, env, second))
    lines = db_session.query(models.StocktakeApplicationLine).order_by(
        models.StocktakeApplicationLine.observation_epoch_before).all()
    assert [(line.observation_epoch_before, line.observation_epoch_after) for line in lines] == [(0, 1), (1, 2)]
    assert db_session.query(models.TransactionLog).count() == 0
    gate = db_session.get(models.StocktakeGate, (env[2].item_id, "warehouse"))
    assert gate.observation_epoch == 2


def test_exactly_100_targets_and_400_effects_fit_but_401_effects_fail(db_session, make_item):
    for number in range(99):
        make_item(name=f"Scale item {number}", warehouse_qty=10)
    env = setup_round(db_session, make_item)
    cutover = _cutover(db_session, env)
    rows = []
    for target in _targets(db_session, env).values():
        inventory = db_session.query(models.Inventory).filter_by(item_id=target.item_id).one()
        inventory.quantity = 13
        db_session.add(models.InventoryLocation(
            item_id=target.item_id, department=models.DepartmentEnum.WAREHOUSE,
            status=models.LocationStatusEnum.DEFECTIVE, quantity=3,
        ))
        for category in ("DEFECT", "B_GRADE", "OBSOLETE"):
            db_session.add(models.DefectStockPool(
                item_id=target.item_id, scope_key="warehouse", category=category,
                quantity=1, cutover_id=cutover.cutover_id,
            ))
        baseline = {"normal": 10, "defect": 1, "b_grade": 1, "obsolete": 1}
        count = SimpleNamespace(
            count_id=uuid.uuid4(), confirmation_revision_id=uuid.uuid4(),
            owner_id=env[1].employee_id, owner_name=env[1].name,
            confirmed_at=datetime(2026, 10, 1), version=3,
            baseline=baseline, quantities={"normal": 10, "defect": 2, "b_grade": 2, "obsolete": 2},
        )
        gate = SimpleNamespace(
            fence=1, quantity_revision=0, reservation_revision=0,
            observation_epoch=0,
        )
        rows.append((target, count, gate))
    db_session.commit()

    assert len(rows) == 100
    manifest = stocktake_application.manifest(db_session, uuid.UUID(env[3]["round_id"]), rows)
    assert manifest["effect_count"] == 400
    assert manifest["can_apply"]
    rows[0][1].quantities = {**rows[0][1].quantities, "normal": 11}
    with pytest.raises(InventoryConflict) as error:
        stocktake_application.manifest(db_session, uuid.UUID(env[3]["round_id"]), rows)
    assert error.value.code == "SCALE_LIMIT"
    assert db_session.query(models.StocktakeApplication).count() == 0
