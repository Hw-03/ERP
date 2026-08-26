from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    DefectInventoryMovement,
    DefectQuarantineRecord,
    Inventory,
    InventoryLocation,
    InventoryOperation,
    InventoryOperationRoleEnum,
    LocationStatusEnum,
    SystemSetting,
    TransactionLog,
)
from app.services import defect_actions as svc
from app.services import inventory as inventory_svc
from app.services.pin_auth import DEFAULT_PIN_HASH


def _actor(db_session) -> Employee:
    actor = Employee(
        employee_code="DEF_TX",
        name="불량 담당",
        role="조립/staff",
        department=DepartmentEnum.ASSEMBLY.value,
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(actor)
    db_session.flush()
    return actor


def _defective_qty(db_session, item_id) -> Decimal:
    row = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == DepartmentEnum.ASSEMBLY,
            InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
        )
        .first()
    )
    return row.quantity if row else Decimal("0")


def test_quarantine_rolls_back_inventory_when_ledger_capture_fails(
    db_session, make_item, monkeypatch
) -> None:
    item = make_item(warehouse_qty=Decimal("5"))
    actor = _actor(db_session)
    db_session.commit()

    def fail_capture(*_args, **_kwargs):
        raise RuntimeError("ledger failure")

    monkeypatch.setattr(svc.inv_effect, "capture_effect", fail_capture)

    with pytest.raises(RuntimeError, match="ledger failure"):
        svc.quarantine_inventory(
            db_session,
            item_id=item.item_id,
            qty=Decimal("2"),
            source="warehouse",
            target_dept=DepartmentEnum.ASSEMBLY,
            source_dept=None,
            actor=actor,
            reason_category="검사 불량",
            reason_memo="rollback proof",
            client_request_id=None,
        )

    db_session.expire_all()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert inv.warehouse_qty == Decimal("5")
    assert _defective_qty(db_session, item.item_id) == Decimal("0")
    assert db_session.query(TransactionLog).count() == 0


def test_unquarantine_rolls_back_inventory_when_ledger_capture_fails(
    db_session, make_item, monkeypatch
) -> None:
    item = make_item(warehouse_qty=Decimal("5"))
    actor = _actor(db_session)
    inventory_svc.mark_defective(
        db_session,
        item.item_id,
        Decimal("2"),
        inventory_svc.DefectSource(
            kind="warehouse",
            target_dept=DepartmentEnum.ASSEMBLY,
        ),
    )
    db_session.commit()

    def fail_capture(*_args, **_kwargs):
        raise RuntimeError("ledger failure")

    monkeypatch.setattr(svc.inv_effect, "capture_effect", fail_capture)

    with pytest.raises(RuntimeError, match="ledger failure"):
        svc.unquarantine_inventory(
            db_session,
            item_id=item.item_id,
            qty=Decimal("1"),
            dept=DepartmentEnum.ASSEMBLY,
            actor=actor,
            reason_category="판정 변경",
            reason_memo="rollback proof",
        )

    db_session.expire_all()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert inv.warehouse_qty == Decimal("3")
    assert _defective_qty(db_session, item.item_id) == Decimal("2")
    assert db_session.query(TransactionLog).count() == 0


def test_quarantine_and_restore_append_defect_movements_with_operations(
    db_session, make_item
) -> None:
    item = make_item(warehouse_qty=Decimal("5"))
    actor = _actor(db_session)
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()

    svc.quarantine_inventory(
        db_session,
        item_id=item.item_id,
        qty=Decimal("2"),
        source="warehouse",
        target_dept=DepartmentEnum.ASSEMBLY,
        source_dept=None,
        actor=actor,
        reason_category="검사 불량",
        reason_memo="원장 검증",
        client_request_id="DEFECT-OP-1",
    )
    record = db_session.query(DefectQuarantineRecord).one()
    svc.unquarantine_inventory(
        db_session,
        record_id=record.record_id,
        item_id=item.item_id,
        qty=Decimal("1"),
        dept=DepartmentEnum.ASSEMBLY,
        actor=actor,
        reason_category="정상 판정",
        reason_memo="복귀",
    )

    operations = db_session.query(InventoryOperation).order_by(InventoryOperation.effective_at).all()
    assert [(operation.domain, operation.action) for operation in operations] == [
        ("defect", "quarantine"),
        ("defect", "restore"),
    ]
    movements = (
        db_session.query(DefectInventoryMovement)
        .order_by(DefectInventoryMovement.effective_at)
        .all()
    )
    assert [movement.quantity_delta for movement in movements] == [2, -1]
    assert {movement.record_id for movement in movements} == {record.record_id}
    logs = db_session.query(TransactionLog).order_by(TransactionLog.created_at).all()
    assert [log.operation_role for log in logs] == [
        InventoryOperationRoleEnum.PRIMARY,
        InventoryOperationRoleEnum.PRIMARY,
    ]
    assert [log.operation_id for log in logs] == [
        operations[0].operation_id,
        operations[1].operation_id,
    ]
