"""2-A additive schema and canonical location mapping contracts."""

from __future__ import annotations

from sqlalchemy import inspect
import pytest

from app.models import Base, Department, Employee


def test_phase2a_tables_are_registered_without_legacy_inventory_change():
    tables = Base.metadata.tables
    assert {
        "inventory_scopes",
        "stocktake_control",
        "operator_sessions",
        "defect_pool_cutovers",
        "defect_stock_pools",
        "defect_stock_movements",
        "defect_pool_bridges",
    } <= set(tables)
    assert "pin_version" in inspect(Employee).columns
    assert "warehouse_qty" in tables["inventory"].columns


def test_scope_mapper_uses_department_pk_and_coalesces_warehouse_alias():
    from app.services import inventory_scope

    warehouse = inventory_scope.describe_scope(None)
    first = inventory_scope.describe_scope(Department(id=7, name="조립"))
    renamed = inventory_scope.describe_scope(Department(id=7, name="조립부"))

    assert (warehouse.scope_key, warehouse.physical_department) == ("warehouse", "창고")
    assert (first.scope_key, first.physical_department) == ("department:7", "조립")
    assert renamed.scope_key == first.scope_key
    assert renamed.physical_department == "조립부"

    warehouse_department = inventory_scope.describe_scope(Department(id=8, name="창고"))
    assert warehouse_department.scope_key == "warehouse"
    assert warehouse_department.department_id == 8


def test_scope_plan_rejects_unmapped_physical_department():
    from app.services import inventory_scope

    departments = [
        Department(id=7, name="조립", is_active=True),
        Department(id=10, name="창고", is_active=True),
    ]
    planned = inventory_scope.plan_scopes(departments, ["창고", "조립"])
    assert [scope.scope_key for scope in planned] == ["warehouse", "department:7"]
    assert planned[0].department_id == 10

    with pytest.raises(ValueError, match="미등록부서"):
        inventory_scope.plan_scopes(departments, ["창고", "미등록부서"])


def test_control_defaults_to_legacy_without_pool_rows(db_session):
    from app.models import DefectStockPool, StocktakeControl

    db_session.add(StocktakeControl(id=1))
    db_session.flush()
    control = db_session.get(StocktakeControl, 1)
    assert control.inventory_mode == "LEGACY"
    assert control.active_round_id is None
    assert control.epoch == 0
    assert db_session.query(DefectStockPool).count() == 0
