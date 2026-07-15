from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import (
    DepartmentEnum,
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.schemas import ProductionReceiptRequest
from app.services.production_receipt import (
    ProductionShortage,
    execute_production_receipt,
)
from app.services import production_receipt as production_receipt_svc


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
    db_session, make_item, make_bom, make_location
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
        ProductionReceiptRequest(item_id=produced.item_id, quantity=1, produced_by="operator"),
        produced,
        "operator",
        None,
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


def test_production_receipt_blocks_when_department_location_is_short(
    db_session, make_item, make_bom
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
            "operator",
            None,
        )

    message = "\n".join(exc.value.shortages)
    assert component.mes_code in message
    assert "Tube component" in message
    assert DepartmentEnum.TUBE.value in message
    assert "0" in message
    assert "1" in message
    assert _warehouse_qty(db_session, component) == Decimal("10")


def test_production_receipt_rolls_back_backflush_when_production_log_fails(
    db_session, make_item, make_bom, make_location, monkeypatch
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
            "operator",
            None,
        )

    db_session.expire_all()
    assert _location_qty(db_session, component, DepartmentEnum.TUBE) == Decimal("2")
    assert _location_qty(db_session, produced, DepartmentEnum.SHIPPING) == Decimal("0")
    assert db_session.query(TransactionLog).count() == 0
