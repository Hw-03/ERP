"""Admin PIN guard coverage for sensitive admin/write endpoints."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import BOM, Employee, EmployeeLevelEnum, ProductSymbol
from app.utils.mes_code import refresh_symbol_cache

ADMIN_HEADERS = {"X-Admin-Pin": "0000"}


@pytest.fixture()
def csv_env(tmp_path, monkeypatch):
    monkeypatch.setenv("AUDIT_CSV_DIR", str(tmp_path))
    return tmp_path


def _seed_symbol(db_session):
    db_session.add(ProductSymbol(slot=1, symbol="9", model_name="DX3000", is_reserved=False))
    db_session.add(ProductSymbol(slot=2, symbol=None, model_name=None, is_reserved=True))
    db_session.commit()
    refresh_symbol_cache(db_session)


def _employee(db_session):
    emp = Employee(
        employee_code="EGUARD",
        name="Guard Employee",
        role="worker",
        department="assembly",
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active="true",
        io_enabled=True,
    )
    db_session.add(emp)
    db_session.commit()
    return emp


def test_model_create_requires_admin_pin(client, db_session):
    _seed_symbol(db_session)
    res = client.post("/api/models", json={"model_name": "NEW", "symbol": "8"})
    assert res.status_code == 400


def test_product_symbol_update_requires_admin_pin(client, db_session):
    _seed_symbol(db_session)
    res = client.put("/api/codes/symbols/2", json={"symbol": "8", "model_name": "NEW"})
    assert res.status_code == 400


def test_product_symbol_update_allows_admin_pin(client, db_session):
    _seed_symbol(db_session)
    res = client.put(
        "/api/codes/symbols/2",
        headers=ADMIN_HEADERS,
        json={"symbol": "8", "model_name": "NEW"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["slot"] == 2
    assert body["symbol"] == "8"
    assert body["model_name"] == "NEW"


def test_item_write_endpoints_require_admin_pin(client, db_session, make_item):
    _seed_symbol(db_session)
    create_res = client.post(
        "/api/items",
        json={"item_name": "Guard Item", "process_type_code": "HR", "model_slots": [1]},
    )
    assert create_res.status_code == 400

    item = make_item(name="Existing Guard Item", process_type_code="TR", model_symbol="9", serial_no=1)
    assert client.put(f"/api/items/{item.item_id}", json={"item_name": "Changed"}).status_code == 400
    assert client.patch(f"/api/items/{item.item_id}/bom-completion", json={"completed": True}).status_code == 400
    assert client.patch(f"/api/items/{item.item_id}/soft-delete").status_code == 400
    assert client.patch(f"/api/items/{item.item_id}/restore").status_code == 400


def test_employee_master_write_endpoints_require_admin_pin(client, db_session):
    payload = {
        "name": "No Pin Employee",
        "role": "worker",
        "department": "assembly",
        "level": "staff",
        "warehouse_role": "none",
        "department_role": "none",
        "display_order": 0,
        "is_active": True,
    }
    assert client.post("/api/employees", json=payload).status_code == 400

    emp = _employee(db_session)
    assert client.put(f"/api/employees/{emp.employee_id}", json={"io_enabled": False}).status_code == 400
    assert client.delete(f"/api/employees/{emp.employee_id}").status_code == 400


def test_bom_write_endpoints_require_admin_pin(client, db_session, make_item):
    parent = make_item(name="Guard Parent", process_type_code="AF")
    child = make_item(name="Guard Child", process_type_code="TR")
    payload = {
        "parent_item_id": str(parent.item_id),
        "child_item_id": str(child.item_id),
        "quantity": "1",
        "unit": "EA",
    }
    assert client.post("/api/bom", json=payload).status_code == 400

    row = BOM(parent_item_id=parent.item_id, child_item_id=child.item_id, quantity=Decimal("1"), unit="EA")
    db_session.add(row)
    db_session.commit()
    assert client.patch(f"/api/bom/{row.bom_id}", json={"quantity": "2"}).status_code == 400
    assert client.delete(f"/api/bom/{row.bom_id}").status_code == 400


def test_admin_audit_endpoints_require_admin_pin(client, csv_env):
    assert client.get("/api/admin/audit-logs").status_code == 400
    assert client.get("/api/admin/audit-csv/files").status_code == 400
    assert client.post("/api/admin/audit-csv/backfill").status_code == 400
    assert client.get("/api/admin/audit-csv/2026-05.csv").status_code == 400
    assert client.get("/api/admin/audit-csv/2026-05.xlsx").status_code == 400


def test_warehouse_box_tracking_requires_admin_pin(client):
    res = client.put("/api/warehouse-map/box-tracking", json={"enabled": True})
    assert res.status_code == 400

    allowed = client.put(
        "/api/warehouse-map/box-tracking",
        headers=ADMIN_HEADERS,
        json={"enabled": True},
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["enabled"] is True
