"""수동 QA 재고 도구도 W/B/Z/U 물리 원장을 깨뜨리지 않아야 한다."""

from __future__ import annotations

from decimal import Decimal

from app.models import (
    BoxSizeEnum,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
    WarehouseSpecialZone,
    WarehouseSpecialZoneItem,
    WarehouseUnplacedItem,
)
from scripts import rebalance_test_stock, reset_test_stock


def _place_stock(db_session, item, *, box_quantity: int, zone_quantity: int) -> None:
    angle = WarehouseAngle(label="QA", rows=1, layers=1, jaris_per_cell=1)
    zone = WarehouseSpecialZone(
        label="QA-Z",
        zone_type="pallet",
        display_order=1,
        is_active=True,
    )
    db_session.add_all([angle, zone])
    db_session.flush()
    box = WarehouseBox(
        angle_id=angle.id,
        row_no=1,
        layer_no=1,
        jari_index=0,
        size=BoxSizeEnum.SMALL,
    )
    db_session.add(box)
    db_session.flush()
    db_session.add_all(
        [
            WarehouseBoxItem(
                box_id=box.box_id,
                item_id=item.item_id,
                quantity=box_quantity,
            ),
            WarehouseSpecialZoneItem(
                zone_id=zone.id,
                item_id=item.item_id,
                quantity=zone_quantity,
            ),
        ]
    )
    unplaced = db_session.query(WarehouseUnplacedItem).filter_by(
        item_id=item.item_id
    ).one()
    unplaced.quantity = int(item.inventory.warehouse_qty) - box_quantity - zone_quantity
    db_session.flush()


def test_reset_helper_clears_placements_and_recreates_zero_u(
    db_session,
    make_item,
) -> None:
    item = make_item(name="QA reset", warehouse_qty=Decimal("7"))
    _place_stock(db_session, item, box_quantity=2, zone_quantity=1)

    reset_test_stock._reset_physical_warehouse(db_session)

    db_session.refresh(item.inventory)
    unplaced = db_session.query(WarehouseUnplacedItem).filter_by(
        item_id=item.item_id
    ).one()
    assert item.inventory.warehouse_qty == 0
    assert unplaced.quantity == 0
    assert db_session.query(WarehouseBoxItem).count() == 0
    assert db_session.query(WarehouseSpecialZoneItem).count() == 0


def test_rebalance_helper_zeroes_w_through_physical_ledger(
    db_session,
    make_item,
) -> None:
    item = make_item(name="QA rebalance", warehouse_qty=Decimal("5"))
    _place_stock(db_session, item, box_quantity=2, zone_quantity=0)

    rebalance_test_stock._clear_warehouse_stock(db_session, item.inventory)

    db_session.refresh(item.inventory)
    unplaced = db_session.query(WarehouseUnplacedItem).filter_by(
        item_id=item.item_id
    ).one()
    assert item.inventory.warehouse_qty == 0
    assert unplaced.quantity == 0
    assert db_session.query(WarehouseBoxItem).one().quantity == 0
    assert db_session.query(WarehouseSpecialZoneItem).one().quantity == 0
