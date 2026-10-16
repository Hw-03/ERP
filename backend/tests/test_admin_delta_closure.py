"""Approved administrator and IO delta contracts, using isolated pytest data."""
from decimal import Decimal
from datetime import datetime
import uuid

import pytest

from app.models import (
    AdminAuditLog, BOM, DefectQuarantineRecord, Department, Employee, EmployeeItemOrder, Inventory,
    InventoryLocation, InventoryOperation, Item, LocationStatusEnum, ProductSymbol,
    StockRequest, StockRequestLine, StockRequestStatusEnum, StockRequestTypeEnum,
    TransactionLog, TransactionTypeEnum,
)
from app.services.pin_auth import hash_pin


def employee(db, code: str, *, active: bool = True) -> Employee:
    """Create an isolated tab actor with no implicit approval role."""
    row = Employee(employee_code=code, name=code, role="staff", department="기타",
                   is_active=active, pin_hash=hash_pin("2468"))
    db.add(row)
    db.flush()
    return row


@pytest.mark.parametrize("action", ["save", "reset"])
@pytest.mark.parametrize("actor_state", ["other", "missing", "unknown", "inactive", "own"])
def test_personal_item_order_checks_actor_and_preserves_other_orders(
    client, db_session, make_item, action: str, actor_state: str,
) -> None:
    owner = employee(db_session, "ORDER-OWNER")
    other = employee(db_session, "ORDER-OTHER", active=actor_state != "inactive")
    first = make_item(name="original-order")
    second = make_item(name="replacement-order")
    db_session.add_all([
        EmployeeItemOrder(employee_id=owner.employee_id, item_id=first.item_id, display_order=0),
        EmployeeItemOrder(employee_id=other.employee_id, item_id=second.item_id, display_order=0),
    ])
    db_session.commit()

    def orders() -> set:
        return {(r.employee_id, r.item_id, r.display_order) for r in db_session.query(EmployeeItemOrder)}

    before = orders()
    code = owner.employee_code if actor_state == "own" else "UNKNOWN" if actor_state == "unknown" else other.employee_code
    headers = {} if actor_state == "missing" else {"X-MES-Employee-Code": code}
    if action == "save":
        response = client.put("/api/items/my-order", headers=headers, json={
            "employee_id": str(owner.employee_id),
            "items": [{"item_id": str(second.item_id), "display_order": 3}],
        })
    else:
        response = client.delete("/api/items/my-order", headers=headers,
                                 params={"employee_id": str(owner.employee_id)})
    assert response.status_code == (200 if actor_state == "own" else 400 if actor_state == "missing" else 403), response.text
    db_session.expire_all()
    after = orders()
    assert {r for r in after if r[0] == other.employee_id} == {r for r in before if r[0] == other.employee_id}
    if actor_state != "own":
        assert after == before
    else:
        assert {r for r in after if r[0] == owner.employee_id} == (
            {(owner.employee_id, second.item_id, 3)} if action == "save" else set()
        )


@pytest.mark.parametrize("dependency", ["employee", "normal_inventory", "defective_inventory", "reservation", "pending_request", "bom", "transaction", "combined"])
def test_department_deletion_reports_every_dependency_and_changes_nothing(
    client, db_session, make_item, make_bom, dependency: str,
) -> None:
    department = Department(name="튜브", is_active=True)
    db_session.add(department)
    outside = employee(db_session, "DEPT-OUTSIDE")
    item = make_item(name="department-dependency", process_type_code="TR")
    expected = set()
    if dependency in {"employee", "combined"}:
        employee(db_session, "DEPT-MEMBER").department = department.name
        expected.add("employee")
    if dependency in {"normal_inventory", "reservation", "combined"}:
        db_session.add(InventoryLocation(item_id=item.item_id, department=department.name,
            status=LocationStatusEnum.PRODUCTION, quantity=4,
            pending_quantity=1 if dependency in {"reservation", "combined"} else 0))
        expected.add("normal_inventory")
        if dependency in {"reservation", "combined"}:
            expected.add("reservation")
    if dependency in {"defective_inventory", "combined"}:
        db_session.add(InventoryLocation(item_id=item.item_id, department=department.name,
            status=LocationStatusEnum.DEFECTIVE, quantity=2))
        expected.add("defective_inventory")
    if dependency in {"pending_request", "combined"}:
        request = StockRequest(requester_employee_id=outside.employee_id, requester_name=outside.name,
            requester_department=outside.department, approval_department="AS",
            request_type=StockRequestTypeEnum.INTERNAL_USE, status=StockRequestStatusEnum.RESERVED)
        db_session.add(request)
        db_session.flush()
        db_session.add(StockRequestLine(request_id=request.request_id, item_id=item.item_id,
            item_name_snapshot=item.item_name, mes_code_snapshot=item.mes_code,
            quantity=1, from_bucket="production", from_department=department.name, to_bucket="none"))
        expected.add("pending_request")
    if dependency in {"bom", "combined"}:
        parent = make_item(name="other-parent", process_type_code="HR")
        make_bom(parent.item_id, item.item_id, 1)
        expected.add("bom")
    if dependency in {"transaction", "combined"}:
        db_session.add(TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.ADJUST,
            department=department.name, quantity_change=1))
        expected.add("transaction")
    db_session.commit()

    def snapshot() -> dict:
        return {table.name: [tuple(row) for row in db_session.execute(table.select()).all()]
                for table in (Department.__table__, Employee.__table__, InventoryLocation.__table__,
                              StockRequest.__table__, StockRequestLine.__table__, BOM.__table__, TransactionLog.__table__)}

    before = snapshot()
    response = client.delete(f"/api/departments/{department.id}", headers={"X-Admin-Pin": "0000"})
    assert response.status_code == 409, response.text
    assert {entry["kind"] for entry in response.json()["detail"]["extra"]["dependencies"]} == expected
    db_session.expire_all()
    assert snapshot() == before


