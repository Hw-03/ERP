"""Exact admin source conditions absent from the earlier partial bindings."""
from collections.abc import Callable
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    AdminAuditLog, Department, Employee, Inventory, InventoryLocation, Item,
    ProductSymbol, StockRequest, SystemSetting, TransactionLog, TransactionTypeEnum,
)
from app.utils.mes_code import refresh_symbol_cache
from tests.test_admin_delta_closure import employee
from tests.test_io_expectation_closure import _cells

ADMIN = {"X-Admin-Pin": "0000"}


@pytest.mark.parametrize("method", ["post", "put"])
@pytest.mark.parametrize("field,value", [("model_name", ""), ("symbol", ""), ("symbol", "ABCDEF")])
def test_invalid_model_fields_preserve_models_items_and_inventory(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    method: str, field: str, value: str,
) -> None:
    """Empty/long invalid model fields cannot change a reserved or linked model."""
    db_session.add_all([ProductSymbol(slot=1, symbol="Q", model_name="original", is_reserved=False),
                        ProductSymbol(slot=2, symbol=None, model_name=None, is_reserved=True)])
    item = make_item(model_symbol="Q", warehouse_qty=Decimal("7"))
    db_session.commit()
    refresh_symbol_cache(db_session)
    tables = [model.__table__ for model in (ProductSymbol, Item, Inventory, InventoryLocation)]
    before = {table.name: [tuple(row) for row in db_session.execute(table.select()).all()] for table in tables}
    payload = {"model_name": "candidate", "symbol": "R", field: value}
    if method == "put":
        payload["pin"] = "0000"
    response = getattr(client, method)("/api/models" + ("/1" if method == "put" else ""), headers=ADMIN, json=payload)
    assert response.status_code == 422, response.text
    db_session.expire_all()
    assert {table.name: [tuple(row) for row in db_session.execute(table.select()).all()] for table in tables} == before
    assert client.get(f"/api/items/{item.item_id}").json()["model_slots"] == [1]


def test_model_name_change_preserves_codes_inventory_and_transaction_identifiers(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
) -> None:
    """A linked model display rename must retain the existing code and history links."""
    db_session.add(ProductSymbol(slot=1, symbol="Q", model_name="original", is_reserved=False))
    item = make_item(model_symbol="Q", warehouse_qty=Decimal("7"))
    log = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE, quantity_change=1)
    db_session.add(log)
    db_session.commit()
    refresh_symbol_cache(db_session)
    original = client.get(f"/api/items/{item.item_id}").json()
    before = _cells(db_session)
    response = client.put("/api/models/1", headers=ADMIN, json={"model_name": "renamed", "pin": "0000"})
    assert response.status_code == 200, response.text
    assert response.json()["model_name"] == "renamed"
    current = client.get(f"/api/items/{item.item_id}").json()
    assert current["mes_code"] == original["mes_code"]
    assert current["model_slots"] == original["model_slots"] == [1]
    assert _cells(db_session) == before
    assert [(row.log_id, row.item_id) for row in db_session.query(TransactionLog)] == [(log.log_id, item.item_id)]


def test_item_pagination_returns_every_database_item_once_in_database_order(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
) -> None:
    """Page boundaries must not omit or duplicate the first or last item."""
    items = [make_item(name=f"pagination-{index}", serial_no=index + 1) for index in range(13)]
    db_session.commit()
    expected = [str(item.item_id) for item in sorted(items, key=lambda item: (item.sort_order, item.mes_code))]
    collected = []
    for offset in range(0, len(expected), 4):
        response = client.get("/api/items", params={"skip": offset, "limit": 4})
        assert response.status_code == 200, response.text
        collected.extend(row["item_id"] for row in response.json())
    assert collected == expected
    assert len(collected) == len(set(collected)) == len(items)
    assert client.get("/api/items", params={"skip": len(items), "limit": 4}).json() == []


