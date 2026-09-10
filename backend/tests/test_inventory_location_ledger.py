"""IC-06 warehouse B/Z/U physical ledger runtime contract."""

from __future__ import annotations

from decimal import Decimal
from datetime import datetime
from types import SimpleNamespace

import pytest

from app import models
from app.services.inv_transfer import _consume_warehouse, _receive_confirmed
from app.services.inv_defective import DefectSource, _mark_defective
from app.services import inv_effect
from app.services import seed_cleanup
from app.services import inventory_operations as operation_svc
from app.services.inventory import _adjust_warehouse
from app.services.warehouse_map import (
    build_map_payload,
    reconcile_inventory,
    _replace_box_items,
)


BOX_UNIQUE_INDEX = "uq_warehouse_box_items_box_item"
ZONE_UNIQUE_INDEX = "uq_warehouse_zone_items_zone_item"
UNPLACED_UNIQUE_INDEX = "uq_warehouse_unplaced_items_item_id"


def test_physical_ledger_models_match_0032_identity_contract() -> None:
    assert hasattr(models, "WarehouseUnplacedItem")
    unplaced = models.WarehouseUnplacedItem.__table__

    assert unplaced.c.id.primary_key is True
    assert unplaced.c.item_id.nullable is False
    assert unplaced.c.quantity.nullable is False
    assert {index.name for index in unplaced.indexes}.issuperset(
        {UNPLACED_UNIQUE_INDEX}
    )
    assert next(
        index for index in unplaced.indexes if index.name == UNPLACED_UNIQUE_INDEX
    ).unique is True

    box_indexes = {index.name: index for index in models.WarehouseBoxItem.__table__.indexes}
    zone_indexes = {
        index.name: index
        for index in models.WarehouseSpecialZoneItem.__table__.indexes
    }
    assert box_indexes[BOX_UNIQUE_INDEX].unique is True
    assert [column.name for column in box_indexes[BOX_UNIQUE_INDEX].columns] == [
        "box_id",
        "item_id",
    ]
    assert zone_indexes[ZONE_UNIQUE_INDEX].unique is True
    assert [column.name for column in zone_indexes[ZONE_UNIQUE_INDEX].columns] == [
        "zone_id",
        "item_id",
    ]


def test_cleanup_import_creates_zero_unplaced_row_for_each_new_item(
    db_session,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        seed_cleanup,
        "_load_excel",
        lambda _path: [
            {
                "erp_code": "MODEL-TR-1",
                "item_name": "cleanup ledger item",
                "legacy_item_type": None,
                "quantity": Decimal("3"),
            }
        ],
    )
    monkeypatch.setattr(seed_cleanup, "EXPECTED_ROWS", 1)
    monkeypatch.setattr(seed_cleanup, "EXPECTED_TOTAL_QTY", Decimal("3"))

    result = seed_cleanup.run_cleanup_import(db_session, dry_run=False)

    assert result["ok"] is True
    item = db_session.query(models.Item).filter(models.Item.item_name == "cleanup ledger item").one()
    unplaced = (
        db_session.query(models.WarehouseUnplacedItem)
        .filter(models.WarehouseUnplacedItem.item_id == item.item_id)
        .one()
    )
    assert int(unplaced.quantity) == 0


def _set_unplaced(db_session, item_id, quantity: int):
    row = (
        db_session.query(models.WarehouseUnplacedItem)
        .filter(models.WarehouseUnplacedItem.item_id == item_id)
        .one_or_none()
    )
    if row is None:
        row = models.WarehouseUnplacedItem(item_id=item_id, quantity=quantity)
        db_session.add(row)
    else:
        row.quantity = quantity
    db_session.flush()
    return row


