"""Inventory API smoke tests for core warehouse and department flows."""

from __future__ import annotations

from decimal import Decimal

from app.models import (
    DepartmentEnum,
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    TransactionLog,
)
from app.services import integrity as integrity_svc


def _dec(value) -> Decimal:
    return Decimal(str(value))


def _location_qty(db_session, item_id, department: DepartmentEnum) -> Decimal:
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == department,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    return loc.quantity if loc else Decimal("0")


def test_inventory_receive_transfer_ship_smoke(client, db_session, make_item):
    item = make_item(name="스모크 재고", warehouse_qty=Decimal("0"))
    db_session.commit()

    receive = client.post(
        "/api/inventory/receive",
        json={
            "item_id": str(item.item_id),
            "quantity": "20",
            "reference_no": "SMOKE-RCV",
            "produced_by": "smoke",
        },
    )
    assert receive.status_code == 201, receive.text
    assert _dec(receive.json()["quantity"]) == Decimal("20")
    assert _dec(receive.json()["warehouse_qty"]) == Decimal("20")

    to_assembly = client.post(
        "/api/inventory/transfer-to-production",
        json={
            "item_id": str(item.item_id),
            "quantity": "8",
            "department": DepartmentEnum.ASSEMBLY.value,
            "notes": "smoke warehouse to assembly",
            "reference_no": "SMOKE-ASM",
        },
    )
    assert to_assembly.status_code == 200, to_assembly.text
    assert _dec(to_assembly.json()["quantity"]) == Decimal("20")
    assert _dec(to_assembly.json()["warehouse_qty"]) == Decimal("12")

    to_shipping = client.post(
        "/api/inventory/transfer-between-depts",
        json={
            "item_id": str(item.item_id),
            "quantity": "5",
            "from_department": DepartmentEnum.ASSEMBLY.value,
            "to_department": DepartmentEnum.SHIPPING.value,
            "notes": "smoke assembly to shipping",
            "reference_no": "SMOKE-SHIP-LOC",
        },
    )
    assert to_shipping.status_code == 200, to_shipping.text
    assert _dec(to_shipping.json()["quantity"]) == Decimal("20")
    assert _location_qty(db_session, item.item_id, DepartmentEnum.ASSEMBLY) == Decimal("3")
    assert _location_qty(db_session, item.item_id, DepartmentEnum.SHIPPING) == Decimal("5")

    ship = client.post(
        "/api/inventory/ship",
        json={
            "item_id": str(item.item_id),
            "quantity": "3",
            "reference_no": "SMOKE-SHIP",
            "produced_by": "smoke",
        },
    )
    assert ship.status_code == 200, ship.text
    assert _dec(ship.json()["quantity"]) == Decimal("17")
    assert _dec(ship.json()["warehouse_qty"]) == Decimal("12")
    assert _location_qty(db_session, item.item_id, DepartmentEnum.SHIPPING) == Decimal("2")

    assert db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).count() == 4
    assert integrity_svc.check_inventory_consistency(db_session) == []


def test_inventory_shortage_rolls_back_transfer_and_ship(client, db_session, make_item):
    item = make_item(name="스모크 부족", warehouse_qty=Decimal("5"))
    db_session.commit()

    too_much_transfer = client.post(
        "/api/inventory/transfer-to-production",
        json={
            "item_id": str(item.item_id),
            "quantity": "8",
            "department": DepartmentEnum.ASSEMBLY.value,
            "notes": "shortage should rollback",
        },
    )
    assert too_much_transfer.status_code == 422
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.warehouse_qty == Decimal("5")
    assert _location_qty(db_session, item.item_id, DepartmentEnum.ASSEMBLY) == Decimal("0")

    move_to_shipping = client.post(
        "/api/inventory/transfer-to-production",
        json={
            "item_id": str(item.item_id),
            "quantity": "2",
            "department": DepartmentEnum.SHIPPING.value,
            "notes": "seed shipping stock",
        },
    )
    assert move_to_shipping.status_code == 200, move_to_shipping.text

    too_much_ship = client.post(
        "/api/inventory/ship",
        json={
            "item_id": str(item.item_id),
            "quantity": "3",
            "reference_no": "SMOKE-SHORT-SHIP",
        },
    )
    assert too_much_ship.status_code == 422
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.quantity == Decimal("5")
    assert inv.warehouse_qty == Decimal("3")
    assert _location_qty(db_session, item.item_id, DepartmentEnum.SHIPPING) == Decimal("2")
    assert integrity_svc.check_inventory_consistency(db_session) == []