def test_employee_master_name_department_and_assigned_model_order_reappear_on_login(
    client: TestClient, db_session: Session,
) -> None:
    """Login uses the current active employee values and saved assignment order."""
    actor = employee(db_session, "CURRENT-MASTER")
    db_session.add_all([ProductSymbol(slot=slot, symbol=str(slot), model_name=f"model-{slot}", is_reserved=False)
                        for slot in [1, 2, 3]])
    db_session.commit()
    changed = client.put(f"/api/employees/{actor.employee_id}", headers=ADMIN, json={
        "name": "current name", "department": "튜브", "assigned_model_slots": [3, 1, 2],
    })
    assert changed.status_code == 200, changed.text
    logged_in = client.post(f"/api/employees/{actor.employee_id}/verify-pin", json={"pin": "2468"})
    assert logged_in.status_code == 200, logged_in.text
    assert (logged_in.json()["name"], logged_in.json()["department"], logged_in.json()["assigned_model_slots"]) == (
        "current name", "튜브", [3, 1, 2],
    )
    listed = next(row for row in client.get("/api/employees").json() if row["employee_id"] == str(actor.employee_id))
    assert (listed["name"], listed["department"], listed["assigned_model_slots"]) == ("current name", "튜브", [3, 1, 2])


def test_department_status_color_and_filtered_population_use_the_same_id(
    client: TestClient, db_session: Session,
) -> None:
    """Status/color updates and independent list queries retain the same department ID."""
    departments = [Department(name=name, is_active=True) for name in ["department one", "department two", "department three"]]
    db_session.add_all(departments)
    db_session.commit()
    selected = departments[1]
    response = client.put(f"/api/departments/{selected.id}", headers=ADMIN, json={
        "pin": "0000", "is_active": False, "color_hex": "#123abc",
    })
    assert response.status_code == 200, response.text
    assert (response.json()["id"], response.json()["is_active"], response.json()["color_hex"]) == (selected.id, False, "#123abc")
    all_rows = client.get("/api/departments").json()
    active = client.get("/api/departments", params={"is_active": True}).json()
    inactive = client.get("/api/departments", params={"is_active": False}).json()
    assert {row["id"] for row in all_rows} == {department.id for department in departments}
    assert {row["id"] for row in active} == {department.id for department in departments if department.id != selected.id}
    assert [(row["id"], row["color_hex"]) for row in inactive] == [(selected.id, "#123abc")]


def test_procurement_update_reread_preserves_all_stock_and_other_item_fields(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation],
) -> None:
    """Procurement edits are metadata-only and survive a separate read."""
    selected = make_item(warehouse_qty=Decimal("7"))
    other = make_item(name="other master", warehouse_qty=Decimal("9"))
    make_location(selected.item_id, quantity=Decimal("4"))
    before = _cells(db_session)
    other_before = client.get(f"/api/items/{other.item_id}").json()
    values = {"supplier": "supplier", "min_stock": 2, "supplier_item_code": "CODE",
              "standard_purchase_price": "125.75", "procurement_lead_time_days": 3,
              "minimum_order_quantity": 4, "reorder_point": 6, "purchase_memo": "saved memo"}
    response = client.put(f"/api/items/{selected.item_id}", headers=ADMIN, json=values)
    assert response.status_code == 200, response.text
    reread = client.get(f"/api/items/{selected.item_id}").json()
    assert {key: reread[key] for key in values} == values
    assert _cells(db_session) == before
    assert client.get(f"/api/items/{other.item_id}").json() == other_before


@pytest.mark.parametrize("status", ["HOLD", "DUPLICATE"])
def test_bom_unmatched_status_reread_keeps_all_inventory_cells(
    client: TestClient, db_session: Session, make_item: Callable[..., Item], status: str,
) -> None:
    """Hold/duplicate classification changes cannot move any inventory."""
    item = make_item(warehouse_qty=Decimal("7"))
    before = _cells(db_session)
    response = client.patch(f"/api/items/{item.item_id}/bom-unmatched-status", headers=ADMIN, json={"status": status})
    assert response.status_code == 200, response.text
    assert client.get(f"/api/items/{item.item_id}").json()["bom_unmatched_status"] == status
    assert _cells(db_session) == before


