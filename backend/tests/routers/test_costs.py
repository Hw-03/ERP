"""Management cost standards require a verified, currently authorized operator."""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models import AdminAuditLog, Employee, Item, ProductSymbol, SystemSetting
from app.services.operator_session import issue_session, utc_now_naive


KEY = "cost.standard_hourly_labor_rate"


@pytest.mark.parametrize("role", [{"department_role": "primary"}, {"department_role": "deputy"}, {"warehouse_role": "primary"}, {"warehouse_role": "deputy"}])
def test_yield_criteria_permissions_and_atomic_validation(client, db_session, make_item, operator_factory, role):
    item = make_item(process_type_code="TF")
    _, _, manager = operator_factory(**role)
    _, _, staff = operator_factory()
    path = f"/api/costs/items/{item.item_id}/purchase-info"
    assert client.patch(path, headers=staff, json={"standard_yield_percent": "70"}).status_code == 403
    assert client.patch(path, json={"standard_yield_percent": "70"}).status_code == 401
    for value in ("0", "-1", "100.01", "70.001"):
        assert client.patch(path, headers=manager, json={"standard_yield_percent": value, "supplier": "invalid"}).status_code == 422
        db_session.refresh(item)
        assert item.standard_yield_percent is None and item.supplier != "invalid"
    assert client.patch(path, headers=manager, json={"standard_yield_percent": "70"}).json()["standard_yield_percent"] == "70.00"
    assert client.patch(path, headers=manager, json={"purchase_memo": "memo"}).json()["standard_yield_percent"] == "70.00"
    assert client.get(path, headers=manager).json()["standard_yield_percent"] == "70.00"
    assert client.patch(path, headers=manager, json={"standard_yield_percent": None}).json()["standard_yield_percent"] is None
    other = make_item(process_type_code="TA")
    assert client.patch(f"/api/costs/items/{other.item_id}/standards", headers=manager, json={"standard_yield_percent": "70"}).status_code == 422


def test_yield_integrated_save_recalculates_ancestor_and_rechecks_role(client, db_session, make_item, make_bom, operator_factory, monkeypatch):
    raw = make_item(process_type_code="TR")
    raw.standard_purchase_price = Decimal("100")
    tube = make_item(process_type_code="TF")
    tube.standard_work_minutes = Decimal("0")
    root = make_item(process_type_code="NF")
    root.standard_work_minutes = Decimal("0")
    make_bom(tube.item_id, raw.item_id, 1)
    make_bom(root.item_id, tube.item_id, 1)
    manager, _, headers = operator_factory(warehouse_role="deputy")
    _, _, staff = operator_factory()
    commits = []
    original = db_session.commit
    def commit():
        commits.append(True)
        original()
    monkeypatch.setattr(db_session, "commit", commit)
    path = f"/api/costs/items/{tube.item_id}/purchase-info"
    response = client.patch(path, headers=headers, json={"standard_yield_percent": "80", "standard_work_minutes": "1", "hourly_labor_rate": "6000", "purchase_memo": "yield criteria"})
    assert response.status_code == 200, response.text
    assert len(commits) == 1
    data = client.get(f"/api/costs/items/{root.item_id}", headers=staff).json()
    assert data["unit_cost"] == "200.00" and data["yield_adjusted_unit_cost"] == "250.00"
    assert data["can_edit"] is False
    simulated = client.get(f"/api/costs/items/{root.item_id}?simulation_hourly_rate=12000", headers=staff).json()
    assert simulated["unit_cost"] == "300.00" and simulated["yield_adjusted_unit_cost"] == "375.00"
    assert db_session.query(AdminAuditLog).filter(AdminAuditLog.payload_summary.contains("standard_yield_percent")).count() == 1
    assert client.patch(path, headers={**staff, "X-Admin-Pin": "0000", "X-Department-Role": "primary"}, json={"standard_yield_percent": "90"}).status_code == 403
    manager.warehouse_role = "none"
    db_session.flush()
    assert client.patch(path, headers=headers, json={"standard_yield_percent": "90"}).status_code == 403
    assert client.get(path, headers=headers).status_code == 403


