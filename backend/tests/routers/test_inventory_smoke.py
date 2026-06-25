"""Legacy direct inventory write route removal tests."""

from __future__ import annotations

from decimal import Decimal

from app.models import DepartmentEnum, Inventory, InventoryLocation, LocationStatusEnum
from app.services import integrity as integrity_svc


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


def test_legacy_direct_inventory_write_routes_are_removed(client, db_session, make_item):
    item = make_item(name="legacy-route-removed", warehouse_qty=Decimal("5"))
    db_session.commit()

    cases = [
        ("/api/inventory/receive", {"item_id": str(item.item_id), "quantity": "1"}),
        ("/api/inventory/adjust", {"item_id": str(item.item_id), "quantity": "1", "reason": "legacy"}),
        (
            "/api/inventory/transfer-to-production",
            {"item_id": str(item.item_id), "quantity": "1", "department": DepartmentEnum.ASSEMBLY.value},
        ),
        (
            "/api/inventory/transfer-to-warehouse",
            {"item_id": str(item.item_id), "quantity": "1", "department": DepartmentEnum.ASSEMBLY.value},
        ),
        (
            "/api/inventory/transfer-between-depts",
            {
                "item_id": str(item.item_id),
                "quantity": "1",
                "from_department": DepartmentEnum.ASSEMBLY.value,
                "to_department": DepartmentEnum.SHIPPING.value,
            },
        ),
        (
            "/api/inventory/mark-defective",
            {
                "item_id": str(item.item_id),
                "quantity": "1",
                "source": "warehouse",
                "target_department": DepartmentEnum.ASSEMBLY.value,
            },
        ),
        (
            "/api/inventory/return-to-supplier",
            {
                "item_id": str(item.item_id),
                "quantity": "1",
                "from_department": DepartmentEnum.ASSEMBLY.value,
            },
        ),
    ]

    for path, payload in cases:
        res = client.post(path, json=payload)
        assert res.status_code == 404, path

    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.warehouse_qty == Decimal("5")
    assert _location_qty(db_session, item.item_id, DepartmentEnum.ASSEMBLY) == Decimal("0")
    assert integrity_svc.check_inventory_consistency(db_session) == []