def test_warehouse_receipt_and_adjustment_keep_unplaced_in_sync(
    db_session,
    make_item,
) -> None:
    item = make_item(warehouse_qty=Decimal("0"))
    unplaced = _set_unplaced(db_session, item.item_id, 0)

    _receive_confirmed(db_session, item.item_id, Decimal("5"))
    db_session.flush()
    db_session.refresh(unplaced)
    assert int(unplaced.quantity) == 5

    _adjust_warehouse(db_session, item.item_id, Decimal("8"))
    db_session.flush()
    db_session.refresh(unplaced)
    assert int(unplaced.quantity) == 8

    _adjust_warehouse(db_session, item.item_id, Decimal("3"))
    db_session.flush()
    inventory = (
        db_session.query(models.Inventory)
        .filter(models.Inventory.item_id == item.item_id)
        .one()
    )
    db_session.refresh(unplaced)
    assert int(inventory.warehouse_qty) == 3
    assert int(unplaced.quantity) == 3


def test_lazy_inventory_creation_also_initializes_the_unplaced_identity(
    db_session,
) -> None:
    item = models.Item(
        item_name="Lazy ledger",
        process_type_code="TR",
        unit="EA",
        model_symbol="9",
        serial_no=999,
    )
    db_session.add(item)
    db_session.flush()

    _receive_confirmed(db_session, item.item_id, Decimal("2"))
    db_session.flush()

    inventory = (
        db_session.query(models.Inventory)
        .filter(models.Inventory.item_id == item.item_id)
        .one()
    )
    unplaced = (
        db_session.query(models.WarehouseUnplacedItem)
        .filter(models.WarehouseUnplacedItem.item_id == item.item_id)
        .one()
    )
    assert int(inventory.warehouse_qty) == 2
    assert int(unplaced.quantity) == 2


def test_outbound_consumes_box_then_active_zones_then_unplaced_when_toggle_is_off(
    db_session,
    make_item,
) -> None:
    item = make_item(warehouse_qty=Decimal("12"))
    unplaced = _set_unplaced(db_session, item.item_id, 3)
    angle = models.WarehouseAngle(
        label="A",
        rows=1,
        layers=1,
        jaris_per_cell=1,
        display_order=1,
    )
    db_session.add(angle)
    db_session.flush()
    box = models.WarehouseBox(
        angle_id=angle.id,
        row_no=1,
        layer_no=1,
        jari_index=0,
        size=models.BoxSizeEnum.SMALL,
        stack_order=1,
    )
    first_zone = models.WarehouseSpecialZone(
        label="Z1",
        zone_type="aisle",
        display_order=1,
        is_active=True,
    )
    second_zone = models.WarehouseSpecialZone(
        label="Z2",
        zone_type="pallet",
        display_order=2,
        is_active=True,
    )
    db_session.add_all([box, first_zone, second_zone])
    db_session.flush()
    box_row = models.WarehouseBoxItem(
        box_id=box.box_id,
        item_id=item.item_id,
        quantity=4,
    )
    first_zone_row = models.WarehouseSpecialZoneItem(
        zone_id=first_zone.id,
        item_id=item.item_id,
        quantity=3,
    )
    second_zone_row = models.WarehouseSpecialZoneItem(
        zone_id=second_zone.id,
        item_id=item.item_id,
        quantity=2,
    )
    db_session.add_all([box_row, first_zone_row, second_zone_row])
    db_session.flush()

    _consume_warehouse(db_session, item.item_id, Decimal("8"))
    db_session.flush()

    inventory = (
        db_session.query(models.Inventory)
        .filter(models.Inventory.item_id == item.item_id)
        .one()
    )
    for row in (box_row, first_zone_row, second_zone_row, unplaced):
        db_session.refresh(row)
    assert int(inventory.warehouse_qty) == 4
    assert int(box_row.quantity) == 0
    assert int(first_zone_row.quantity) == 0
    assert int(second_zone_row.quantity) == 1
    assert int(unplaced.quantity) == 3