def test_simulated_hourly_rate_recalculates_tree_and_summaries_without_writes(client, db_session, make_item, make_bom, operator_factory):
    raw = make_item()
    raw.standard_purchase_price = Decimal("10")
    parent = make_item(process_type_code="TA")
    parent.standard_work_minutes = Decimal("30")
    make_bom(parent.item_id, raw.item_id, Decimal("2"))
    db_session.add(SystemSetting(setting_key=KEY, setting_value="18000"))
    db_session.flush()
    _, _, headers = operator_factory()
    audits = db_session.query(AdminAuditLog).count()
    path = f"/api/costs/items/{parent.item_id}"
    simulated = client.get(path, params={"simulation_hourly_rate": "12000"}, headers=headers)
    assert simulated.status_code == 200, simulated.text
    assert simulated.json()["unit_cost"] == "6020.00"
    assert simulated.json()["labor_cost"] == "6000.00"
    rows = client.post("/api/costs/item-summaries?simulation_hourly_rate=12000", json={"item_ids": [str(parent.item_id)]}, headers=headers)
    assert rows.json()[0]["unit_cost"] == "6020.00"
    assert client.get(path, params={"simulation_hourly_rate": "0"}, headers=headers).json()["unit_cost"] == "20.00"
    assert client.get(path, headers=headers).json()["unit_cost"] == "9020.00"
    assert db_session.get(SystemSetting, KEY).setting_value == "18000"
    assert db_session.query(AdminAuditLog).count() == audits
    for invalid in ("-1", "0.001", "NaN", "10000000000000000"):
        assert client.get(path, params={"simulation_hourly_rate": invalid}, headers=headers).status_code == 422


def test_purchase_info_saves_labor_currency_and_purchase_in_one_commit(client, db_session, make_item, operator_factory, monkeypatch):
    item = make_item()
    _, _, headers = operator_factory(department_role="primary")
    commits = []
    original_commit = db_session.commit
    def commit():
        commits.append(True)
        original_commit()
    monkeypatch.setattr(db_session, "commit", commit)
    response = client.patch(f"/api/costs/items/{item.item_id}/purchase-info", headers=headers, json={
        "supplier": "Integrated", "standard_work_minutes": "2", "hourly_labor_rate": "6000",
        "purchase_currency": "USD", "foreign_purchase_price": "1.25", "purchase_exchange_rate": "1300.123456",
    })
    assert response.status_code == 200, response.text
    assert len(commits) == 1
    data = response.json()
    assert data["item_name"] == item.item_name and data["mes_code"] == item.mes_code
    assert data["standard_purchase_price"] == "1625.15"
    assert data["standard_work_minutes"] == "2.00" and data["hourly_labor_rate"] == "6000.00"
    assert data["purchase_exchange_rate"] == "1300.123456"
    assert db_session.get(SystemSetting, KEY).setting_value == "6000.00"
    cost = client.get(f"/api/costs/items/{item.item_id}", headers=headers).json()
    assert cost["unit_cost"] == "1825.15"
    assert db_session.query(AdminAuditLog).filter_by(action="cost.standards.update").count() == 1


@pytest.mark.parametrize("invalid", [{"hourly_labor_rate": "-1"}, {"purchase_currency": "USD", "foreign_purchase_price": "2"}])
def test_integrated_info_invalid_inputs_do_not_stage_any_changes(client, db_session, make_item, operator_factory, invalid):
    item = make_item()
    _, _, headers = operator_factory(warehouse_role="primary")
    path = f"/api/costs/items/{item.item_id}/purchase-info"
    response = client.patch(path, headers=headers, json={"supplier": "Blocked", "standard_work_minutes": "7", **invalid})
    assert response.status_code == 422, response.text
    assert item.supplier != "Blocked" and item.standard_work_minutes is None
    assert db_session.get(SystemSetting, KEY) is None


