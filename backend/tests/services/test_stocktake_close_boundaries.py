"""Public close commands preserve bounded selection and stock invariants."""

import uuid
from decimal import Decimal

import pytest
from pydantic import ValidationError
from sqlalchemy import event

from app import models
from app.services.defect_pool import MAX_QUANTITY
from app.services.inventory_conflicts import InventoryConflict
from tests.services.test_stocktake_application import apply, confirm, preview
from tests.services.test_stocktake_close_contract import _close, _close_preview
from tests.services.test_stocktake_counts import command, setup_round


def _department_scope(db, name: str) -> str:
    """Create an active physical scope before the round freezes target cells."""
    department = models.Department(name=name, is_active=True)
    db.add(department)
    db.flush()
    scope_key = f"department:{department.id}"
    db.add(models.InventoryScope(
        scope_key=scope_key, department_id=department.id, physical_department=name,
    ))
    return scope_key


def _target_env(db, env, item, scope_key: str):
    target = next(row for row in env[0].list_targets(db, uuid.UUID(env[3]["round_id"]))["items"]
                  if row["item_id"] == str(item.item_id) and row["scope_id"] == scope_key)
    return (env[0], env[1], item, env[3], target)


def _seed_pool_cutover(db, actor) -> None:
    """Supply the POOL authority precondition for category effects in this isolated DB."""
    from app.services import inventory_operations

    operation = inventory_operations.create_business_operation(
        db, domain="pool", action="cutover", display_label="Fixture cutover",
        actor_name=actor.name, actor_employee_id=actor.employee_id,
    )
    db.add(models.DefectPoolCutover(
        actor_employee_id=actor.employee_id, operation_id=operation.operation_id,
        source_fingerprint="a" * 64, cutover_version=1,
    ))
    db.commit()


def test_close_applies_negative_delta_before_positive_delta_for_same_item(db_session, make_item) -> None:
    scope_key = _department_scope(db_session, "연구")
    item = make_item(name="Near maximum", warehouse_qty=MAX_QUANTITY)
    db_session.commit()
    env = setup_round(db_session, make_item)
    department_count = confirm(db_session, _target_env(db_session, env, item, scope_key), normal=1)
    warehouse_count = confirm(db_session, _target_env(db_session, env, item, "warehouse"), normal=MAX_QUANTITY - 1)
    proposal = _close_preview(db_session, env, selected=[
        department_count["confirmation_revision_id"], warehouse_count["confirmation_revision_id"],
    ])
    assert proposal["can_close"] is True

    result = _close(db_session, env, proposal)

    assert result["status"] == "CLOSED_PARTIAL"
    inventory = db_session.query(models.Inventory).filter_by(item_id=item.item_id).one()
    assert inventory.quantity == MAX_QUANTITY
    logs = db_session.query(models.TransactionLog).filter_by(item_id=item.item_id).all()
    assert len(logs) == 2
    assert all(0 <= log.quantity_after <= MAX_QUANTITY for log in logs)


def test_three_locations_can_close_together_with_typed_zero_observations(db_session, make_item) -> None:
    scopes = [_department_scope(db_session, name) for name in ("연구", "조립")]
    db_session.commit()
    env = setup_round(db_session, make_item)
    selected = [
        confirm(db_session, _target_env(db_session, env, env[2], scope),
                normal=10 if scope == "warehouse" else 0)["confirmation_revision_id"]
        for scope in ["warehouse", *scopes]
    ]
    proposal = _close_preview(db_session, env, mode="FULL", selected=selected, reason="")
    assert proposal["can_close"] is True
    assert proposal["summary"]["selected"] == 3
    result = _close(db_session, env, proposal)
    assert result["status"] == "CLOSED_FULL"
    assert len(result["applications"]) == 3
    assert db_session.query(models.StocktakeApplicationLine).count() == 3
    assert db_session.query(models.TransactionLog).count() == 0


def test_fourth_location_is_rejected_before_any_selected_apply(db_session, make_item) -> None:
    scopes = [_department_scope(db_session, name) for name in ("연구", "조립", "고압")]
    db_session.commit()
    env = setup_round(db_session, make_item)
    selected = [
        confirm(db_session, _target_env(db_session, env, env[2], scope),
                normal=10 if scope == "warehouse" else 0)["confirmation_revision_id"]
        for scope in ["warehouse", *scopes]
    ]
    with pytest.raises(InventoryConflict) as error:
        _close_preview(db_session, env, selected=selected)
    assert (error.value.code, error.value.status_code) == ("SCALE_LIMIT", 422)
    assert db_session.query(models.StocktakeApplication).count() == 0