@pytest.mark.parametrize("current,new,expected", [("1111", "5678", 403), ("0000", "123", 422),
                                                 ("0000", "x" * 33, 422), ("0000", "0000", 400)])
def test_admin_pin_update_rejects_invalid_policy_without_pin_or_audit_changes(
    client: TestClient, db_session: Session, current: str, new: str, expected: int,
) -> None:
    """Wrong current PIN, length boundaries, and same PIN cannot apply a change."""
    assert client.post("/api/settings/verify-pin", json={"pin": "0000"}).status_code == 200
    before = db_session.query(SystemSetting).filter_by(setting_key="admin_pin").one().setting_value
    response = client.put("/api/settings/admin-pin", json={"current_pin": current, "new_pin": new})
    assert response.status_code == expected, response.text
    db_session.expire_all()
    assert db_session.query(SystemSetting).filter_by(setting_key="admin_pin").one().setting_value == before
    assert db_session.query(AdminAuditLog).filter_by(action="settings.pin_change").count() == 0


def test_admin_pin_change_records_the_claimed_active_actor_and_actual_timestamp(
    client: TestClient, db_session: Session,
) -> None:
    """The audit actor/time belongs to the active tab actor without claiming signed identity."""
    actor = employee(db_session, "PIN-CHANGE-ACTOR")
    db_session.commit()
    start = datetime.utcnow() - timedelta(seconds=1)
    response = client.put("/api/settings/admin-pin", headers={"X-MES-Employee-Code": actor.employee_code},
                          json={"current_pin": "0000", "new_pin": "5678"})
    assert response.status_code == 200, response.text
    audit = db_session.query(AdminAuditLog).filter_by(action="settings.pin_change").one()
    assert audit.actor_employee_code == actor.employee_code
    assert start <= audit.created_at <= datetime.utcnow() + timedelta(seconds=1)
    assert client.get("/api/admin/audit-logs", headers={"X-Admin-Pin": "0000"}).status_code == 403
    assert client.get("/api/admin/audit-logs", headers={"X-Admin-Pin": "5678"}).status_code == 200


def test_inactive_department_rejects_new_normal_scrap_before_any_stock_or_request_change(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation],
) -> None:
    """Disabling a department must reject a new job without altering history or quantities."""
    actor = employee(db_session, "INACTIVE-DEPT-WORK")
    actor.department = "튜브"
    db_session.add(Department(name="튜브", is_active=False))
    item = make_item(process_type_code="TR", warehouse_qty=Decimal("7"))
    make_location(item.item_id, department="튜브", quantity=Decimal("4"))
    db_session.commit()
    before = _cells(db_session)
    response = client.post("/api/stock-requests", json={
        "requester_employee_id": str(actor.employee_id), "request_type": "scrap_normal",
        "reason_category": "외관 불량", "lines": [{"item_id": str(item.item_id), "quantity": 1,
        "from_bucket": "production", "from_department": "튜브", "to_bucket": "none"}],
    })
    assert response.status_code == 422, response.text
    assert _cells(db_session) == before
    assert db_session.query(StockRequest).count() == 0
    assert db_session.query(TransactionLog).count() == 0