def test_department_without_dependencies_is_still_deletable(client, db_session) -> None:
    department = Department(name="empty-disposable")
    db_session.add(department)
    db_session.commit()
    response = client.delete(f"/api/departments/{department.id}", headers={"X-Admin-Pin": "0000"})
    assert response.status_code == 204, response.text
    assert db_session.get(Department, department.id) is None


@pytest.mark.parametrize("dependency", ["effect_history", "quarantine_history", "warehouse_inventory", "warehouse_reservation"])
def test_department_delete_checks_location_history_and_warehouse_storage(
    client, db_session, make_item, dependency: str,
) -> None:
    department = Department(name="창고" if dependency.startswith("warehouse") else "location-history")
    db_session.add(department)
    item = make_item(warehouse_qty=Decimal("3") if dependency.startswith("warehouse") else Decimal("0"),
                     pending=Decimal("1") if dependency == "warehouse_reservation" else Decimal("0"))
    expected = "transaction" if dependency == "effect_history" else "quarantine_record" if dependency == "quarantine_history" else dependency
    if dependency == "effect_history":
        db_session.add(TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.ADJUST,
            department="different-aggregate", quantity_change=1,
            inventory_effect=[{"bucket": "production", "department": department.name, "delta": 1}]))
    elif dependency == "quarantine_history":
        db_session.add(DefectQuarantineRecord(item_id=item.item_id, department=department.name,
                                             original_quantity=1, remaining_quantity=0))
    db_session.commit()
    before = {table.name: [tuple(row) for row in db_session.execute(table.select()).all()]
              for table in (Department.__table__, Inventory.__table__, DefectQuarantineRecord.__table__, TransactionLog.__table__)}
    response = client.delete(f"/api/departments/{department.id}", headers={"X-Admin-Pin": "0000"})
    assert response.status_code == 409, response.text
    reasons = response.json()["detail"]["extra"]["dependencies"]
    assert {row["kind"] for row in reasons} == ({"warehouse_inventory", "warehouse_reservation"}
                                               if dependency == "warehouse_reservation" else {expected})
    assert all(row["count"] == 1 for row in reasons)
    db_session.expire_all()
    assert {table.name: [tuple(row) for row in db_session.execute(table.select()).all()]
            for table in (Department.__table__, Inventory.__table__, DefectQuarantineRecord.__table__, TransactionLog.__table__)} == before


def test_personal_order_saves_only_live_items(client, db_session, make_item) -> None:
    owner = employee(db_session, "ORDER-LIVE-ITEMS")
    live = make_item(name="live-order-item")
    deleted = make_item(name="deleted-order-item")
    deleted.deleted_at = datetime.utcnow()
    db_session.commit()
    response = client.put("/api/items/my-order", headers={"X-MES-Employee-Code": owner.employee_code}, json={
        "employee_id": str(owner.employee_id), "items": [
            {"item_id": str(deleted.item_id), "display_order": 0},
            {"item_id": str(live.item_id), "display_order": 1},
        ],
    })
    assert response.status_code == 200, response.text
    db_session.expire_all()
    assert [(row.item_id, row.display_order) for row in db_session.query(EmployeeItemOrder)] == [(live.item_id, 1)]
    assert db_session.get(Item, deleted.item_id).deleted_at is not None