@pytest.mark.parametrize("role_field,role", [("department_role", "primary"), ("department_role", "deputy"), ("warehouse_role", "primary"), ("warehouse_role", "deputy")])
def test_purchase_info_managers_read_and_update_only_purchase_fields(client, db_session, make_item, operator_factory, role_field, role):
    item = make_item()
    original_name, original_code = item.item_name, item.mes_code
    _, _, headers = operator_factory(**{role_field: role})
    path = f"/api/costs/items/{item.item_id}/purchase-info"
    before = client.get(path, headers=headers)
    assert before.status_code == 200, before.text
    assert before.json()["unit"] == item.unit
    values = {"supplier": "Cost supplier", "supplier_item_code": "S-1", "standard_purchase_price": "12.50",
              "purchase_price_effective_date": "2026-10-28", "min_stock": 0, "reorder_point": 20,
              "procurement_lead_time_days": 3, "minimum_order_quantity": 1, "purchase_memo": "Cost memo"}
    response = client.patch(path, json=values, headers=headers)
    assert response.status_code == 200, response.text
    assert all(response.json()[key] == value for key, value in values.items())
    db_session.refresh(item)
    assert item.item_name == original_name and item.mes_code == original_code
    assert client.patch(path, json={"min_stock": None}, headers=headers).json()["supplier"] == "Cost supplier"
    assert db_session.query(AdminAuditLog).filter_by(action="item.update", target_id=str(item.item_id)).count() == 2


def test_purchase_info_read_and_write_reject_staff_admin_pin_and_revoked_role(client, db_session, make_item, operator_factory):
    item = make_item()
    path = f"/api/costs/items/{item.item_id}/purchase-info"
    _, _, staff = operator_factory()
    for headers, status in (({}, 401), (staff, 403), ({**staff, "X-Admin-Pin": "0000", "X-Department-Role": "primary"}, 403)):
        assert client.get(path, headers=headers).status_code == status
        assert client.patch(path, json={"supplier": "Blocked"}, headers=headers).status_code == status
    employee, _, manager = operator_factory(department_role="primary")
    assert client.get(path, headers=manager).status_code == 200
    employee.department_role = "none"
    db_session.flush()
    assert client.get(path, headers=manager).status_code == 403
    assert client.patch(path, json={"supplier": "Blocked"}, headers=manager).status_code == 403
    db_session.refresh(item)
    assert item.supplier != "Blocked"


@pytest.mark.parametrize("payload", [{"item_name": "Not allowed"}, {"quantity": 10}, {"min_stock": -1}, {"minimum_order_quantity": 0}, {"standard_purchase_price": "1.001"}, {"purchase_memo": "x" * 1001}])
def test_purchase_info_invalid_patch_is_atomic(client, db_session, make_item, operator_factory, payload):
    item = make_item()
    _, _, headers = operator_factory(warehouse_role="deputy")
    response = client.patch(f"/api/costs/items/{item.item_id}/purchase-info", json={"supplier": "Blocked", **payload}, headers=headers)
    assert response.status_code == 422, response.text
    db_session.refresh(item)
    assert item.supplier != "Blocked"


def test_purchase_info_preserves_foreign_source_until_krw_price_is_edited(client, db_session, make_item, operator_factory):
    item = make_item()
    item.purchase_currency = "USD"
    item.foreign_purchase_price = Decimal("2")
    item.purchase_exchange_rate = Decimal("1300")
    item.standard_purchase_price = Decimal("2600")
    db_session.flush()
    _, _, headers = operator_factory(department_role="primary")
    path = f"/api/costs/items/{item.item_id}/purchase-info"
    assert client.patch(path, json={"purchase_memo": "Memo"}, headers=headers).json()["purchase_currency"] == "USD"
    assert client.patch(path, json={"standard_purchase_price": "2700"}, headers=headers).json()["purchase_currency"] == "KRW"
    db_session.refresh(item)
    assert item.foreign_purchase_price is None and item.purchase_exchange_rate is None