@pytest.mark.parametrize("field", ["name", "display_name"])
def test_department_display_rename_keeps_all_location_and_history_keys(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], field: str,
) -> None:
    """Legacy PUT name and explicit display_name change only the visible label."""
    dept = Department(name="튜브", color_hex="#123abc")
    actor = employee(db_session, "DISPLAY-RENAME")
    actor.department = "튜브"
    item = make_item(process_type_code="TR", warehouse_qty=Decimal("7"))
    location = make_location(item.item_id, department="튜브", quantity=Decimal("4"))
    location.pending_quantity = Decimal("1")
    from app.models import LocationStatusEnum
    defective = make_location(item.item_id, department="튜브", status=LocationStatusEnum.DEFECTIVE, quantity=Decimal("2"))
    defective.pending_quantity = Decimal("1")
    db_session.query(Inventory).filter_by(item_id=item.item_id).one().pending_quantity = Decimal("2")
    log = TransactionLog(item_id=item.item_id, department="튜브", transaction_type=TransactionTypeEnum.RECEIVE,
                         quantity_change=1, producer_employee_id=actor.employee_id, produced_by=actor.name,
                         inventory_effect=[{"bucket": "PRODUCTION", "department": "튜브", "delta": "1"}])
    db_session.add_all([dept, log])
    db_session.commit()
    before = _cells(db_session)
    listed = client.get("/api/departments").json()
    assert next(row for row in listed if row["id"] == dept.id)["display_name"] == "튜브"
    result = client.put(f"/api/departments/{dept.id}", headers=ADMIN, json={"pin": "0000", field: "튜브팀"})
    assert result.status_code == 200, result.text
    assert (result.json()["id"], result.json()["name"], result.json()["display_name"]) == (dept.id, "튜브", "튜브팀")
    db_session.expire_all()
    assert (dept.name, actor.department, log.department, log.inventory_effect[0]["department"]) == (
        "튜브", "튜브", "튜브", "튜브",
    )
    assert _cells(db_session) == before
    assert next(row for row in client.get("/api/departments").json() if row["id"] == dept.id)["display_name"] == "튜브팀"


@pytest.mark.parametrize("operation", ["rename", "create"])
def test_department_effective_display_name_conflict_preserves_master_and_stock(
    client: TestClient, db_session: Session, make_item: Callable[..., Item], operation: str,
) -> None:
    """Existing renamed labels also reserve their name against create/update."""
    original, other = Department(name="튜브"), Department(name="조립")
    db_session.add_all([original, other])
    make_item(warehouse_qty=Decimal("7"))
    db_session.commit()
    assert client.put(f"/api/departments/{original.id}", headers=ADMIN,
                      json={"pin": "0000", "display_name": "표시팀"}).status_code == 200
    before = _cells(db_session)
    population = client.get("/api/departments").json()
    if operation == "rename":
        result = client.put(f"/api/departments/{other.id}", headers=ADMIN,
                            json={"pin": "0000", "name": "표시팀", "is_active": False})
    else:
        result = client.post("/api/departments", headers=ADMIN, json={"pin": "0000", "name": "표시팀"})
    assert result.status_code == 409, result.text
    assert client.get("/api/departments").json() == population
    assert _cells(db_session) == before


@pytest.mark.parametrize("bulk", [False, True])
@pytest.mark.parametrize("source", ["warehouse", "production"])
def test_inactive_department_rejects_new_quarantine_but_keeps_existing_restore_available(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], bulk: bool, source: str,
) -> None:
    """Deactivation blocks a new quarantine while an existing origin can be restored."""
    from app.models import DefectQuarantineRecord, DepartmentEnum
    actor = employee(db_session, "INACTIVE-QUARANTINE")
    actor.department = "튜브"
    dept = Department(name="창고" if source == "warehouse" else "튜브", is_active=True)
    item = make_item(process_type_code="TR", warehouse_qty=Decimal("7"))
    make_location(item.item_id, department=DepartmentEnum.TUBE, quantity=Decimal("4"))
    db_session.add(dept)
    db_session.commit()
    line = {"item_id": str(item.item_id), "qty": 1, "source": source, "target_dept": dept.name,
            "reason_category": "외관 불량"}
    if source == "production":
        line["source_dept"] = dept.name
    seeded = client.post("/api/defects/quarantine", json={**line, "actor_employee_id": str(actor.employee_id)})
    assert seeded.status_code == 200, seeded.text
    origin = db_session.query(DefectQuarantineRecord).one()
    dept.is_active = False
    db_session.commit()
    before = _cells(db_session)
    payload = {"actor_employee_id": str(actor.employee_id), "lines": [line]} if bulk else {
        **line, "actor_employee_id": str(actor.employee_id),
    }
    rejected = client.post("/api/defects/quarantine" + ("/bulk" if bulk else ""), json=payload)
    assert rejected.status_code == 422, rejected.text
    assert _cells(db_session) == before
    assert db_session.query(DefectQuarantineRecord).count() == 1
    assert db_session.query(TransactionLog).count() == 1
    restored = client.post("/api/defects/unquarantine", json={
        "actor_employee_id": str(actor.employee_id), "record_id": str(origin.record_id),
        "item_id": str(item.item_id), "dept": dept.name, "qty": 1, "reason_category": "외관 불량",
    })
    assert restored.status_code == 200, restored.text
    db_session.refresh(origin)
    assert origin.remaining_quantity == 0