def test_box_placement_rejects_item_deleted_before_canonical_lock(
    db_session,
    make_item,
) -> None:
    item = make_item(warehouse_qty=Decimal("1"))
    _set_unplaced(db_session, item.item_id, 1)
    angle = models.WarehouseAngle(
        label="deleted-item-lock",
        rows=1,
        layers=1,
        jaris_per_cell=1,
        display_order=1,
    )
    db_session.add(angle)
    db_session.flush()
    box = models.WarehouseBox(
        angle_id=angle.id,
        row_no=1,
        layer_no=1,
        jari_index=0,
        size=models.BoxSizeEnum.SMALL,
        stack_order=1,
    )
    db_session.add(box)
    item.deleted_at = datetime(2026, 9, 1)
    db_session.flush()

    with pytest.raises(ValueError, match="삭제된 품목"):
        _replace_box_items(
            db_session,
            box.box_id,
            [SimpleNamespace(item_id=item.item_id, quantity=1)],
        )


def test_outbound_fails_before_mutation_when_physical_ledger_is_inconsistent(
    db_session,
    make_item,
) -> None:
    item = make_item(warehouse_qty=Decimal("5"))
    _set_unplaced(db_session, item.item_id, 4)
    db_session.commit()

    with pytest.raises(ValueError, match="물리 위치 원장 불일치"):
        _consume_warehouse(db_session, item.item_id, Decimal("1"))
    db_session.rollback()

    inventory = (
        db_session.query(models.Inventory)
        .filter(models.Inventory.item_id == item.item_id)
        .one()
    )
    unplaced = (
        db_session.query(models.WarehouseUnplacedItem)
        .filter(models.WarehouseUnplacedItem.item_id == item.item_id)
        .one()
    )
    assert int(inventory.warehouse_qty) == 5
    assert int(unplaced.quantity) == 4


def test_warehouse_defect_move_consumes_the_same_physical_priority(
    db_session,
    make_item,
) -> None:
    item = make_item(warehouse_qty=Decimal("5"))
    unplaced = _set_unplaced(db_session, item.item_id, 5)

    _mark_defective(
        db_session,
        item.item_id,
        Decimal("2"),
        DefectSource(
            kind="warehouse",
            target_dept=models.DepartmentEnum.ASSEMBLY,
        ),
    )
    db_session.flush()

    inventory = (
        db_session.query(models.Inventory)
        .filter(models.Inventory.item_id == item.item_id)
        .one()
    )
    defective = (
        db_session.query(models.InventoryLocation)
        .filter(
            models.InventoryLocation.item_id == item.item_id,
            models.InventoryLocation.department
            == models.DepartmentEnum.ASSEMBLY,
            models.InventoryLocation.status
            == models.LocationStatusEnum.DEFECTIVE,
        )
        .one()
    )
    db_session.refresh(unplaced)
    assert int(inventory.warehouse_qty) == 3
    assert int(defective.quantity) == 2
    assert int(unplaced.quantity) == 3


def test_reconcile_includes_w_only_item_and_additive_ledger_totals(
    db_session,
    make_item,
) -> None:
    item = make_item(warehouse_qty=Decimal("5"))
    unplaced = _set_unplaced(db_session, item.item_id, 5)

    result = reconcile_inventory(db_session)

    assert result["mismatch_count"] == 1
    assert result["ledger_mismatch_count"] == 0
    assert len(result["rows"]) == 1
    row = result["rows"][0]
    assert row["item_id"] == item.item_id
    assert row["box_total"] == 0
    assert row["zone_total"] == 0
    assert row["unplaced_total"] == 5
    assert row["ledger_total"] == 5
    assert row["ledger_diff"] == 0
    assert row["ledger_status"] == "ok"

    map_payload = build_map_payload(db_session)
    assert map_payload["unplaced_items"] == [
        {
            "row_id": unplaced.id,
            "item_id": item.item_id,
            "mes_code": item.mes_code,
            "item_name": item.item_name,
            "quantity": 5,
        }
    ]