def test_cost_summary_matches_details_and_keeps_missing_and_zero(client, db_session, make_item, make_bom, operator_factory):
    raw = make_item()
    raw.standard_purchase_price = Decimal("10.25")
    zero = make_item()
    zero.standard_purchase_price = Decimal("0")
    unknown = make_item()
    parent = make_item(process_type_code="TA")
    make_bom(parent.item_id, raw.item_id, Decimal("3"))
    db_session.flush()
    _, _, headers = operator_factory()
    ids = [str(item.item_id) for item in (raw, zero, unknown, parent)]
    response = client.post("/api/costs/item-summaries", json={"item_ids": ids}, headers=headers)
    assert response.status_code == 200, response.text
    summaries = {row["item_id"]: row for row in response.json()}
    for item_id in ids:
        detail = client.get(f"/api/costs/items/{item_id}", headers=headers).json()["tree"]
        assert summaries[item_id] == {key: detail[key] for key in (
            "item_id", "unit_cost", "own_labor_cost", "amount", "status",
        )}
    assert summaries[str(zero.item_id)]["unit_cost"] == "0.00"
    assert summaries[str(unknown.item_id)]["unit_cost"] is None
    assert summaries[str(parent.item_id)]["unit_cost"] == "30.75"
    assert summaries[str(parent.item_id)]["own_labor_cost"] is None


def test_cost_summary_requires_session_and_limits_batch(client, make_item, operator_factory):
    item = make_item()
    payload = {"item_ids": [str(item.item_id)]}
    assert client.post("/api/costs/item-summaries", json=payload).status_code == 401
    _, _, headers = operator_factory()
    assert client.post("/api/costs/item-summaries", json={"item_ids": payload["item_ids"] * 101}, headers=headers).status_code == 422
    assert client.post("/api/costs/item-summaries", json={"item_ids": ["invalid"]}, headers=headers).status_code == 422


