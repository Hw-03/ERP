from __future__ import annotations

from decimal import Decimal
import uuid

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


def _defective_qty(
    db_session, item_id, department: DepartmentEnum = DepartmentEnum.WAREHOUSE
) -> Decimal:
    row = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == department,
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

    monkeypatch.setattr(svc.inv_effect, "_capture_effect", fail_capture)

    with pytest.raises(RuntimeError, match="ledger failure"):
        svc.quarantine_inventory(
            db_session,
            item_id=item.item_id,
            qty=Decimal("2"),
            source="warehouse",
            target_dept=DepartmentEnum.WAREHOUSE,
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
    inventory_svc._mark_defective(
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

    monkeypatch.setattr(svc.inv_effect, "_capture_effect", fail_capture)

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
    assert _defective_qty(
        db_session, item.item_id, department=DepartmentEnum.ASSEMBLY
    ) == Decimal("2")
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
        target_dept=DepartmentEnum.WAREHOUSE,
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
        dept=DepartmentEnum.WAREHOUSE,
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


def test_bulk_unquarantine_rolls_back_every_record_when_second_restore_fails(
    db_session, make_item, monkeypatch
) -> None:
    item = make_item(warehouse_qty=Decimal("5"))
    actor = _actor(db_session)
    db_session.commit()
    for memo in ("첫 기록", "둘째 기록"):
        svc.quarantine_inventory(
            db_session,
            item_id=item.item_id,
            qty=Decimal("1"),
            source="warehouse",
            target_dept=DepartmentEnum.WAREHOUSE,
            source_dept=None,
            actor=actor,
            reason_category="검사 불량",
            reason_memo=memo,
            client_request_id=None,
        )
    records = (
        db_session.query(DefectQuarantineRecord)
        .order_by(DefectQuarantineRecord.quarantined_at, DefectQuarantineRecord.record_id)
        .all()
    )
    original_capture = svc.inv_effect._capture_effect
    capture_calls = 0

    def fail_second_restore(*args, **kwargs):
        nonlocal capture_calls
        capture_calls += 1
        if capture_calls == 2:
            raise RuntimeError("second restore ledger failure")
        return original_capture(*args, **kwargs)

    monkeypatch.setattr(svc.inv_effect, "_capture_effect", fail_second_restore)

    with pytest.raises(RuntimeError, match="second restore ledger failure"):
        svc.unquarantine_inventory_bulk(
            db_session,
            lines=[
                svc.BulkUnquarantineLine(
                    record_id=record.record_id,
                    item_id=item.item_id,
                    department=DepartmentEnum.WAREHOUSE,
                    quantity=Decimal("1"),
                )
                for record in records
            ],
            actor=actor,
            reason_category="정상 판정",
            reason_memo="일괄 복귀",
        )

    db_session.expire_all()
    assert [
        record.remaining_quantity
        for record in db_session.query(DefectQuarantineRecord)
        .order_by(DefectQuarantineRecord.quarantined_at, DefectQuarantineRecord.record_id)
        .all()
    ] == [Decimal("1"), Decimal("1")]
    assert _defective_qty(db_session, item.item_id) == Decimal("2")
    assert (
        db_session.query(TransactionLog)
        .filter(TransactionLog.transaction_type == "UNMARK_DEFECTIVE")
        .count()
        == 0
    )


@pytest.mark.parametrize(
    ("mutate_lines", "message"),
    [
        (
            lambda lines: [lines[0], lines[0]],
            "중복",
        ),
        (
            lambda lines: [
                lines[0],
                svc.BulkUnquarantineLine(
                    record_id=lines[1].record_id,
                    item_id=uuid.uuid4(),
                    department=lines[1].department,
                    quantity=lines[1].quantity,
                ),
            ],
            "품목",
        ),
        (
            lambda lines: [
                lines[0],
                svc.BulkUnquarantineLine(
                    record_id=lines[1].record_id,
                    item_id=lines[1].item_id,
                    department=DepartmentEnum.VACUUM,
                    quantity=lines[1].quantity,
                ),
            ],
            "부서",
        ),
    ],
)
def test_bulk_unquarantine_rejects_duplicate_or_mixed_lines_before_mutation(
    db_session, make_item, mutate_lines, message
) -> None:
    item = make_item(warehouse_qty=Decimal("5"))
    actor = _actor(db_session)
    for memo in ("첫 기록", "둘째 기록"):
        svc.quarantine_inventory(
            db_session,
            item_id=item.item_id,
            qty=Decimal("1"),
            source="warehouse",
            target_dept=DepartmentEnum.WAREHOUSE,
            source_dept=None,
            actor=actor,
            reason_category="검사 불량",
            reason_memo=memo,
            client_request_id=None,
        )
    records = db_session.query(DefectQuarantineRecord).all()
    lines = [
        svc.BulkUnquarantineLine(
            record_id=record.record_id,
            item_id=item.item_id,
            department=DepartmentEnum.WAREHOUSE,
            quantity=Decimal("1"),
        )
        for record in records
    ]

    with pytest.raises(ValueError, match=message):
        svc.unquarantine_inventory_bulk(
            db_session,
            lines=mutate_lines(lines),
            actor=actor,
            reason_category=None,
            reason_memo=None,
        )

    db_session.expire_all()
    assert {record.remaining_quantity for record in records} == {Decimal("1")}


def test_bulk_unquarantine_rejects_stale_or_missing_record(
    db_session, make_item
) -> None:
    item = make_item(warehouse_qty=Decimal("5"))
    actor = _actor(db_session)
    svc.quarantine_inventory(
        db_session,
        item_id=item.item_id,
        qty=Decimal("2"),
        source="warehouse",
        target_dept=DepartmentEnum.WAREHOUSE,
        source_dept=None,
        actor=actor,
        reason_category="검사 불량",
        reason_memo="선택 기록",
        client_request_id=None,
    )
    record = db_session.query(DefectQuarantineRecord).one()
    line = svc.BulkUnquarantineLine(
        record_id=record.record_id,
        item_id=item.item_id,
        department=DepartmentEnum.WAREHOUSE,
        quantity=Decimal("1"),
    )

    with pytest.raises(ValueError, match="수량이 변경"):
        svc.unquarantine_inventory_bulk(
            db_session,
            lines=[line],
            actor=actor,
            reason_category=None,
            reason_memo=None,
        )

    missing_line = svc.BulkUnquarantineLine(
        record_id=uuid.uuid4(),
        item_id=item.item_id,
        department=DepartmentEnum.WAREHOUSE,
        quantity=Decimal("2"),
    )
    with pytest.raises(ValueError, match="찾을 수 없습니다"):
        svc.unquarantine_inventory_bulk(
            db_session,
            lines=[missing_line],
            actor=actor,
            reason_category=None,
            reason_memo=None,
        )