@pytest.mark.parametrize("boundary", ["io-submit", "stock-request-draft-submit"])
def test_department_disabled_after_preview_or_draft_cannot_start_new_work(
    client: TestClient, db_session: Session, make_item: Callable[..., Item], boundary: str,
) -> None:
    """A saved preview/draft cannot bypass the current department activation state."""
    from app.models import DepartmentEnum, IoBatch, StockRequestStatusEnum
    from tests.test_io_v2 import _make_employee
    actor = _make_employee(db_session, department=DepartmentEnum.TUBE, warehouse_role="primary")
    dept = Department(name="튜브", is_active=True)
    item = make_item(process_type_code="TR", warehouse_qty=Decimal("7"))
    db_session.add(dept)
    db_session.commit()
    payload = {"requester_employee_id": str(actor.employee_id), "work_type": "warehouse_io",
               "sub_type": "warehouse_to_dept"}
    if boundary == "io-submit":
        prepared = client.post("/api/io/preview", json={**payload, "targets": [{
            "source_kind": "direct_item", "item_id": str(item.item_id), "quantity": 1,
        }]})
        assert prepared.status_code == 200, prepared.text
    else:
        prepared = client.put("/api/stock-requests/draft", json={
            "requester_employee_id": str(actor.employee_id), "request_type": "warehouse_to_dept",
            "lines": [{"item_id": str(item.item_id), "quantity": 1,
                       "from_bucket": "warehouse", "to_bucket": "production", "to_department": "튜브"}],
        })
        assert prepared.status_code == 200, prepared.text
    dept.is_active = False
    db_session.commit()
    before = _cells(db_session)
    if boundary == "io-submit":
        submitted = client.post("/api/io/submit", json={**payload, "bundles": prepared.json()["bundles"]})
    else:
        submitted = client.post(f"/api/stock-requests/{prepared.json()['request_id']}/submit",
                                json={"requester_employee_id": str(actor.employee_id)})
    assert submitted.status_code == 422, submitted.text
    assert "사용 중지" in submitted.text
    assert _cells(db_session) == before
    assert db_session.query(TransactionLog).count() == 0
    assert db_session.query(IoBatch).count() == 0
    if boundary == "stock-request-draft-submit":
        request = db_session.query(StockRequest).one()
        assert request.status == StockRequestStatusEnum.DRAFT
        assert request.submitted_at is None
        assert request.request_code is None
    else:
        assert db_session.query(StockRequest).count() == 0


def test_department_disabled_after_work_still_allows_immutable_history_cancellation(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
) -> None:
    """Disabling new work must not trap a completed transfer or erase its history."""
    from app.models import DepartmentEnum
    from tests.test_io_v2 import _make_employee
    from tests.test_io_expectation_closure import _submit, _cancel_once
    actor = _make_employee(db_session, department=DepartmentEnum.TUBE, warehouse_role="primary")
    dept = Department(name="튜브", is_active=True)
    db_session.add_all([dept, SystemSetting(setting_key="inventory_operation_cutover_at",
                                          setting_value="2026-01-01T00:00:00")])
    item = make_item(process_type_code="TR", warehouse_qty=Decimal("7"))
    db_session.commit()
    before = _cells(db_session)
    _submit(client, actor, [item], work_type="warehouse_io", sub_type="warehouse_to_dept")
    dept.is_active = False
    db_session.commit()
    # The transfer creates a normal zero-quantity cell on reversal; physical quantities still match.
    before[(str(item.item_id), "튜브", "PRODUCTION", "quantity")] = Decimal("0")
    before[(str(item.item_id), "튜브", "PRODUCTION", "pending")] = Decimal("0")
    cancelled = _cancel_once(client, db_session, actor, before)
    assert cancelled["cells"] == before
    assert (cancelled["actor_employee_id"], cancelled["reason"]) == (actor.employee_id, "closure reverse")
    assert cancelled["reverse_original_ids"] == cancelled["original_ids"] == cancelled["preserved_original_ids"]
    assert (cancelled["retry_status"], cancelled["log_count_after_retry"], cancelled["inverse_count"]) == (422, cancelled["log_count_before_retry"], 1)