def test_foreign_price_converts_to_krw_and_recalculates_parent(client, db_session, make_item, make_bom, operator_factory):
    item = make_item()
    parent = make_item(process_type_code="TA")
    parent.standard_work_minutes = Decimal("0")
    make_bom(parent.item_id, item.item_id, Decimal("3"))
    db_session.add(SystemSetting(setting_key=KEY, setting_value="18000"))
    db_session.flush()
    _, _, headers = operator_factory(department_role="primary")
    path = f"/api/costs/items/{item.item_id}/standards"
    response = client.patch(path, json={"purchase_currency": "USD", "foreign_purchase_price": "2.50", "purchase_exchange_rate": "1380.123456"}, headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["standards"]["standard_purchase_price"] == "3450.31"
    assert data["standards"]["purchase_currency"] == "USD"
    assert data["standards"]["purchase_exchange_rate"] == "1380.123456"
    assert data["material_cost"] == "3450.31"
    parent_path = f"/api/costs/items/{parent.item_id}"
    assert client.get(parent_path, headers=headers).json()["material_cost"] == "10350.93"
    # Time-only edits preserve the foreign source and converted price.
    response = client.patch(path, json={"standard_work_minutes": "0"}, headers=headers)
    assert response.json()["standards"]["foreign_purchase_price"] == "2.50"
    response = client.patch(path, json={"purchase_exchange_rate": "1400"}, headers=headers)
    assert response.json()["material_cost"] == "3500.00"
    assert client.get(parent_path, headers=headers).json()["material_cost"] == "10500.00"
    response = client.patch(path, json={"purchase_currency": "KRW", "standard_purchase_price": "4000"}, headers=headers)
    assert response.json()["material_cost"] == "4000.00"
    assert response.json()["standards"]["foreign_purchase_price"] is None
    assert response.json()["standards"]["purchase_exchange_rate"] is None


@pytest.mark.parametrize("payload", [
    {"purchase_currency": "USD", "foreign_purchase_price": "2.50"},
    {"purchase_currency": "USD", "foreign_purchase_price": "2.50", "purchase_exchange_rate": "0"},
    {"purchase_currency": "USD", "foreign_purchase_price": "-1", "purchase_exchange_rate": "1400"},
    {"purchase_currency": "USD", "foreign_purchase_price": "9999999999999999.99", "purchase_exchange_rate": "1400"},
    {"purchase_currency": "usd"},
])
def test_foreign_price_invalid_patch_is_atomic(client, db_session, make_item, operator_factory, payload):
    item = make_item()
    _, _, headers = operator_factory(department_role="primary")
    response = client.patch(f"/api/costs/items/{item.item_id}/standards", json=payload | {"standard_work_minutes": "5"}, headers=headers)
    assert response.status_code == 422, response.text
    db_session.refresh(item)
    assert item.standard_work_minutes is None


def test_foreign_price_rounding_zero_permissions_and_legacy_krw_edit(client, db_session, make_item, operator_factory):
    item = make_item()
    _, _, headers = operator_factory(department_role="primary")
    _, _, staff = operator_factory()
    path = f"/api/costs/items/{item.item_id}/standards"
    payload = {"purchase_currency": "USD", "foreign_purchase_price": "0.01", "purchase_exchange_rate": "1.5"}
    assert client.patch(path, json=payload, headers=staff).status_code == 403
    assert client.patch(path, json=payload, headers=headers).json()["material_cost"] == "0.02"
    assert client.patch(path, json={"foreign_purchase_price": "0"}, headers=headers).json()["material_cost"] == "0.00"
    response = client.put(f"/api/items/{item.item_id}", json={"standard_purchase_price": "50"}, headers=headers | {"X-Admin-Pin": "0000"})
    assert response.status_code == 200, response.text
    standards = client.get(f"/api/costs/items/{item.item_id}", headers=headers).json()["standards"]
    assert standards["purchase_currency"] == "KRW"
    assert standards["foreign_purchase_price"] is None and standards["purchase_exchange_rate"] is None


@pytest.fixture
def operator_factory(db_session):
    def make(*, department_role="none", warehouse_role="none"):
        employee = Employee(employee_code=f"cost-{db_session.query(Employee).count()}",
                            name="Cost operator", role="staff",
                            department_role=department_role, warehouse_role=warehouse_role)
        db_session.add(employee)
        db_session.flush()
        token, row = issue_session(db_session, employee=employee, tab_id="cost")
        return employee, row, {"X-Operator-Session": token}
    return make


def test_standards_get_requires_session_and_never_creates_setting(client, db_session, operator_factory):
    _, _, headers = operator_factory()
    assert client.get("/api/costs/standards").status_code == 401
    for _ in range(2):
        response = client.get("/api/costs/standards", headers=headers)
        assert response.status_code == 200
        assert response.json() == {"hourly_labor_rate": None, "can_edit": False}
    assert db_session.get(SystemSetting, KEY) is None


@pytest.mark.parametrize("role_field,role", [("department_role", "primary"), ("department_role", "deputy"), ("warehouse_role", "primary"), ("warehouse_role", "deputy")])
def test_each_manager_role_can_update_and_clear_rate(client, db_session, operator_factory, role_field, role):
    employee, _, headers = operator_factory(**{role_field: role})
    path = "/api/costs/standards"
    assert client.patch(path, json={"hourly_labor_rate": "12000.50"}, headers=headers).json() == {"hourly_labor_rate": "12000.50", "can_edit": True}
    assert db_session.get(SystemSetting, KEY).setting_value == "12000.50"
    assert client.patch(path, json={}, headers=headers).json()["hourly_labor_rate"] == "12000.50"
    assert client.patch(path, json={"hourly_labor_rate": "0"}, headers=headers).json()["hourly_labor_rate"] == "0.00"
    assert client.patch(path, json={"hourly_labor_rate": None}, headers=headers).json()["hourly_labor_rate"] is None
    assert db_session.get(SystemSetting, KEY) is None
    logs = db_session.query(AdminAuditLog).filter_by(action="cost.standards.update").all()
    assert len(logs) == 3
    assert all(row.actor_employee_code == employee.employee_code and row.actor_pin_role == "operator" for row in logs)


def test_staff_and_forged_role_cannot_edit(client, operator_factory):
    _, _, headers = operator_factory()
    headers["X-Department-Role"] = "primary"
    assert client.patch("/api/costs/standards", json={"hourly_labor_rate": "1"}, headers=headers).status_code == 403


@pytest.mark.parametrize("invalid", ["expired", "inactive", "revoked", "pin_changed"])
def test_cost_lookup_rejects_invalid_operator(client, db_session, operator_factory, invalid):
    employee, row, headers = operator_factory(department_role="primary")
    if invalid == "expired":
        row.expires_at = utc_now_naive() - timedelta(seconds=1)
    elif invalid == "inactive":
        employee.is_active = False
    elif invalid == "revoked":
        row.revoked_at = utc_now_naive()
    else:
        employee.pin_version += 1
    db_session.flush()
    assert client.get("/api/costs/standards", headers=headers).status_code == 401


@pytest.mark.parametrize("value", ["-0.01", "1.001", "10000000000000000", "NaN", "Infinity"])
def test_rate_precision_validation_is_atomic(client, db_session, operator_factory, value):
    _, _, headers = operator_factory(warehouse_role="primary")
    assert client.patch("/api/costs/standards", json={"hourly_labor_rate": value}, headers=headers).status_code == 422
    assert db_session.get(SystemSetting, KEY) is None


def test_item_standards_patch_distinguishes_omitted_null_and_zero(client, db_session, make_item, operator_factory):
    item = make_item()
    _, _, manager = operator_factory(department_role="deputy")
    _, _, staff = operator_factory()
    path = f"/api/costs/items/{item.item_id}"
    assert client.get(path).status_code == 401
    assert client.get(path, headers=staff).json()["can_edit"] is False
    assert client.patch(path + "/standards", json={"standard_purchase_price": "1"}, headers=staff).status_code == 403
    payload = {"standard_purchase_price": "0", "purchase_price_effective_date": "2026-10-27", "standard_work_minutes": "12.50"}
    response = client.patch(path + "/standards", json=payload, headers=manager)
    assert response.status_code == 200, response.text
    foreign_defaults = {"standard_yield_percent": None, "purchase_currency": "KRW", "foreign_purchase_price": None, "purchase_exchange_rate": None}
    assert response.json()["standards"] == {"standard_purchase_price": "0.00", "purchase_price_effective_date": "2026-10-27", "standard_work_minutes": "12.50"} | foreign_defaults
    assert response.json()["currency"] == "KRW" and response.json()["basis"] == "management_standard"
    assert response.json()["process_type_code"] == item.process_type_code == "TR"
    assert client.patch(path + "/standards", json={}, headers=manager).json()["standards"] == response.json()["standards"]
    cleared = client.patch(path + "/standards", json={key: None for key in payload}, headers=manager)
    assert cleared.json()["standards"] == {key: None for key in payload} | foreign_defaults
    db_session.refresh(item)
    assert item.standard_work_minutes is None and item.standard_purchase_price is None


@pytest.mark.parametrize("field,value", [("standard_work_minutes", "-1"), ("standard_work_minutes", "0.001"), ("standard_work_minutes", "10000000000"), ("standard_purchase_price", "-1"), ("standard_purchase_price", "0.001")])
def test_item_invalid_standards_do_not_partially_save(client, db_session, make_item, operator_factory, field, value):
    item = make_item()
    _, _, headers = operator_factory(department_role="primary")
    response = client.patch(f"/api/costs/items/{item.item_id}/standards", json={"purchase_price_effective_date": "2026-10-27", field: value}, headers=headers)
    assert response.status_code == 422
    db_session.refresh(item)
    assert item.purchase_price_effective_date is None


def test_legacy_item_update_price_change_requires_operator_but_same_value_does_not(client, db_session, make_item, operator_factory):
    item = make_item()
    item.standard_purchase_price = Decimal("10.00")
    item.purchase_price_effective_date = date(2026, 10, 1)
    db_session.flush()
    path = f"/api/items/{item.item_id}"
    admin = {"X-Admin-Pin": "0000"}
    response = client.put(path, json={"item_name": "Allowed", "standard_purchase_price": "10"}, headers=admin)
    assert response.status_code == 200, response.text
    response = client.put(path, json={"item_name": "Must not save", "standard_purchase_price": "0"}, headers=admin)
    assert response.status_code == 401
    db_session.refresh(item)
    assert item.item_name == "Allowed" and item.standard_purchase_price == Decimal("10")
    _, _, staff = operator_factory()
    assert client.put(path, json={"standard_purchase_price": "0"}, headers=admin | staff).status_code == 403
    _, _, manager = operator_factory(warehouse_role="deputy")
    assert client.put(path, json={"standard_purchase_price": "0"}, headers=admin | manager).status_code == 200
    assert client.put(path, json={"purchase_price_effective_date": None}, headers=admin).status_code == 401


def test_legacy_item_create_nonnull_price_requires_operator(client, db_session, operator_factory):
    db_session.add(ProductSymbol(slot=1, symbol="4", model_name="Model"))
    db_session.flush()
    payload = {"item_name": "New cost item", "process_type_code": "TR", "model_slots": [1], "initial_quantity": 0, "standard_purchase_price": "0"}
    admin = {"X-Admin-Pin": "0000"}
    assert client.post("/api/items", json=payload, headers=admin).status_code == 401
    assert db_session.query(Item).filter_by(item_name=payload["item_name"]).count() == 0
    _, _, manager = operator_factory(department_role="primary")
    response = client.post("/api/items", json=payload, headers=admin | manager)
    assert response.status_code == 201, response.text


def test_revoked_manager_role_is_checked_again_for_existing_session(client, db_session, operator_factory):
    employee, _, headers = operator_factory(department_role="primary")
    assert client.get("/api/costs/standards", headers=headers).json()["can_edit"] is True
    employee.department_role = "none"
    db_session.flush()
    assert client.get("/api/costs/standards", headers=headers).json()["can_edit"] is False
    assert client.patch("/api/costs/standards", json={"hourly_labor_rate": "100"}, headers=headers).status_code == 403


def test_item_get_is_read_only_and_deleted_roots_are_unavailable(client, db_session, make_item, operator_factory):
    item = make_item()
    _, _, headers = operator_factory()
    audit_count = db_session.query(AdminAuditLog).count()
    path = f"/api/costs/items/{item.item_id}"
    assert client.get(path, headers=headers).status_code == 200
    assert db_session.query(AdminAuditLog).count() == audit_count
    assert db_session.get(SystemSetting, KEY) is None
    assert not db_session.new and not db_session.dirty
    item.deleted_at = utc_now_naive()
    db_session.flush()
    assert client.get(path, headers=headers).status_code == 404


def test_hourly_rate_reuses_existing_purchase_price_precision(client, operator_factory):
    _, _, headers = operator_factory(warehouse_role="primary")
    response = client.patch("/api/costs/standards", json={"hourly_labor_rate": "9999999999999999.99"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["hourly_labor_rate"] == "9999999999999999.99"


def test_accumulated_cost_quantity_is_serialized_as_exact_decimal_string(client, make_item, make_bom, operator_factory):
    root = make_item(name="Root")
    parent = root
    for depth in range(6):
        child = make_item(name=f"Child {depth}")
        make_bom(parent.item_id, child.item_id, Decimal(999))
        parent = child
    _, _, headers = operator_factory()
    response = client.get(f"/api/costs/items/{root.item_id}", headers=headers)
    assert response.status_code == 200
    node = response.json()["tree"]
    assert node["required_quantity"] == "1"
    for _ in range(6):
        node = node["children"][0]
    assert node["required_quantity"] == str(999 ** 6) == "994014980014994001"


def test_direct_cost_quantity_preserves_sqlite_integer_beyond_browser_precision(client, make_item, make_bom, operator_factory):
    root, child = make_item(name="Root"), make_item(name="Child")
    quantity = 2 ** 53 + 1
    make_bom(root.item_id, child.item_id, Decimal(quantity))
    _, _, headers = operator_factory()
    response = client.get(f"/api/costs/items/{root.item_id}", headers=headers)
    assert response.status_code == 200
    node = response.json()["tree"]["children"][0]
    assert node["quantity_per_parent"] == str(quantity) == "9007199254740993"
    assert node["required_quantity"] == str(quantity)