def test_reconcile_fails_closed_when_inventory_and_unplaced_rows_are_missing(
    db_session,
    make_item,
) -> None:
    item = make_item(warehouse_qty=Decimal("0"))
    db_session.query(models.WarehouseUnplacedItem).filter_by(
        item_id=item.item_id
    ).delete()
    db_session.query(models.Inventory).filter_by(item_id=item.item_id).delete()
    db_session.flush()

    result = reconcile_inventory(db_session, item.item_id)

    assert result["ledger_mismatch_count"] == 1
    row = result["rows"][0]
    assert row["ledger_status"] == "invalid"
    assert row["inventory_present"] is False
    assert row["unplaced_present"] is False
    assert row["inactive_zone_total"] == 0
    assert row["ledger_issues"] == ["missing_inventory", "missing_unplaced"]


def test_reconcile_fails_closed_when_inactive_zone_keeps_stock(
    db_session,
    make_item,
) -> None:
    item = make_item(warehouse_qty=Decimal("5"))
    _set_unplaced(db_session, item.item_id, 5)
    zone = models.WarehouseSpecialZone(
        label="비활성 잔량",
        zone_type="aisle",
        is_active=False,
        display_order=999,
    )
    db_session.add(zone)
    db_session.flush()
    db_session.add(
        models.WarehouseSpecialZoneItem(
            zone_id=zone.id,
            item_id=item.item_id,
            quantity=1,
        )
    )
    db_session.flush()

    result = reconcile_inventory(db_session, item.item_id)

    assert result["ledger_mismatch_count"] == 1
    row = result["rows"][0]
    assert row["ledger_diff"] == 0
    assert row["ledger_status"] == "invalid"
    assert row["inactive_zone_total"] == 1
    assert row["ledger_issues"] == ["inactive_zone_stock"]


