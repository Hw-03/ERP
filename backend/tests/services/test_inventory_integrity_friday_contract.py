"""Friday 0033 수집기가 FULL backup용 15-check 계약을 보존하는지 검증한다."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
import importlib

import pytest

from app.models import (
    InventoryOperationRoleEnum,
    SystemSetting,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import inv_effect
from app.services import inventory as inventory_svc
from app.services import inventory_operations as operation_svc
from app.services.inventory_integrity import CATEGORIES, diagnose_inventory_integrity
from app.schemas.inventory_integrity import InventoryIntegrityResponse


EXPECTED_CHECK_IDS = [
    "INVENTORY_TOTAL_MISMATCH",
    "NEGATIVE_INVENTORY",
    "NEGATIVE_LOCATION",
    "PENDING_RESERVATION_MISMATCH",
    "STOCK_REQUEST_STATE_MISMATCH",
    "SHIPPING_ALLOCATION_MISMATCH",
    "WAREHOUSE_PHYSICAL_MISMATCH",
    "ORPHAN_REFERENCE",
    "OPERATION_V2_EFFECT_INVALID",
    "OPERATION_V1_EFFECT_MISSING",
    "DEFECT_STOCK_MISMATCH",
    "PARTIAL_CANCELLATION",
    "WORKFLOW_STATE_RESIDUE",
    "DUPLICATE_REVERSAL",
    "WEEKLY_UNCLASSIFIED_EFFECT",
]


def _engine():
    return importlib.import_module("app.services.inventory_integrity_engine")


def _check(result, check_id: str):
    return next(check for check in result.checks if check.check_id == check_id)


def _inventory_snapshot(module, *, quantity=5, warehouse=5, pending=0):
    return module.InventoryIntegritySnapshot(
        item_ids=frozenset({"item-1"}),
        active_item_ids=frozenset({"item-1"}),
        inventories=(
            module.InventoryState(
                row_id="inventory-1",
                item_id="item-1",
                quantity=Decimal(str(quantity)),
                warehouse_quantity=Decimal(str(warehouse)),
                pending_quantity=Decimal(str(pending)),
            ),
        ),
    )


def _operation_snapshot(module, effect, *, quantity_change=5):
    base = _inventory_snapshot(module)
    return module.InventoryIntegritySnapshot(
        item_ids=base.item_ids,
        active_item_ids=base.active_item_ids,
        inventories=base.inventories,
        operations=(
            module.OperationState(
                operation_id="operation-1",
                contract_version=1,
                effective_at=datetime(2026, 9, 14, 1, 0),
            ),
        ),
        transactions=(
            module.TransactionEffectState(
                log_id="log-1",
                item_id="item-1",
                operation_id="operation-1",
                created_at=datetime(2026, 9, 14, 1, 0),
                transaction_type="RECEIVE",
                operation_role="PRIMARY",
                quantity_change=Decimal(str(quantity_change)),
                reference_no=None,
                notes=None,
                inventory_effect=effect,
            ),
        ),
        cutover_at=datetime(2026, 8, 26, 22, 26),
        v2_cutover_at=datetime(2026, 9, 11, 10, 31),
        evaluated_at=datetime(2026, 9, 14, 2, 0),
    )


def test_transport_profile_defaults_to_modern_for_existing_callers() -> None:
    response = InventoryIntegrityResponse(
        contract="inventory-integrity/v1",
        status="pass",
        blocking_count=0,
        warning_count=0,
        checks=[],
        generated_at=datetime(2026, 9, 14, 2, 0),
        is_consistent=True,
        issue_count=0,
        category_counts={},
        issues=[],
    )

    assert response.profile == "modern"


def test_friday_diagnosis_exposes_v1_contract_and_keeps_legacy_details(
    db_session,
    make_item,
) -> None:
    make_item(name="Friday FULL 정상", process_type_code="PR", warehouse_qty=Decimal("4"))

    result = diagnose_inventory_integrity(db_session)

    assert result.contract == "inventory-integrity/v1"
    assert result.profile == "friday-0033"
    assert result.status == "pass"
    assert result.blocking_count == 0
    assert result.warning_count == 0
    assert [check.check_id for check in result.checks] == EXPECTED_CHECK_IDS
    assert result.is_consistent is True
    assert result.issue_count == 0
    assert result.category_counts == {category: 0 for category in CATEGORIES}
    assert set(result.contract_payload()) == {
        "contract",
        "profile",
        "status",
        "blocking_count",
        "warning_count",
        "checks",
    }
    assert not db_session.new
    assert not db_session.dirty
    assert not db_session.deleted


def test_new_friday_scope_delta_transaction_passes_with_preserved_v2_marker(
    db_session,
    make_item,
) -> None:
    item = make_item(
        name="Friday 신규 입고",
        process_type_code="PR",
        warehouse_qty=Decimal("0"),
    )
    db_session.add_all(
        [
            SystemSetting(
                setting_key="inventory_operation_cutover_at",
                setting_value="2026-08-26T22:26:50.262415+00:00",
            ),
            SystemSetting(
                setting_key="inventory_operation_v2_cutover_at",
                setting_value="2026-09-11T10:31:14.270616+00:00",
            ),
        ]
    )
    db_session.flush()
    operation = operation_svc.create_business_operation(
        db_session,
        domain="inventory_io",
        action="receive",
        display_label="Friday 신규 입고",
        actor_name="검증자",
        actor_employee_id=None,
        effective_at=datetime(2026, 9, 14, 3, 0),
    )
    assert operation is not None
    before = inv_effect.snapshot_cells(db_session, item.item_id)
    inventory_svc.receive_confirmed(
        db_session,
        item.item_id,
        Decimal("5"),
        bucket="warehouse",
    )
    log = operation_svc.attach_transaction(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=Decimal("5"),
            quantity_before=Decimal("0"),
            quantity_after=Decimal("5"),
            produced_by="검증자",
            **inv_effect.capture_log_stock_snapshot(db_session, item.item_id, before),
        ),
        operation,
        InventoryOperationRoleEnum.PRIMARY,
    )
    db_session.add(log)
    db_session.flush()

    assert log.inventory_effect == [{"scope": "warehouse", "delta": 5}]
    result = diagnose_inventory_integrity(db_session)

    assert result.status == "pass"
    assert result.blocking_count == 0
    assert result.warning_count == 0
    assert _check(result, "OPERATION_V2_EFFECT_INVALID").count == 0


def test_modern_default_stays_strict_while_friday_uses_implicit_unplaced() -> None:
    module = _engine()
    snapshot = _inventory_snapshot(module)

    modern = module.evaluate_inventory_integrity(snapshot)
    friday = module.evaluate_inventory_integrity(snapshot, profile="friday-0033")

    assert _check(modern, "WAREHOUSE_PHYSICAL_MISMATCH").count == 2
    assert _check(friday, "WAREHOUSE_PHYSICAL_MISMATCH").count == 0
    assert modern.profile == "modern"
    assert friday.profile == "friday-0033"
    assert friday.status == "pass"


def test_friday_warehouse_accepts_implicit_remainder_and_rejects_overplacement() -> None:
    module = _engine()
    base = _inventory_snapshot(module)
    placements = (
        module.WarehousePlacementState(
            row_id="box-item-1",
            item_id="item-1",
            scope="box",
            quantity=Decimal("3"),
            container_id="box-1",
        ),
        module.WarehousePlacementState(
            row_id="zone-item-1",
            item_id="item-1",
            scope="special_zone",
            quantity=Decimal("2"),
            container_id="zone-1",
        ),
    )
    balanced = module.InventoryIntegritySnapshot(
        item_ids=base.item_ids,
        active_item_ids=base.active_item_ids,
        inventories=base.inventories,
        warehouse_placements=placements,
    )
    overplaced = module.InventoryIntegritySnapshot(
        item_ids=base.item_ids,
        active_item_ids=base.active_item_ids,
        inventories=base.inventories,
        warehouse_placements=placements
        + (
            module.WarehousePlacementState(
                row_id="box-item-2",
                item_id="item-1",
                scope="box",
                quantity=Decimal("1"),
                container_id="box-2",
            ),
        ),
    )

    accepted = module.evaluate_inventory_integrity(balanced, profile="friday-0033")
    rejected = module.evaluate_inventory_integrity(overplaced, profile="friday-0033")

    assert _check(accepted, "WAREHOUSE_PHYSICAL_MISMATCH").count == 0
    check = _check(rejected, "WAREHOUSE_PHYSICAL_MISMATCH")
    assert check.count == 1
    assert check.samples[0]["reason"] == "tracked_exceeds_warehouse"


def test_friday_minimal_effect_is_valid_but_modern_projection_remains_required() -> None:
    module = _engine()
    snapshot = _operation_snapshot(
        module,
        [{"scope": "warehouse", "delta": 5}],
    )

    friday = module.evaluate_inventory_integrity(snapshot, profile="friday-0033")
    modern = module.evaluate_inventory_integrity(snapshot)

    assert _check(friday, "OPERATION_V2_EFFECT_INVALID").count == 0
    assert _check(modern, "OPERATION_V2_EFFECT_INVALID").count == 1


@pytest.mark.parametrize(
    "effect",
    [
        [{"scope": "warehouse", "delta": 0}],
        [{"scope": "warehouse", "delta": "1.5"}],
        [
            {"scope": "warehouse", "delta": 2},
            {"scope": "warehouse", "delta": 3},
        ],
        [{"scope": "warehouse_zone", "delta": 5, "zone_id": 1}],
        [{"scope": "warehouse_unplaced", "delta": 5}],
        [
            {
                "scope": "warehouse",
                "delta": 5,
                "before_quantity": 0,
                "after_quantity": 4,
            }
        ],
        [{"scope": "warehouse", "delta": 5, "before_quantity": 0}],
        [
            {
                "scope": "warehouse",
                "delta": 5,
                "before_quantity": -5,
                "after_quantity": 0,
            }
        ],
        [{"scope": "warehouse", "delta": 5, "row_id": "wrong-inventory"}],
        [{"scope": "warehouse", "delta": 5, "row_id": None}],
        [{"scope": "warehouse", "delta": 5, "row_id": ""}],
    ],
)
def test_friday_rejects_malformed_effects(effect) -> None:
    module = _engine()
    result = module.evaluate_inventory_integrity(
        _operation_snapshot(module, effect),
        profile="friday-0033",
    )

    assert result.status == "fail"
    assert _check(result, "OPERATION_V2_EFFECT_INVALID").count == 1


def test_friday_validates_optional_location_row_identity() -> None:
    module = _engine()
    inventory = module.InventoryState(
        row_id="inventory-1",
        item_id="item-1",
        quantity=Decimal("5"),
        warehouse_quantity=Decimal("0"),
        pending_quantity=Decimal("0"),
    )
    location = module.LocationState(
        row_id="location-1",
        item_id="item-1",
        department="출하",
        status="PRODUCTION",
        quantity=Decimal("5"),
        pending_quantity=Decimal("0"),
    )

    def evaluate(row_id: str):
        operation_snapshot = _operation_snapshot(
            module,
            [
                {
                    "scope": "location",
                    "department": "출하",
                    "status": "PRODUCTION",
                    "delta": -1,
                    "row_id": row_id,
                }
            ],
            quantity_change=-1,
        )
        snapshot = module.InventoryIntegritySnapshot(
            item_ids=operation_snapshot.item_ids,
            active_item_ids=operation_snapshot.active_item_ids,
            inventories=(inventory,),
            locations=(location,),
            operations=operation_snapshot.operations,
            transactions=operation_snapshot.transactions,
            cutover_at=operation_snapshot.cutover_at,
            v2_cutover_at=operation_snapshot.v2_cutover_at,
            evaluated_at=operation_snapshot.evaluated_at,
        )
        return module.evaluate_inventory_integrity(snapshot, profile="friday-0033")

    assert _check(evaluate("location-1"), "OPERATION_V2_EFFECT_INVALID").count == 0
    assert _check(evaluate("location-2"), "OPERATION_V2_EFFECT_INVALID").count == 1


def test_friday_validates_box_item_and_box_identity() -> None:
    module = _engine()
    base = _operation_snapshot(
        module,
        [
            {"scope": "warehouse", "delta": -1},
            {
                "scope": "warehouse_box",
                "box_id": "box-1",
                "row_id": "box-item-1",
                "delta": -1,
            },
        ],
        quantity_change=-1,
    )
    placement = module.WarehousePlacementState(
        row_id="box-item-1",
        item_id="item-1",
        scope="box",
        quantity=Decimal("3"),
        container_id="box-1",
    )

    def evaluate(box_id: str):
        effect = [dict(cell) for cell in base.transactions[0].inventory_effect]
        effect[1]["box_id"] = box_id
        transaction = module.TransactionEffectState(
            **{
                **base.transactions[0].__dict__,
                "inventory_effect": effect,
            }
        )
        snapshot = module.InventoryIntegritySnapshot(
            item_ids=base.item_ids,
            active_item_ids=base.active_item_ids,
            inventories=base.inventories,
            warehouse_placements=(placement,),
            operations=base.operations,
            transactions=(transaction,),
            cutover_at=base.cutover_at,
            v2_cutover_at=base.v2_cutover_at,
            evaluated_at=base.evaluated_at,
        )
        return module.evaluate_inventory_integrity(snapshot, profile="friday-0033")

    assert _check(evaluate("box-1"), "OPERATION_V2_EFFECT_INVALID").count == 0
    assert _check(evaluate("box-2"), "OPERATION_V2_EFFECT_INVALID").count == 1


def test_friday_accepts_uuid_identity_for_historically_deleted_box_item() -> None:
    module = _engine()
    snapshot = _operation_snapshot(
        module,
        [
            {"scope": "warehouse", "delta": -1},
            {
                "scope": "warehouse_box",
                "box_id": "4cc1bd4e-1616-4b08-8423-68d6839f1443",
                "row_id": "6f619f1e-dd6c-4669-87c6-55a21e6455b3",
                "delta": -1,
            },
        ],
        quantity_change=-1,
    )

    result = module.evaluate_inventory_integrity(snapshot, profile="friday-0033")

    assert _check(result, "OPERATION_V2_EFFECT_INVALID").count == 0


def test_friday_accepts_uuid_box_for_historically_deleted_minimal_effect() -> None:
    module = _engine()
    snapshot = _operation_snapshot(
        module,
        [
            {"scope": "warehouse", "delta": -1},
            {
                "scope": "warehouse_box",
                "box_id": "4cc1bd4e-1616-4b08-8423-68d6839f1443",
                "delta": -1,
            },
        ],
        quantity_change=-1,
    )

    result = module.evaluate_inventory_integrity(snapshot, profile="friday-0033")

    assert _check(result, "OPERATION_V2_EFFECT_INVALID").count == 0


def test_friday_rejects_existing_box_item_owned_by_another_item() -> None:
    module = _engine()
    base = _operation_snapshot(
        module,
        [
            {"scope": "warehouse", "delta": -1},
            {
                "scope": "warehouse_box",
                "box_id": "4cc1bd4e-1616-4b08-8423-68d6839f1443",
                "row_id": "6f619f1e-dd6c-4669-87c6-55a21e6455b3",
                "delta": -1,
            },
        ],
        quantity_change=-1,
    )
    snapshot = module.InventoryIntegritySnapshot(
        item_ids=base.item_ids | {"item-2"},
        active_item_ids=base.active_item_ids | {"item-2"},
        inventories=base.inventories,
        warehouse_placements=(
            module.WarehousePlacementState(
                row_id="6f619f1e-dd6c-4669-87c6-55a21e6455b3",
                item_id="item-2",
                scope="box",
                quantity=Decimal("1"),
                container_id="4cc1bd4e-1616-4b08-8423-68d6839f1443",
            ),
        ),
        operations=base.operations,
        transactions=base.transactions,
        cutover_at=base.cutover_at,
        v2_cutover_at=base.v2_cutover_at,
        evaluated_at=base.evaluated_at,
    )

    result = module.evaluate_inventory_integrity(snapshot, profile="friday-0033")

    assert _check(result, "OPERATION_V2_EFFECT_INVALID").count == 1


def test_friday_core_checks_cover_totals_reservations_states_shipping_and_orphans() -> None:
    module = _engine()
    now = datetime(2026, 9, 14, 2, 0)
    snapshot = module.InventoryIntegritySnapshot(
        item_ids=frozenset({"item-1", "item-2"}),
        active_item_ids=frozenset({"item-1"}),
        inventories=(
            module.InventoryState(
                row_id="inventory-1",
                item_id="item-1",
                quantity=Decimal("4"),
                warehouse_quantity=Decimal("5"),
                pending_quantity=Decimal("2"),
            ),
        ),
        locations=(
            module.LocationState(
                row_id="location-1",
                item_id="item-1",
                department="출하",
                status="PRODUCTION",
                quantity=Decimal("5"),
                pending_quantity=Decimal("3"),
            ),
            module.LocationState(
                row_id="location-orphan",
                item_id="item-2",
                department="조립",
                status="PRODUCTION",
                quantity=Decimal("-1"),
                pending_quantity=Decimal("0"),
            ),
        ),
        stock_requests=(
            module.StockRequestState(
                request_id="stock-request-1",
                request_code="SR-1",
                status="reserved",
                created_at=now,
            ),
        ),
        stock_request_lines=(
            module.StockRequestLineState(
                line_id="stock-line-1",
                request_id="stock-request-1",
                item_id="item-1",
                status="completed",
                from_bucket="warehouse",
                from_department=None,
                quantity=Decimal("1"),
            ),
        ),
        shipping_requests=(
            module.ShippingRequestState(
                request_id="shipping-request-1",
                status="PREPARED",
            ),
        ),
        shipping_allocations=(
            module.ShippingAllocationState(
                allocation_id="allocation-1",
                request_id="shipping-request-1",
                item_id="item-1",
                department="출하",
                status="RESERVED",
                quantity=Decimal("3"),
            ),
        ),
        evaluated_at=now,
    )

    result = module.evaluate_inventory_integrity(snapshot, profile="friday-0033")

    assert _check(result, "INVENTORY_TOTAL_MISMATCH").count == 1
    assert _check(result, "NEGATIVE_LOCATION").count == 1
    assert _check(result, "PENDING_RESERVATION_MISMATCH").count >= 1
    assert _check(result, "STOCK_REQUEST_STATE_MISMATCH").count == 1
    assert _check(result, "SHIPPING_ALLOCATION_MISMATCH").count == 1
    assert _check(result, "ORPHAN_REFERENCE").count == 1


def test_all_legacy_checks_remain_blocking_supplemental_findings() -> None:
    module = _engine()
    legacy_check_ids = list(CATEGORIES)
    result = module.evaluate_inventory_integrity(
        module.InventoryIntegritySnapshot(),
        profile="friday-0033",
        supplemental_findings=tuple(
            module.IntegrityFinding(
                check_id=check_id,
                sample={"problem_id": f"legacy-{index}"},
            )
            for index, check_id in enumerate(legacy_check_ids)
        ),
    )

    assert result.status == "fail"
    assert result.blocking_count == 6
    assert all(_check(result, check_id).count == 1 for check_id in legacy_check_ids)
