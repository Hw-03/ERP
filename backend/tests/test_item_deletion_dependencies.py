"""Approved deletion blockers must be complete and leave all linked facts intact."""
from collections.abc import Callable
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    AdminAuditLog, BOM, DefectQuarantineRecord, Inventory, InventoryLocation, Item,
    LocationStatusEnum, ShippingRequest, StockRequest, StockRequestLine,
    StockRequestStatusEnum, StockRequestTypeEnum, TransactionLog, TransactionTypeEnum,
)
from tests.test_admin_delta_closure import employee

ADMIN = {"X-Admin-Pin": "0000"}
KINDS = ["warehouse_inventory", "normal_inventory", "defective_inventory", "warehouse_reservation",
         "location_reservation", "bom_parent", "bom_child", "stock_request", "shipping", "quarantine_record", "transaction"]


def _seed_dependency(db: Session, item: Item, kind: str, make_item: Callable[..., Item],
                     make_location: Callable[..., InventoryLocation], make_bom: Callable[..., BOM]) -> None:
    """Seed one real dependency, independent of stock so each blocker is established."""
    inventory = db.query(Inventory).filter_by(item_id=item.item_id).one()
    if kind == "warehouse_inventory":
        inventory.quantity = inventory.warehouse_qty = Decimal("4")
    elif kind == "warehouse_reservation":
        inventory.quantity = inventory.warehouse_qty = inventory.pending_quantity = Decimal("4")
    elif kind in {"normal_inventory", "defective_inventory", "location_reservation"}:
        location = make_location(item.item_id, quantity=Decimal("3"),
                                 department="튜브" if kind == "location_reservation" else "조립",
                                 status=LocationStatusEnum.DEFECTIVE if kind == "defective_inventory" else LocationStatusEnum.PRODUCTION)
        if kind == "location_reservation":
            location.pending_quantity = Decimal("2")
    elif kind.startswith("bom_"):
        other = make_item(name="linked BOM item")
        make_bom(item.item_id if kind == "bom_parent" else other.item_id,
                 other.item_id if kind == "bom_parent" else item.item_id, Decimal("1"))
    elif kind == "stock_request":
        actor = employee(db, "DELETE-REQUEST")
        request = StockRequest(requester_employee_id=actor.employee_id, requester_name=actor.name,
                               requester_department=actor.department, request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
                               status=StockRequestStatusEnum.RESERVED)
        db.add(request)
        db.flush()
        db.add(StockRequestLine(request_id=request.request_id, item_id=item.item_id, quantity=1,
                                item_name_snapshot=item.item_name, mes_code_snapshot=item.mes_code,
                                from_bucket="warehouse", to_bucket="production", to_department="튜브"))
    elif kind == "shipping":
        db.add(ShippingRequest(base_pf_item_id=item.item_id))
    elif kind == "quarantine_record":
        db.add(DefectQuarantineRecord(item_id=item.item_id, department="튜브", original_quantity=1, remaining_quantity=0))
    elif kind == "transaction":
        db.add(TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE, quantity_change=1))
    else:
        raise AssertionError(kind)
    db.flush()


@pytest.mark.parametrize("kind", [*KINDS, "combined"])
def test_item_soft_delete_reports_every_dependency_without_mutating_any_linked_table(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], make_bom: Callable[..., BOM], kind: str,
) -> None:
    """Each blocker works alone; the combined response returns all reasons in one pass."""
    item = make_item(warehouse_qty=Decimal("0"))
    kinds = KINDS if kind == "combined" else [kind]
    for dependency in kinds:
        _seed_dependency(db_session, item, dependency, make_item, make_location, make_bom)
    db_session.commit()
    tables = [model.__table__ for model in (Item, Inventory, InventoryLocation, BOM, StockRequest,
                                            StockRequestLine, ShippingRequest, DefectQuarantineRecord, TransactionLog, AdminAuditLog)]
    before = {table.name: [tuple(row) for row in db_session.execute(table.select()).all()] for table in tables}
    result = client.patch(f"/api/items/{item.item_id}/soft-delete", headers=ADMIN)
    assert result.status_code == 409, result.text
    actual = {entry["kind"] for entry in result.json()["detail"]["extra"]["dependencies"]}
    assert set(kinds) <= actual
    assert all(entry["count"] > 0 for entry in result.json()["detail"]["extra"]["dependencies"])
    inspected = client.get(f"/api/items/{item.item_id}/deletion-dependencies", headers=ADMIN)
    assert inspected.status_code == 200, inspected.text
    assert inspected.json()["dependencies"] == result.json()["detail"]["extra"]["dependencies"]
    assert inspected.json()["can_delete"] is False
    db_session.expire_all()
    assert {table.name: [tuple(row) for row in db_session.execute(table.select()).all()] for table in tables} == before


def test_unused_zero_stock_item_remains_deletable_and_restorable_without_moving_stock(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
) -> None:
    """A zero inventory row is not a dependency; existing deleted-item recovery stays available."""
    item = make_item(warehouse_qty=Decimal("0"))
    inspected = client.get(f"/api/items/{item.item_id}/deletion-dependencies", headers=ADMIN)
    assert inspected.status_code == 200, inspected.text
    assert inspected.json() == {"item_id": str(item.item_id), "can_delete": True, "dependencies": []}
    assert client.patch(f"/api/items/{item.item_id}/soft-delete", headers=ADMIN).status_code == 200
    restored = client.patch(f"/api/items/{item.item_id}/restore", headers=ADMIN)
    assert restored.status_code == 200, restored.text
    assert restored.json()["deleted_at"] is None
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert (inventory.quantity, inventory.warehouse_qty, inventory.pending_quantity) == (0, 0, 0)