def test_new_business_operations_use_physical_effect_contract_v2(
    db_session,
) -> None:
    db_session.add(
        models.SystemSetting(
            setting_key=operation_svc.CUTOVER_SETTING_KEY,
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.flush()
    operation = operation_svc._create_business_operation(
        db_session,
        domain="inventory_io",
        action="receive",
        display_label="입고",
        actor_name="tester",
        actor_employee_id=None,
        effective_at=datetime(2026, 9, 1, 0, 0),
    )

    assert operation is not None
    assert int(operation.contract_version) == 2


def test_inventory_effect_v2_records_actual_b_z_u_row_ids_and_quantities(
    db_session,
    make_item,
) -> None:
    item = make_item(warehouse_qty=Decimal("6"))
    unplaced = _set_unplaced(db_session, item.item_id, 2)
    angle = models.WarehouseAngle(
        label="Effect angle",
        rows=1,
        layers=1,
        jaris_per_cell=1,
    )
    zone = models.WarehouseSpecialZone(
        label="Effect zone",
        zone_type="pallet",
        display_order=1,
        is_active=True,
    )
    db_session.add_all([angle, zone])
    db_session.flush()
    box = models.WarehouseBox(
        angle_id=angle.id,
        row_no=1,
        layer_no=1,
        jari_index=0,
        size=models.BoxSizeEnum.SMALL,
        stack_order=0,
    )
    db_session.add(box)
    db_session.flush()
    box_row = models.WarehouseBoxItem(
        box_id=box.box_id,
        item_id=item.item_id,
        quantity=2,
    )
    zone_row = models.WarehouseSpecialZoneItem(
        zone_id=zone.id,
        item_id=item.item_id,
        quantity=2,
    )
    db_session.add_all([box_row, zone_row])
    db_session.flush()

    before = inv_effect._snapshot_cells(db_session, item.item_id)
    _consume_warehouse(db_session, item.item_id, Decimal("5"))
    effect = inv_effect._capture_effect(db_session, item.item_id, before)

    inventory = (
        db_session.query(models.Inventory)
        .filter(models.Inventory.item_id == item.item_id)
        .one()
    )
    warehouse = next(entry for entry in effect if entry["scope"] == "warehouse")
    assert warehouse == {
        "scope": "warehouse",
        "row_id": str(inventory.inventory_id),
        "before_quantity": 6,
        "after_quantity": 1,
        "delta": -5,
    }
    physical = {
        entry["scope"]: entry
        for entry in effect
        if entry["scope"] != "warehouse"
    }
    assert physical["warehouse_box"] == {
        "scope": "warehouse_box",
        "row_id": str(box_row.id),
        "box_id": str(box.box_id),
        "before_quantity": 2,
        "after_quantity": 0,
        "delta": -2,
    }
    assert physical["warehouse_zone"] == {
        "scope": "warehouse_zone",
        "row_id": str(zone_row.id),
        "zone_id": zone.id,
        "before_quantity": 2,
        "after_quantity": 0,
        "delta": -2,
    }
    assert physical["warehouse_unplaced"] == {
        "scope": "warehouse_unplaced",
        "row_id": str(unplaced.id),
        "before_quantity": 2,
        "after_quantity": 1,
        "delta": -1,
    }


def test_effect_reverse_rejects_a_subsequently_used_physical_row_before_mutation(
    db_session,
    make_item,
) -> None:
    item = make_item(warehouse_qty=Decimal("4"))
    unplaced = _set_unplaced(db_session, item.item_id, 4)
    before = inv_effect._snapshot_cells(db_session, item.item_id)
    _consume_warehouse(db_session, item.item_id, Decimal("2"))
    effect = inv_effect._capture_effect(db_session, item.item_id, before)
    db_session.flush()

    # A later placement used the same U row while preserving B+Z+U=W.
    angle = models.WarehouseAngle(
        label="Later use",
        rows=1,
        layers=1,
        jaris_per_cell=1,
    )
    db_session.add(angle)
    db_session.flush()
    box = models.WarehouseBox(
        angle_id=angle.id,
        row_no=1,
        layer_no=1,
        jari_index=0,
        size=models.BoxSizeEnum.SMALL,
        stack_order=0,
    )
    db_session.add(box)
    db_session.flush()
    box_row = models.WarehouseBoxItem(
        box_id=box.box_id,
        item_id=item.item_id,
        quantity=1,
    )
    db_session.add(box_row)
    unplaced.quantity = 1
    db_session.flush()

    with pytest.raises(ValueError, match="이후 변경"):
        inv_effect._apply_effect_reverse(db_session, item.item_id, effect)

    inventory = (
        db_session.query(models.Inventory)
        .filter(models.Inventory.item_id == item.item_id)
        .one()
    )
    assert int(inventory.warehouse_qty) == 2
    assert int(box_row.quantity) == 1
    assert int(unplaced.quantity) == 1


def test_effect_reverse_rejects_recreated_inventory_row_with_same_quantity(
    db_session,
    make_item,
) -> None:
    item = make_item(warehouse_qty=Decimal("0"))
    before = inv_effect._snapshot_cells(db_session, item.item_id)
    _receive_confirmed(
        db_session,
        item.item_id,
        Decimal("2"),
        bucket="warehouse",
    )
    effect = inv_effect._capture_effect(db_session, item.item_id, before)
    original_inventory = (
        db_session.query(models.Inventory)
        .filter(models.Inventory.item_id == item.item_id)
        .one()
    )
    db_session.delete(original_inventory)
    db_session.flush()
    replacement = models.Inventory(
        item_id=item.item_id,
        quantity=Decimal("2"),
        warehouse_qty=Decimal("2"),
        pending_quantity=Decimal("0"),
    )
    db_session.add(replacement)
    db_session.flush()

    with pytest.raises(ValueError, match="이후 변경"):
        inv_effect._apply_effect_reverse(db_session, item.item_id, effect)

    assert int(replacement.warehouse_qty) == 2
    unplaced = (
        db_session.query(models.WarehouseUnplacedItem)
        .filter(models.WarehouseUnplacedItem.item_id == item.item_id)
        .one()
    )
    assert int(unplaced.quantity) == 2