def test_employee_pin_reset_invalidates_old_pin_and_audits_only_target(client, db_session) -> None:
    owner = employee(db_session, "PIN-TARGET")
    other = employee(db_session, "PIN-OTHER")
    actor = employee(db_session, "PIN-ADMIN")
    db_session.commit()
    before = other.pin_hash
    client.post(f"/api/employees/{actor.employee_id}/verify-pin", json={"pin": "2468"})
    response = client.post(f"/api/employees/{owner.employee_id}/reset-pin", headers={"X-Admin-Pin": "0000", "X-MES-Employee-Code": actor.employee_code}, json={"pin": "0000"})
    assert response.status_code == 204
    assert client.post(f"/api/employees/{owner.employee_id}/verify-pin", json={"pin": "2468"}).status_code == 403
    assert client.post(f"/api/employees/{owner.employee_id}/verify-pin", json={"pin": "0000"}).status_code == 200
    db_session.expire_all()
    assert other.pin_hash == before
    audit = db_session.query(AdminAuditLog).filter_by(action="employee.reset_pin").one()
    assert audit.target_id == str(owner.employee_id)
    assert audit.actor_employee_code == actor.employee_code
    assert audit.created_at is not None and owner.pin_last_changed is not None


def test_item_create_and_update_audits_use_current_tab_actor_with_pin_only_compatibility(
    client, db_session, make_item,
) -> None:
    """Normal staff + valid admin PIN keeps audit attribution without a new role gate."""
    from app.utils.mes_code import refresh_symbol_cache
    actor = employee(db_session, "MASTER-ACTOR")
    unrelated = make_item(name="unchanged-master", warehouse_qty=Decimal("7"))
    db_session.add(ProductSymbol(slot=1, symbol="Q", model_name="closure-model", is_reserved=False))
    db_session.commit()
    refresh_symbol_cache(db_session)
    assert client.post(f"/api/employees/{actor.employee_id}/verify-pin", json={"pin": "2468"}).status_code == 200
    headers = {"X-Admin-Pin": "0000", "X-MES-Employee-Code": actor.employee_code}
    created = client.post("/api/items", headers=headers, json={
        "item_name": "tab-owned-audit", "process_type_code": "TR", "model_slots": [1], "initial_quantity": 2,
    })
    assert created.status_code == 201, created.text
    item_id = uuid.UUID(created.json()["item_id"])
    updated = client.put(f"/api/items/{item_id}", headers=headers, json={"item_name": "tab-owned-updated"})
    assert updated.status_code == 200, updated.text
    db_session.expire_all()
    assert {(row.action, row.actor_employee_code, row.target_id) for row in db_session.query(AdminAuditLog)} == {
        ("item.create", actor.employee_code, str(item_id)), ("item.update", actor.employee_code, str(item_id))}
    assert db_session.query(InventoryOperation).one().actor_employee_id == actor.employee_id
    assert db_session.query(TransactionLog).one().producer_employee_id == actor.employee_id
    assert db_session.get(Item, unrelated.item_id).item_name == "unchanged-master"
    assert db_session.query(Inventory).filter_by(item_id=unrelated.item_id).one().warehouse_qty == Decimal("7")
    assert db_session.query(Inventory).filter_by(item_id=item_id).one().warehouse_qty == Decimal("2")


@pytest.mark.parametrize("action", ["create", "update"])
def test_item_initial_creation_and_update_rollback_after_late_audit_failure(
    client, db_session, make_item, monkeypatch, action: str,
) -> None:
    from app.routers import items
    from app import database
    from app.main import app
    from fastapi import Request
    from app.utils.mes_code import refresh_symbol_cache
    db_session.add(ProductSymbol(slot=1, symbol="Q", model_name="closure-model", is_reserved=False))
    original = make_item(name="unrelated-original", warehouse_qty=Decimal("7"))
    db_session.commit()
    refresh_symbol_cache(db_session)
    tables = (Item.__table__, Inventory.__table__, InventoryLocation.__table__,
              InventoryOperation.__table__, TransactionLog.__table__, AdminAuditLog.__table__)

    def snapshot() -> dict:
        return {table.name: [tuple(row) for row in db_session.execute(table.select()).all()] for table in tables}

    before = snapshot()
    def fail_audit(db, **kwargs) -> None:
        db.add(AdminAuditLog(action=kwargs["action"], target_type="item", target_id=kwargs["target_id"]))
        db.flush()
        assert snapshot() != before
        raise RuntimeError("late item audit failure")

    monkeypatch.setattr(items.audit, "record", fail_audit)
    original_id = original.item_id
    previous_override = app.dependency_overrides[database.get_db]
    monkeypatch.setattr(database, "SessionLocal", lambda: db_session)
    def production_boundary(request: Request):
        yield from database.get_db(request)
    app.dependency_overrides[database.get_db] = production_boundary
    try:
        with pytest.raises(RuntimeError, match="late item audit failure"):
            if action == "create":
                client.post("/api/items", headers={"X-Admin-Pin": "0000"}, json={
                    "item_name": "must-not-remain", "process_type_code": "TR", "model_slots": [1],
                    "initial_quantity": 12, "initial_locations": [{"department": "튜브", "quantity": 4}],
                })
            else:
                client.put(f"/api/items/{original_id}", headers={"X-Admin-Pin": "0000"}, json={"item_name": "must-not-change", "sales_review_required": True})
    finally:
        app.dependency_overrides[database.get_db] = previous_override
    db_session.expire_all()
    assert snapshot() == before