@pytest.mark.parametrize("status", ["draft", "submitted", "reserved", "failed_approval"])
def test_employee_delete_with_pending_request_is_blocked_without_stranding_ownership(
    client: TestClient, db_session: Session, make_item: Callable[..., Item], status: str,
) -> None:
    """Deletion must not deactivate the sole requester while their work is still open."""
    from app.models import StockRequestTypeEnum, StockRequestStatusEnum
    actor = employee(db_session, "PENDING-DELETE")
    make_item(warehouse_qty=Decimal("7"))
    request = StockRequest(requester_employee_id=actor.employee_id, requester_name=actor.name,
                           requester_department=actor.department, request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
                           status=StockRequestStatusEnum(status))
    db_session.add(request)
    db_session.commit()
    tables = [model.__table__ for model in (Employee, StockRequest, Inventory, InventoryLocation, TransactionLog, AdminAuditLog)]
    before = {table.name: [tuple(row) for row in db_session.execute(table.select()).all()] for table in tables}
    deleted = client.delete(f"/api/employees/{actor.employee_id}", headers=ADMIN)
    assert deleted.status_code == 409, deleted.text
    db_session.expire_all()
    assert {table.name: [tuple(row) for row in db_session.execute(table.select()).all()] for table in tables} == before


@pytest.mark.parametrize("status", ["PREPARING", "PREPARED"])
def test_employee_delete_with_preparing_shipping_is_blocked_without_losing_actor(
    client: TestClient, db_session: Session, make_item: Callable[..., Item], status: str,
) -> None:
    """The immutable prepared actor cannot disappear during an outstanding shipment."""
    from app.models import ShippingRequest, ShippingRequestStatusEnum
    actor = employee(db_session, "SHIPPING-DELETE")
    item = make_item(process_type_code="PF", warehouse_qty=Decimal("7"))
    shipment = ShippingRequest(base_pf_item_id=item.item_id, prepared_by_employee_id=actor.employee_id,
                               prepared_by_name=actor.name, status=ShippingRequestStatusEnum(status))
    db_session.add(shipment)
    db_session.commit()
    before = _cells(db_session)
    deleted = client.delete(f"/api/employees/{actor.employee_id}", headers=ADMIN)
    assert deleted.status_code == 409, deleted.text
    db_session.expire_all()
    assert db_session.get(Employee, actor.employee_id).is_active is True
    assert shipment.prepared_by_employee_id == actor.employee_id
    assert shipment.prepared_by_name == actor.name
    assert shipment.status == ShippingRequestStatusEnum(status)
    assert _cells(db_session) == before
    assert db_session.query(AdminAuditLog).count() == 0


def test_employee_delete_with_completed_request_retains_historical_actor_and_request(
    client: TestClient, db_session: Session,
) -> None:
    """Completed history is retained by deactivation without changing its snapshots."""
    from app.models import StockRequestTypeEnum, StockRequestStatusEnum
    actor = employee(db_session, "COMPLETED-DELETE")
    request = StockRequest(requester_employee_id=actor.employee_id, requester_name="original name",
                           requester_department="조립", request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
                           status=StockRequestStatusEnum.COMPLETED)
    db_session.add(request)
    db_session.commit()
    result = client.delete(f"/api/employees/{actor.employee_id}", headers=ADMIN)
    assert result.status_code == 200, result.text
    assert result.json() == {"result": "deactivated"}
    db_session.expire_all()
    assert db_session.get(Employee, actor.employee_id).is_active is False
    assert (request.requester_employee_id, request.requester_name, request.requester_department, request.status) == (
        actor.employee_id, "original name", "조립", StockRequestStatusEnum.COMPLETED,
    )


