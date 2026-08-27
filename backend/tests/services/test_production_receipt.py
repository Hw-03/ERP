from __future__ import annotations

import inspect
from decimal import Decimal

import pytest

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    InventoryOperation,
    InventoryOperationRoleEnum,
    LocationStatusEnum,
    SystemSetting,
    TransactionLog,
    TransactionTypeEnum,
)
from app.schemas import ProductionReceiptRequest
from app.services.production_receipt import (
    ProductionShortage,
    execute_production_receipt,
)
from app.services import production_receipt as production_receipt_svc
from app.services.pin_auth import hash_pin


def test_production_receipt_public_service_requires_employee_actor() -> None:
    parameters = inspect.signature(execute_production_receipt).parameters

    assert "actor" in parameters
    assert parameters["actor"].default is inspect.Parameter.empty
    assert "producer_name" not in parameters
    assert "producer_id" not in parameters


@pytest.fixture()
def production_actor(db_session) -> Employee:
    actor = Employee(
        employee_code="PROD-SVC",
        name="서버 생산자",
        role=f"{DepartmentEnum.ASSEMBLY.value}/staff",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active=True,
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    db_session.add(actor)
    db_session.flush()
    return actor


def test_production_receipt_rejects_missing_or_non_employee_actor(
    db_session, make_item
) -> None:
    produced = make_item(name="actor-required-product", process_type_code="PF")
    payload = ProductionReceiptRequest(item_id=produced.item_id, quantity=1)

    with pytest.raises(TypeError):
        execute_production_receipt(db_session, payload, produced)
    with pytest.raises(TypeError, match="Employee"):
        execute_production_receipt(db_session, payload, produced, actor="spoof")


def _warehouse_qty(db_session, item):
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    return inv.warehouse_qty or Decimal("0")


def _location_qty(db_session, item, dept):
    loc = db_session.query(InventoryLocation).filter(
        InventoryLocation.item_id == item.item_id,
        InventoryLocation.department == dept,
        InventoryLocation.status == LocationStatusEnum.PRODUCTION,
    ).first()
    return loc.quantity if loc else Decimal("0")


def _effect_scopes(log):
    return {entry.get("scope") for entry in (log.inventory_effect or [])}


def test_production_receipt_uses_process_department_locations(
    db_session, make_item, make_bom, make_location, production_actor
):
    component = make_item(
        name="Tube component",
        process_type_code="TR",
        warehouse_qty=Decimal("10"),
        model_symbol="3",
        serial_no=1,
    )
    produced = make_item(
        name="Final PF",
        process_type_code="PF",
        warehouse_qty=Decimal("0"),
        model_symbol="3",
        serial_no=2,
    )
    make_bom(produced.item_id, component.item_id, Decimal("1"))
    make_location(component.item_id, department=DepartmentEnum.TUBE, quantity=Decimal("2"))
    db_session.commit()

    result = execute_production_receipt(
        db_session,
        ProductionReceiptRequest(
            item_id=produced.item_id,
            quantity=1,
            produced_by="위조 생산자",
            producer_employee_code="SPOOF",
        ),
        produced,
        actor=production_actor,
    )

    assert len(result["transaction_ids"]) == 2
    assert _warehouse_qty(db_session, component) == Decimal("10")
    assert _warehouse_qty(db_session, produced) == Decimal("0")
    assert _location_qty(db_session, component, DepartmentEnum.TUBE) == Decimal("1")
    assert _location_qty(db_session, produced, DepartmentEnum.SHIPPING) == Decimal("1")

    logs = db_session.query(TransactionLog).order_by(TransactionLog.created_at).all()
    assert [log.transaction_type for log in logs] == [
        TransactionTypeEnum.BACKFLUSH,
        TransactionTypeEnum.PRODUCE,
    ]
    assert all(_effect_scopes(log) <= {"location"} for log in logs)
    assert all(log.produced_by == production_actor.name for log in logs)
    assert all(log.producer_employee_id == production_actor.employee_id for log in logs)


def test_production_receipt_records_one_operation_with_explicit_line_roles(
    db_session, make_item, make_bom, make_location, production_actor
):
    component = make_item(name="operation component", process_type_code="TR")
    produced = make_item(name="operation PF", process_type_code="PF")
    make_bom(produced.item_id, component.item_id, Decimal("1"))
    make_location(component.item_id, department=DepartmentEnum.TUBE, quantity=Decimal("2"))
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()

    execute_production_receipt(
        db_session,
        ProductionReceiptRequest(
            item_id=produced.item_id,
            quantity=1,
            produced_by="operator",
            reference_no="PROD-OP-1",
        ),
        produced,
        actor=production_actor,
    )

    operation = db_session.query(InventoryOperation).one()
    assert operation.domain == "production"
    assert operation.action == "receipt"
    assert operation.display_label == "생산"
    logs = db_session.query(TransactionLog).order_by(TransactionLog.created_at).all()
    assert {log.operation_id for log in logs} == {operation.operation_id}
    assert [log.operation_role for log in logs] == [
        InventoryOperationRoleEnum.COMPONENT_INPUT,
        InventoryOperationRoleEnum.PRODUCT_OUTPUT,
    ]


def test_production_receipt_prelocks_produced_and_component_items_together(
    db_session, make_item, make_bom, make_location, monkeypatch, production_actor
):
    component = make_item(
        name="receipt-lock-component",
        process_type_code="TR",
        warehouse_qty=Decimal("0"),
    )
    produced = make_item(
        name="receipt-lock-produced",
        process_type_code="PF",
        warehouse_qty=Decimal("0"),
    )
    make_bom(produced.item_id, component.item_id, Decimal("1"))
    make_location(component.item_id, department=DepartmentEnum.TUBE, quantity=Decimal("2"))
    events = []
    real_lock = production_receipt_svc.inventory_svc.lock_inventories

    def lock_inventories(db, item_ids):
        events.append(item_ids)
        return real_lock(db, item_ids)

    monkeypatch.setattr(
        production_receipt_svc.inventory_svc,
        "lock_inventories",
        lock_inventories,
    )

    execute_production_receipt(
        db_session,
        ProductionReceiptRequest(item_id=produced.item_id, quantity=1, produced_by="operator"),
        produced,
        actor=production_actor,
    )

    assert events[0] == sorted({component.item_id, produced.item_id})


def test_production_receipt_blocks_when_department_location_is_short(
    db_session, make_item, make_bom, production_actor
):
    component = make_item(
        name="Tube component",
        process_type_code="TR",
        warehouse_qty=Decimal("10"),
        model_symbol="3",
        serial_no=1,
    )
    produced = make_item(
        name="Final PF",
        process_type_code="PF",
        warehouse_qty=Decimal("0"),
        model_symbol="3",
        serial_no=2,
    )
    make_bom(produced.item_id, component.item_id, Decimal("1"))
    db_session.commit()

    with pytest.raises(ProductionShortage) as exc:
        execute_production_receipt(
            db_session,
            ProductionReceiptRequest(item_id=produced.item_id, quantity=1, produced_by="operator"),
            produced,
            actor=production_actor,
        )

    message = "\n".join(exc.value.shortages)
    assert component.mes_code in message
    assert "Tube component" in message
    assert DepartmentEnum.TUBE.value in message
    assert "0" in message
    assert "1" in message
    assert _warehouse_qty(db_session, component) == Decimal("10")


def test_production_receipt_skips_flagged_bom_component_inventory(
    db_session, make_item, make_bom, production_actor
):
    component = make_item(
        name="롤 단위 BOM 자재",
        process_type_code="TR",
        warehouse_qty=Decimal("0"),
    )
    component.bom_stock_exempt = True
    produced = make_item(
        name="미반영 자재 사용 생산품",
        process_type_code="PF",
        warehouse_qty=Decimal("0"),
    )
    make_bom(produced.item_id, component.item_id, Decimal("2"))
    db_session.commit()

    result = execute_production_receipt(
        db_session,
        ProductionReceiptRequest(item_id=produced.item_id, quantity=1, produced_by="operator"),
        produced,
        actor=production_actor,
    )

    assert result["backflushed"] == []
    assert len(result["transaction_ids"]) == 1
    assert _location_qty(db_session, component, DepartmentEnum.TUBE) == Decimal("0")
    assert _location_qty(db_session, produced, DepartmentEnum.SHIPPING) == Decimal("1")
    assert [log.item_id for log in db_session.query(TransactionLog).all()] == [produced.item_id]


def test_production_receipt_rolls_back_backflush_when_production_log_fails(
    db_session, make_item, make_bom, make_location, monkeypatch, production_actor
):
    component = make_item(
        name="Tube rollback component",
        process_type_code="TR",
        warehouse_qty=Decimal("0"),
        model_symbol="3",
        serial_no=1,
    )
    produced = make_item(
        name="Rollback PF",
        process_type_code="PF",
        warehouse_qty=Decimal("0"),
        model_symbol="3",
        serial_no=2,
    )
    make_bom(produced.item_id, component.item_id, Decimal("1"))
    make_location(component.item_id, department=DepartmentEnum.TUBE, quantity=Decimal("2"))
    db_session.commit()

    def fail_record(*_args, **_kwargs):
        raise RuntimeError("production ledger failure")

    monkeypatch.setattr(production_receipt_svc, "_record_production", fail_record)

    with pytest.raises(RuntimeError, match="production ledger failure"):
        execute_production_receipt(
            db_session,
            ProductionReceiptRequest(item_id=produced.item_id, quantity=1, produced_by="operator"),
            produced,
            actor=production_actor,
        )

    db_session.expire_all()
    assert _location_qty(db_session, component, DepartmentEnum.TUBE) == Decimal("2")
    assert _location_qty(db_session, produced, DepartmentEnum.SHIPPING) == Decimal("0")
    assert db_session.query(TransactionLog).count() == 0