def test_multiple_locations_check_combined_total_limit(db_session, make_item) -> None:
    scope = _department_scope(db_session, "연구")
    item = make_item(name="Combined maximum", warehouse_qty=MAX_QUANTITY - 1)
    db_session.commit()
    env = setup_round(db_session, make_item)
    selected = [
        confirm(db_session, _target_env(db_session, env, item, "warehouse"),
                normal=MAX_QUANTITY)["confirmation_revision_id"],
        confirm(db_session, _target_env(db_session, env, item, scope), normal=1)["confirmation_revision_id"],
    ]
    proposal = _close_preview(db_session, env, selected=selected)
    assert proposal["can_close"] is False
    with pytest.raises(InventoryConflict) as error:
        _close(db_session, env, proposal)
    assert (error.value.code, error.value.status_code) == ("STOCKTAKE_APPLY_HELD", 422)
    assert db_session.query(models.StocktakeApplication).count() == 0
    assert db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().quantity == MAX_QUANTITY - 1


def test_zero_selection_close_never_scans_or_updates_all_targets_counts_gates(
    db_session, make_item,
) -> None:
    for index in range(100):
        make_item(name=f"Large denominator {index}", warehouse_qty=0)
    db_session.commit()
    env = setup_round(db_session, make_item)
    proposal = _close_preview(db_session, env)
    assert proposal["summary"]["total"] == 101
    statements = []

    def capture(_connection, _cursor, statement, _parameters, _context, _executemany) -> None:
        statements.append(statement.lower())

    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", capture)
    try:
        result = _close(db_session, env, proposal)
    finally:
        event.remove(connection, "before_cursor_execute", capture)
    assert result["status"] == "CLOSED_PARTIAL"
    assert not [statement for statement in statements if any(table in statement for table in (
        "stocktake_targets", "stocktake_counts", "stocktake_gates",
    ))]


def test_applied_location_regular_receipt_does_not_stale_close_preview(db_session, make_item) -> None:
    from app.services import inventory as inventory_svc

    env = setup_round(db_session, make_item)
    counted = confirm(db_session, env)
    apply(db_session, env, preview(db_session, env, counted))
    proposal = _close_preview(db_session, env, mode="FULL", reason="")
    inventory_svc.receive_confirmed(db_session, env[2].item_id, Decimal(1))
    db_session.commit()
    result = _close(db_session, env, proposal)
    assert result["status"] == "CLOSED_FULL"
    assert db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one().quantity == 11


def test_new_scope_pending_target_stales_close_preview(db_session, make_item) -> None:
    env = setup_round(db_session, make_item)
    proposal = _close_preview(db_session, env)
    db_session.add(models.Department(name="신규 위치", is_active=True))
    db_session.commit()
    assert db_session.query(models.StocktakePendingTarget).filter_by(round_id=uuid.UUID(env[3]["round_id"])).count() == 1
    with pytest.raises(InventoryConflict) as error:
        _close(db_session, env, proposal)
    assert error.value.code == "PREVIEW_STALE"