@pytest.mark.parametrize("role", ["primary", "deputy"])
def test_warehouse_role_grant_revoke_regrant_preserves_all_cells_and_executes_once(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], role: str,
) -> None:
    """Current warehouse authority changes access, never the pending work's stock."""
    from app.models import DepartmentEnum, StockRequestLine, StockRequestStatusEnum
    from tests.test_io_v2 import _make_employee
    from tests.test_io_expectation_closure import _seed_cells, _submit

    requester = _make_employee(db_session, code="WAREHOUSE-LIFECYCLE-RQ")
    approver = _make_employee(db_session, code="WAREHOUSE-LIFECYCLE-AP")
    item = make_item(process_type_code="TR", warehouse_qty=Decimal("8"))
    other = make_item(process_type_code="VR", warehouse_qty=Decimal("9"))
    _seed_cells(db_session, item, make_location, department=DepartmentEnum.TUBE)
    make_location(other.item_id, department=DepartmentEnum.VACUUM, quantity=Decimal("3"))
    db_session.commit()
    _submit(client, requester, [item], work_type="warehouse_io", sub_type="warehouse_to_dept")
    request = db_session.query(StockRequest).one()
    pending = _cells(db_session)
    lines = StockRequestLine.__table__
    request_lines = list(db_session.execute(lines.select()).all())
    queue_url = "/api/stock-requests/warehouse-queue"
    action_url = f"/api/stock-requests/{request.request_id}/approve"
    body = {"actor_employee_id": str(approver.employee_id), "pin": "0000"}
    assert [row["request_id"] for row in client.get(queue_url).json()] == [str(request.request_id)]

    granted = client.put(f"/api/employees/{approver.employee_id}", headers=ADMIN, json={"warehouse_role": role})
    assert granted.status_code == 200, granted.text
    assert [row["request_id"] for row in client.get(queue_url).json()] == [str(request.request_id)]
    assert _cells(db_session) == pending
    assert list(db_session.execute(lines.select()).all()) == request_lines
    revoked = client.put(f"/api/employees/{approver.employee_id}", headers=ADMIN, json={"warehouse_role": "none"})
    assert revoked.status_code == 200, revoked.text
    assert [row["request_id"] for row in client.get(queue_url).json()] == [str(request.request_id)]
    denied = client.post(action_url, json=body)
    assert denied.status_code == 403, denied.text
    assert _cells(db_session) == pending
    assert request.status == StockRequestStatusEnum.RESERVED
    assert list(db_session.execute(lines.select()).all()) == request_lines
    assert db_session.query(TransactionLog).count() == 0

    regranted = client.put(f"/api/employees/{approver.employee_id}", headers=ADMIN, json={"warehouse_role": role})
    assert regranted.status_code == 200, regranted.text
    assert _cells(db_session) == pending
    assert list(db_session.execute(lines.select()).all()) == request_lines
    approved = client.post(action_url, json=body)
    assert approved.status_code == 200, approved.text
    expected = dict(pending)
    expected[(str(item.item_id), "warehouse")] -= Decimal("1")
    expected[(str(item.item_id), "warehouse_pending")] -= Decimal("1")
    expected[(str(item.item_id), "튜브", "PRODUCTION", "quantity")] += Decimal("1")
    assert _cells(db_session) == expected
    assert request.status == StockRequestStatusEnum.COMPLETED
    log_ids = {log.log_id for log in db_session.query(TransactionLog).all()}
    assert len(log_ids) == 1
    repeated = client.post(action_url, json=body)
    assert repeated.status_code == 200, repeated.text
    assert _cells(db_session) == expected
    assert {log.log_id for log in db_session.query(TransactionLog).all()} == log_ids