def test_ten_targets_and_forty_effects_are_inclusive_close_limits(db_session, make_item) -> None:
    for index in range(9):
        make_item(name=f"Limit target {index}", warehouse_qty=10)
    db_session.commit()
    env = setup_round(db_session, make_item)
    _seed_pool_cutover(db_session, env[1])
    targets = env[0].list_targets(db_session, uuid.UUID(env[3]["round_id"]))["items"]
    assert len(targets) == 10
    confirmed = []
    for index, target in enumerate(targets):
        target_env = (env[0], env[1], env[2], env[3], target)
        confirmed.append(confirm(
            db_session, target_env, normal=11 if index < 9 else 10,
            defect=1 if index < 8 else 0,
            b_grade=1 if index < 8 else 0,
            obsolete=1 if index < 8 else 0,
        ))
    ids = [row["confirmation_revision_id"] for row in confirmed]
    with pytest.raises(InventoryConflict) as error:
        _close_preview(db_session, env, mode="FULL", selected=ids, reason="")
    assert (error.value.code, error.value.status_code) == ("SCALE_LIMIT", 422)
    assert db_session.query(models.StocktakeApplication).count() == 0

    ninth = (env[0], env[1], env[2], env[3], targets[8])
    resumed = command(db_session, ninth, "count_resume", confirmed[8],
                      reason_code="EDIT", reason="Keep to effect limit")
    saved = command(db_session, ninth, "count_save", resumed, quantities={
        "normal": 10, "defect": 0, "b_grade": 0, "obsolete": 0,
    })
    reconfirmed = command(db_session, ninth, "count_confirm", saved)
    ids[8] = reconfirmed["confirmation_revision_id"]
    proposal = _close_preview(db_session, env, mode="FULL", selected=ids, reason="")
    assert proposal["can_close"] is True
    assert proposal["summary"]["total"] == proposal["summary"]["selected"] == 10
    manifest = db_session.get(models.StocktakeCloseManifest, uuid.UUID(proposal["manifest_id"]))
    assert sum(application["effect_count"] for application in manifest.header["applications"]) == 40

    with pytest.raises(ValidationError):
        _close_preview(db_session, env, selected=[*ids, str(uuid.uuid4())])
    result = _close(db_session, env, proposal)
    assert result["status"] == "CLOSED_FULL"
    assert db_session.query(models.StocktakeApplicationLine).count() == 10


def test_close_target_limit_also_rejects_previously_sealed_large_selections(db_session) -> None:
    """Final close must recheck a seal produced before the limit was reduced."""
    from app.services.stocktake_closing import selected_manifests

    with pytest.raises(InventoryConflict) as error:
        selected_manifests(db_session, uuid.uuid4(), [str(uuid.uuid4()) for _ in range(11)], lock=True)
    assert (error.value.code, error.value.status_code) == ("SCALE_LIMIT", 422)


def test_ordinary_selected_application_keeps_its_larger_limit() -> None:
    """Pre-apply is the supported way to keep large closes brief."""
    from app.schemas.stocktake import ClosePreviewBody, SelectionBody
    from app.services.stocktake_application import MAX_EFFECTS

    ids = [uuid.uuid4() for _ in range(100)]
    assert len(SelectionBody(confirmation_revision_ids=ids).confirmation_revision_ids) == 100
    assert MAX_EFFECTS == 400
    with pytest.raises(ValidationError):
        ClosePreviewBody(mode="PARTIAL", reason="Pre-apply first", confirmation_revision_ids=ids[:11])


def test_preexisting_large_seal_cannot_close_after_limit_reduction(db_session, make_item, monkeypatch) -> None:
    """An earlier valid preview must not bypass the current final command limit."""
    from pydantic import Field
    from app.schemas.stocktake import ClosePreview, COMMANDS
    from app.services import stocktake_closing

    class PriorClosePreview(ClosePreview):
        confirmation_revision_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)

    for index in range(10):
        make_item(name=f"Earlier seal {index}", warehouse_qty=10)
    db_session.commit()
    env = setup_round(db_session, make_item)
    targets = env[0].list_targets(db_session, uuid.UUID(env[3]["round_id"]))["items"]
    ids = [confirm(db_session, (env[0], env[1], env[2], env[3], target), normal=11)["confirmation_revision_id"]
           for target in targets]
    before = db_session.query(models.Inventory.item_id, models.Inventory.quantity).order_by(models.Inventory.item_id).all()
    with monkeypatch.context() as prior:
        prior.setattr(stocktake_closing, "MAX_CLOSE_TARGETS", 100)
        prior.setitem(COMMANDS, "round_close_preview", PriorClosePreview)
        proposal = _close_preview(db_session, env, selected=ids)
    assert proposal["can_close"] is True and proposal["summary"]["selected"] == 11
    with pytest.raises(InventoryConflict) as error:
        _close(db_session, env, proposal)
    assert (error.value.code, error.value.status_code) == ("SCALE_LIMIT", 422)
    assert db_session.query(models.Inventory.item_id, models.Inventory.quantity).order_by(models.Inventory.item_id).all() == before
    assert db_session.query(models.StocktakeApplication).count() == 0
    assert db_session.query(models.StocktakeCloseCommit).count() == 0
    assert db_session.get(models.StocktakeRound, uuid.UUID(env[3]["round_id"])).status == "ACTIVE"
