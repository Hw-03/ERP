"""별도 역전 작업 기반 취소 계획·실행 계약."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
import uuid

import pytest

from app.models import (
    DefectInventoryMovement,
    DefectQuarantineRecord,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    HandoverDoc,
    HandoverLine,
    HandoverStatusEnum,
    Inventory,
    InventoryLocation,
    InventoryOperation,
    InventoryOperationKindEnum,
    InventoryOperationRoleEnum,
    InventoryOperationEffect,
    ShippingAllocation,
    ShippingRequest,
    ShippingRequestStatusEnum,
    SystemSetting,
    TransactionEditLog,
    TransactionLog,
    TransactionTypeEnum,
    LocationStatusEnum,
    BoxSizeEnum,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
    WarehouseUnplacedItem,
)
from app.services import inv_effect
from app.services import inventory as inventory_svc
from app.services import defect_actions as defect_actions_svc
from app.services import inventory_operation_cancellation as cancellation_svc
from app.services import inventory_operations as operation_svc
from app.services import handover as handover_svc
from app.services import transaction_actions
from app.services.pin_auth import DEFAULT_PIN_HASH


def _actor(db_session) -> Employee:
    actor = Employee(
        employee_code="CANCEL-LEDGER",
        name="취소 작업자",
        role="창고/관리자",
        department="창고",
        level=EmployeeLevelEnum.ADMIN,
        warehouse_role="primary",
        department_role="none",
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(actor)
    db_session.flush()
    return actor


def _receive_operation(db_session, item, actor: Employee, quantity: int) -> InventoryOperation:
    operation = operation_svc._create_business_operation(
        db_session,
        domain="inventory_io",
        action="receive",
        display_label="입고",
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
        department="창고",
        effective_at=datetime(2026, 8, 25, 3, 0),
    )
    assert operation is not None
    before = inv_effect._snapshot_cells(db_session, item.item_id)
    inventory_svc._receive_confirmed(
        db_session,
        item.item_id,
        Decimal(quantity),
        bucket="warehouse",
    )
    inventory = inventory_svc._get_or_create_inventory(db_session, item.item_id)
    log = operation_svc._attach_transaction(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=Decimal(quantity),
            quantity_before=Decimal("0"),
            quantity_after=inventory.quantity,
            produced_by=actor.name,
            producer_employee_id=actor.employee_id,
            department="창고",
            **inv_effect._capture_log_stock_snapshot(db_session, item.item_id, before),
        ),
        operation,
        InventoryOperationRoleEnum.PRIMARY,
    )
    db_session.add(log)
    db_session.commit()
    return operation


def _reserve_shipping(db_session, item, quantity: int) -> None:
    request = ShippingRequest(
        status=ShippingRequestStatusEnum.PREPARED,
        base_pf_item_id=item.item_id,
        request_quantity=1,
    )
    db_session.add(request)
    db_session.flush()
    db_session.add(
        ShippingAllocation(
            request_id=request.request_id,
            item_id=item.item_id,
            quantity=quantity,
            department=None,
            status="RESERVED",
        )
    )
    db_session.commit()


def test_cancel_creates_separate_reversal_operation_and_opposite_log(
    db_session, make_item
) -> None:
    item = make_item(name="역전 입고", warehouse_qty=Decimal("0"))
    actor = _actor(db_session)
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()
    original = _receive_operation(db_session, item, actor, 7)

    preview = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )
    assert preview.can_cancel is True
    assert preview.cells[0].current_quantity == 7
    assert preview.cells[0].quantity_after == 0

    reversal = cancellation_svc.cancel_operation(
        db_session,
        operation_id=original.operation_id,
        canceller=actor,
        reason="입고 취소",
        plan_hash=preview.plan_hash,
        now=datetime(2026, 8, 25, 3, 0),
    )

    db_session.expire_all()
    operations = db_session.query(InventoryOperation).order_by(InventoryOperation.created_at).all()
    assert [operation.kind for operation in operations] == [
        InventoryOperationKindEnum.BUSINESS,
        InventoryOperationKindEnum.CANCELLATION,
    ]
    assert reversal.reverses_operation_id == original.operation_id
    logs = db_session.query(TransactionLog).order_by(TransactionLog.created_at).all()
    assert len(logs) == 2
    assert logs[0].cancelled is False
    assert logs[1].reverses_log_id == logs[0].log_id
    assert logs[1].quantity_change == Decimal("-7")
    inventory = inventory_svc._get_or_create_inventory(db_session, item.item_id)
    assert inventory.warehouse_qty == Decimal("0")


def test_quantity_correction_cannot_reduce_below_active_shipping_reservation(
    db_session,
    make_item,
) -> None:
    item = make_item(name="출하 예약 보정 차단", warehouse_qty=Decimal("0"))
    actor = _actor(db_session)
    db_session.add(
        SystemSetting(
            setting_key=operation_svc.CUTOVER_SETTING_KEY,
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()
    operation = _receive_operation(db_session, item, actor, 10)
    source_log = db_session.query(TransactionLog).filter_by(
        operation_id=operation.operation_id
    ).one()
    _reserve_shipping(db_session, item, 10)

    with pytest.raises(transaction_actions.TransactionQuantityCorrectionShortage):
        transaction_actions.correct_transaction_quantity(
            db_session,
            log_id=source_log.log_id,
            editor=actor,
            new_quantity=Decimal("1"),
            reason="출하 예약 침범 보정",
            request=None,
        )

    db_session.expire_all()
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert inventory.warehouse_qty == Decimal("10")
    assert db_session.query(InventoryOperation).count() == 1
    assert db_session.query(TransactionEditLog).count() == 0


def test_cancellation_preview_counts_active_shipping_reservation(
    db_session,
    make_item,
) -> None:
    item = make_item(name="출하 예약 취소 차단", warehouse_qty=Decimal("0"))
    actor = _actor(db_session)
    db_session.add(
        SystemSetting(
            setting_key=operation_svc.CUTOVER_SETTING_KEY,
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()
    operation = _receive_operation(db_session, item, actor, 10)
    _reserve_shipping(db_session, item, 10)

    preview = cancellation_svc.preview_cancellation(
        db_session,
        operation.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )

    assert preview.can_cancel is False
    assert cancellation_svc.INSUFFICIENT_STOCK_MESSAGE in preview.blockers
    warehouse_cell = next(cell for cell in preview.cells if cell.scope == "warehouse")
    assert warehouse_cell.reserved_quantity == 10


def test_v2_preview_rejects_stock_used_after_the_recorded_physical_effect(
    db_session,
    make_item,
) -> None:
    item = make_item(name="후속 사용 차단", warehouse_qty=Decimal("0"))
    actor = _actor(db_session)
    db_session.add(
        SystemSetting(
            setting_key=operation_svc.CUTOVER_SETTING_KEY,
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()
    original = _receive_operation(db_session, item, actor, 7)

    initial = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )
    assert initial.can_cancel is True
    assert initial.warnings == ()
    unplaced_cells = [
        cell for cell in initial.cells if cell.scope == "warehouse_unplaced"
    ]
    assert len(unplaced_cells) == 1
    assert unplaced_cells[0].row_id is not None

    inventory_svc._receive_confirmed(
        db_session,
        item.item_id,
        Decimal("1"),
        bucket="warehouse",
    )
    db_session.commit()

    changed = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )
    assert changed.can_cancel is False
    assert cancellation_svc.PHYSICAL_ROW_CHANGED_MESSAGE in changed.blockers


def test_v2_preview_rejects_box_row_with_mismatched_container_id(
    db_session,
    make_item,
) -> None:
    item = make_item(name="잘못된 박스 식별자", warehouse_qty=Decimal("2"))
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    angle = WarehouseAngle(label="v2-box-id", rows=1, layers=1, jaris_per_cell=1)
    db_session.add(angle)
    db_session.flush()
    box = WarehouseBox(
        angle_id=angle.id,
        row_no=1,
        layer_no=1,
        jari_index=0,
        size=BoxSizeEnum.SMALL,
    )
    db_session.add(box)
    db_session.flush()
    box_row = WarehouseBoxItem(
        box_id=box.box_id,
        item_id=item.item_id,
        quantity=2,
    )
    db_session.add(box_row)
    db_session.query(WarehouseUnplacedItem).filter_by(
        item_id=item.item_id
    ).one().quantity = 0
    operation = InventoryOperation(
        kind=InventoryOperationKindEnum.BUSINESS,
        domain="inventory_io",
        action="receive",
        display_label="잘못된 박스 식별자",
        actor_name="tester",
        effective_at=datetime(2026, 8, 25, 3, 0),
        contract_version=2,
    )
    db_session.add(operation)
    db_session.flush()
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=2,
            quantity_before=0,
            quantity_after=2,
            produced_by="tester",
            operation_id=operation.operation_id,
            operation_role=InventoryOperationRoleEnum.PRIMARY,
            inventory_effect=[
                {
                    "scope": "warehouse",
                    "row_id": str(inventory.inventory_id),
                    "before_quantity": 0,
                    "after_quantity": 2,
                    "delta": 2,
                },
                {
                    "scope": "warehouse_box",
                    "row_id": str(box_row.id),
                    "box_id": str(uuid.uuid4()),
                    "before_quantity": 0,
                    "after_quantity": 2,
                    "delta": 2,
                },
            ],
        )
    )
    db_session.commit()

    preview = cancellation_svc.preview_cancellation(
        db_session,
        operation.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )

    assert preview.can_cancel is False
    assert cancellation_svc.PHYSICAL_ROW_CHANGED_MESSAGE in preview.blockers


def test_v1_warehouse_only_effect_warns_and_never_inferrs_a_physical_location(
    db_session,
    make_item,
) -> None:
    item = make_item(name="레거시 위치 미추정", warehouse_qty=Decimal("2"))
    operation = InventoryOperation(
        kind=InventoryOperationKindEnum.BUSINESS,
        domain="legacy",
        action="receive",
        display_label="레거시 입고",
        actor_name="legacy",
        effective_at=datetime(2026, 8, 25, 3, 0),
        contract_version=1,
    )
    db_session.add(operation)
    db_session.flush()
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=2,
            quantity_before=0,
            quantity_after=2,
            produced_by="legacy",
            operation_id=operation.operation_id,
            operation_role=InventoryOperationRoleEnum.PRIMARY,
            inventory_effect=[{"scope": "warehouse", "delta": 2}],
        )
    )
    db_session.commit()

    preview = cancellation_svc.preview_cancellation(
        db_session,
        operation.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )

    assert preview.can_cancel is False
    assert preview.warnings == (cancellation_svc.LEGACY_EFFECT_WARNING,)
    assert cancellation_svc.LEGACY_EFFECT_BLOCKER in preview.blockers


def test_v1_box_effect_without_stable_row_id_is_quarantined(
    db_session,
    make_item,
) -> None:
    item = make_item(name="레거시 박스 행 미추정", warehouse_qty=Decimal("2"))
    angle = WarehouseAngle(label="legacy", rows=1, layers=1, jaris_per_cell=1)
    db_session.add(angle)
    db_session.flush()
    box = WarehouseBox(
        angle_id=angle.id,
        row_no=1,
        layer_no=1,
        jari_index=0,
        size=BoxSizeEnum.SMALL,
    )
    db_session.add(box)
    db_session.flush()
    db_session.add(
        WarehouseBoxItem(box_id=box.box_id, item_id=item.item_id, quantity=2)
    )
    unplaced = (
        db_session.query(WarehouseUnplacedItem)
        .filter(WarehouseUnplacedItem.item_id == item.item_id)
        .one()
    )
    unplaced.quantity = 0
    operation = InventoryOperation(
        kind=InventoryOperationKindEnum.BUSINESS,
        domain="legacy",
        action="receive",
        display_label="레거시 박스 입고",
        actor_name="legacy",
        effective_at=datetime(2026, 8, 25, 3, 0),
        contract_version=1,
    )
    db_session.add(operation)
    db_session.flush()
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=2,
            quantity_before=0,
            quantity_after=2,
            produced_by="legacy",
            operation_id=operation.operation_id,
            operation_role=InventoryOperationRoleEnum.PRIMARY,
            inventory_effect=[
                {"scope": "warehouse", "delta": 2},
                {
                    "scope": "warehouse_box",
                    "box_id": str(box.box_id),
                    "delta": 2,
                },
            ],
        )
    )
    db_session.commit()

    preview = cancellation_svc.preview_cancellation(
        db_session,
        operation.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )

    assert preview.can_cancel is False
    assert preview.warnings == (cancellation_svc.LEGACY_EFFECT_WARNING,)
    assert cancellation_svc.LEGACY_EFFECT_BLOCKER in preview.blockers


def test_cancel_blocks_original_operation_after_quantity_correction(
    db_session,
    make_item,
) -> None:
    item = make_item(name="보정 뒤 원작업 취소", warehouse_qty=Decimal("0"))
    actor = _actor(db_session)
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()
    original = _receive_operation(db_session, item, actor, 10)
    source_log = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.operation_id == original.operation_id)
        .one()
    )

    transaction_actions.correct_transaction_quantity(
        db_session,
        log_id=source_log.log_id,
        editor=actor,
        new_quantity=Decimal("12"),
        reason="입고 수량 보정",
        request=None,
    )

    preview = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )
    assert preview.can_cancel is False
    assert cancellation_svc.CORRECTED_OPERATION_MESSAGE in preview.blockers
    with pytest.raises(cancellation_svc.CancellationNotAllowed):
        cancellation_svc.cancel_operation(
            db_session,
            operation_id=original.operation_id,
            canceller=actor,
            reason="보정된 원작업 취소 시도",
            plan_hash=preview.plan_hash,
            now=datetime(2026, 8, 25, 3, 0),
        )

    db_session.expire_all()
    inventory = inventory_svc._get_or_create_inventory(db_session, item.item_id)
    assert inventory.warehouse_qty == Decimal("12")
    assert db_session.query(InventoryOperation).count() == 2
    assert db_session.query(TransactionLog).count() == 2
    assert db_session.query(TransactionEditLog).count() == 1


def test_cancel_rejects_stale_plan_without_partial_change(db_session, make_item) -> None:
    item = make_item(name="해시 변경 입고", warehouse_qty=Decimal("0"))
    actor = _actor(db_session)
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()
    original = _receive_operation(db_session, item, actor, 7)
    preview = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )
    inventory_svc._consume_warehouse(db_session, item.item_id, Decimal("1"))
    db_session.commit()

    with pytest.raises(cancellation_svc.CancellationPlanChanged):
        cancellation_svc.cancel_operation(
            db_session,
            operation_id=original.operation_id,
            canceller=actor,
            reason="입고 취소",
            plan_hash=preview.plan_hash,
            now=datetime(2026, 8, 25, 3, 0),
        )

    assert db_session.query(InventoryOperation).count() == 1
    assert db_session.query(TransactionLog).count() == 1
    inventory = inventory_svc._get_or_create_inventory(db_session, item.item_id)
    assert inventory.warehouse_qty == Decimal("6")


def test_cancel_blocks_insufficient_stock_without_writing_any_reversal(
    db_session, make_item
) -> None:
    item = make_item(name="부족 취소", warehouse_qty=Decimal("0"))
    actor = _actor(db_session)
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()
    original = _receive_operation(db_session, item, actor, 7)
    inventory_svc._consume_warehouse(db_session, item.item_id, Decimal("7"))
    db_session.commit()

    preview = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )
    assert preview.can_cancel is False
    assert cancellation_svc.INSUFFICIENT_STOCK_MESSAGE in preview.blockers
    with pytest.raises(cancellation_svc.CancellationNotAllowed):
        cancellation_svc.cancel_operation(
            db_session,
            operation_id=original.operation_id,
            canceller=actor,
            reason="입고 취소",
            plan_hash=preview.plan_hash,
            now=datetime(2026, 8, 25, 3, 0),
        )

    assert db_session.query(InventoryOperation).count() == 1
    assert db_session.query(TransactionLog).count() == 1


def test_cancel_blocks_when_reversal_would_intrude_on_reserved_stock(
    db_session, make_item
) -> None:
    item = make_item(name="예약 침범 취소", warehouse_qty=Decimal("0"))
    actor = _actor(db_session)
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()
    original = _receive_operation(db_session, item, actor, 7)
    inventory_svc.reserve(db_session, item.item_id, Decimal("1"), employee=actor)
    db_session.commit()

    preview = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )

    assert preview.can_cancel is False
    assert preview.cells[0].current_quantity == 7
    assert preview.cells[0].reserved_quantity == 1
    assert cancellation_svc.INSUFFICIENT_STOCK_MESSAGE in preview.blockers


def test_cancel_rolls_back_every_change_when_reversal_fails_midway(
    db_session, make_item, monkeypatch
) -> None:
    item = make_item(name="중간 실패 취소", warehouse_qty=Decimal("0"))
    actor = _actor(db_session)
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()
    original = _receive_operation(db_session, item, actor, 7)
    preview = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )
    reverse_log = cancellation_svc._reverse_log

    def fail_after_inventory_change(*args, **kwargs):
        reverse_log(*args, **kwargs)
        raise RuntimeError("강제 중간 실패")

    monkeypatch.setattr(cancellation_svc, "_reverse_log", fail_after_inventory_change)

    with pytest.raises(RuntimeError, match="강제 중간 실패"):
        cancellation_svc.cancel_operation(
            db_session,
            operation_id=original.operation_id,
            canceller=actor,
            reason="실패 검증",
            plan_hash=preview.plan_hash,
            now=datetime(2026, 8, 25, 3, 0),
        )

    assert db_session.query(InventoryOperation).count() == 1
    assert db_session.query(TransactionLog).count() == 1
    inventory = inventory_svc._get_or_create_inventory(db_session, item.item_id)
    assert inventory.warehouse_qty == Decimal("7")


def test_cancel_rolls_back_when_post_apply_inventory_invariant_does_not_match_plan(
    db_session, make_item, monkeypatch
) -> None:
    item = make_item(name="사후 검산 취소", warehouse_qty=Decimal("0"))
    actor = _actor(db_session)
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()
    original = _receive_operation(db_session, item, actor, 7)
    preview = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )
    reverse_log = cancellation_svc._reverse_log

    def corrupt_after_reverse(*args, **kwargs):
        result = reverse_log(*args, **kwargs)
        inventory = inventory_svc._get_or_create_inventory(db_session, item.item_id)
        inventory.warehouse_qty += Decimal("1")
        inventory.quantity += Decimal("1")
        db_session.flush()
        return result

    monkeypatch.setattr(cancellation_svc, "_reverse_log", corrupt_after_reverse)

    with pytest.raises(
        cancellation_svc.CancellationNotAllowed,
        match="취소 적용 후 재고 검산에 실패했습니다",
    ):
        cancellation_svc.cancel_operation(
            db_session,
            operation_id=original.operation_id,
            canceller=actor,
            reason="사후 검산",
            plan_hash=preview.plan_hash,
            now=datetime(2026, 8, 25, 3, 0),
        )

    assert db_session.query(InventoryOperation).count() == 1
    assert db_session.query(TransactionLog).count() == 1
    inventory = inventory_svc._get_or_create_inventory(db_session, item.item_id)
    assert inventory.warehouse_qty == Decimal("7")


def test_cancel_uses_equivalent_replenished_stock_instead_of_provenance(
    db_session, make_item
) -> None:
    item = make_item(name="동등 재입고 취소", warehouse_qty=Decimal("0"))
    actor = _actor(db_session)
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()
    original = _receive_operation(db_session, item, actor, 7)
    inventory_svc._consume_warehouse(db_session, item.item_id, Decimal("7"))
    inventory_svc._receive_confirmed(
        db_session,
        item.item_id,
        Decimal("7"),
        bucket="warehouse",
    )
    db_session.commit()

    preview = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )
    assert preview.can_cancel is True
    cancellation_svc.cancel_operation(
        db_session,
        operation_id=original.operation_id,
        canceller=actor,
        reason="입고 취소",
        plan_hash=preview.plan_hash,
        now=datetime(2026, 8, 25, 3, 0),
    )
    inventory = inventory_svc._get_or_create_inventory(db_session, item.item_id)
    assert inventory.warehouse_qty == Decimal("0")


def test_previous_week_operation_is_blocked_with_confirmed_message(
    db_session, make_item
) -> None:
    item = make_item(name="전주 취소", warehouse_qty=Decimal("0"))
    actor = _actor(db_session)
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()
    original = _receive_operation(db_session, item, actor, 1)
    original.effective_at = datetime(2026, 8, 16, 14, 59)
    db_session.commit()

    preview = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )
    assert preview.can_cancel is False
    assert preview.blockers == (cancellation_svc.PREVIOUS_WEEK_MESSAGE,)


def test_kst_monday_boundary_blocks_sunday_operation_immediately(
    db_session, make_item
) -> None:
    item = make_item(name="주차 경계 취소", warehouse_qty=Decimal("0"))
    actor = _actor(db_session)
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()
    original = _receive_operation(db_session, item, actor, 1)
    original.effective_at = datetime(2026, 8, 23, 14, 59, 59)  # 일요일 23:59:59 KST
    db_session.commit()

    sunday_preview = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 23, 14, 59, 59),
    )
    monday_preview = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 23, 15, 0, 0),  # 월요일 00:00:00 KST
    )

    assert sunday_preview.can_cancel is True
    assert monday_preview.can_cancel is False
    assert monday_preview.blockers == (cancellation_svc.PREVIOUS_WEEK_MESSAGE,)


def test_cancel_quarantine_reverses_physical_stock_and_defect_ledger(
    db_session, make_item
) -> None:
    item = make_item(name="격리 취소", warehouse_qty=Decimal("5"))
    actor = _actor(db_session)
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()
    defect_actions_svc.quarantine_inventory(
        db_session,
        item_id=item.item_id,
        qty=Decimal("2"),
        source="warehouse",
        target_dept=DepartmentEnum.ASSEMBLY,
        source_dept=None,
        actor=actor,
        reason_category="검사 불량",
        reason_memo="취소 검증",
        client_request_id="DEFECT-CANCEL-1",
    )
    original = (
        db_session.query(InventoryOperation)
        .filter(InventoryOperation.kind == InventoryOperationKindEnum.BUSINESS)
        .one()
    )
    original.effective_at = datetime(2026, 8, 25, 3, 0)
    db_session.commit()
    preview = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )

    cancellation_svc.cancel_operation(
        db_session,
        operation_id=original.operation_id,
        canceller=actor,
        reason="격리 실수",
        plan_hash=preview.plan_hash,
        now=datetime(2026, 8, 25, 3, 0),
    )

    record = db_session.query(DefectQuarantineRecord).one()
    assert record.remaining_quantity == Decimal("0")
    movements = (
        db_session.query(DefectInventoryMovement)
        .order_by(DefectInventoryMovement.created_at)
        .all()
    )
    assert [movement.quantity_delta for movement in movements] == [2, -2]
    assert movements[1].reverses_movement_id == movements[0].movement_id
    inventory = inventory_svc._get_or_create_inventory(db_session, item.item_id)
    assert inventory.warehouse_qty == Decimal("5")


def test_handover_cancel_requires_exact_legacy_contract_and_closes_workflow(
    db_session, make_item, make_location
) -> None:
    item = make_item(name="인수인계 취소", warehouse_qty=Decimal("0"))
    make_location(
        item.item_id,
        department=DepartmentEnum.TUBE,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("2"),
    )
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    inventory.quantity = Decimal("2")
    author = _actor(db_session)
    receiver = Employee(
        employee_code="HANDOVER-CANCEL",
        name="고압 인수자",
        role="고압/사원",
        department=DepartmentEnum.HIGH_VOLTAGE,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role="none",
        department_role="none",
        display_order=1,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(receiver)
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    document = HandoverDoc(
        handover_code="HO-CANCEL-1",
        status=HandoverStatusEnum.SUBMITTED,
        author_employee_id=author.employee_id,
        author_name=author.name,
        from_department=DepartmentEnum.TUBE.value,
        to_department=DepartmentEnum.HIGH_VOLTAGE.value,
        title="취소 검증",
    )
    db_session.add(document)
    db_session.flush()
    db_session.add(
        HandoverLine(
            handover_id=document.handover_id,
            item_id=item.item_id,
            item_name_snapshot=item.item_name,
            quantity=Decimal("2"),
        )
    )
    db_session.commit()

    handover_svc.receive_handover(
        db_session,
        document.handover_id,
        actor=receiver,
        pin="0000",
    )
    original = (
        db_session.query(InventoryOperation)
        .filter(InventoryOperation.domain == "handover")
        .one()
    )
    original.effective_at = datetime(2026, 8, 25, 3, 0)
    db_session.commit()

    effect = (
        db_session.query(InventoryOperationEffect)
        .filter(InventoryOperationEffect.operation_id == original.operation_id)
        .one()
    )
    effect.after_state = {"status": HandoverStatusEnum.SUBMITTED.value}
    db_session.commit()
    malformed_preview = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )
    assert malformed_preview.can_cancel is False
    assert malformed_preview.reason_code == cancellation_svc.WORKFLOW_CANCEL_UNSUPPORTED
    with pytest.raises(cancellation_svc.WorkflowCancellationConflict) as malformed:
        cancellation_svc.cancel_operation(
            db_session,
            operation_id=original.operation_id,
            canceller=receiver,
            reason="변형된 인수인계 효과 취소 차단",
            plan_hash=malformed_preview.plan_hash,
            now=datetime(2026, 8, 25, 3, 0),
        )
    assert malformed.value.reason_code == cancellation_svc.WORKFLOW_CANCEL_UNSUPPORTED

    effect.after_state = {"status": HandoverStatusEnum.RECEIVED.value}
    linked_request = ShippingRequest(
        status=ShippingRequestStatusEnum.PREPARING,
        base_pf_item_id=item.item_id,
        request_quantity=1,
    )
    db_session.add(linked_request)
    db_session.flush()
    original_log = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.operation_id == original.operation_id)
        .one()
    )
    original_log.shipping_request_id = linked_request.request_id
    db_session.commit()
    linked_preview = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )
    assert linked_preview.can_cancel is False
    assert linked_preview.reason_code == cancellation_svc.WORKFLOW_CANCEL_UNSUPPORTED
    with pytest.raises(cancellation_svc.WorkflowCancellationConflict) as linked:
        cancellation_svc.cancel_operation(
            db_session,
            operation_id=original.operation_id,
            canceller=receiver,
            reason="연결된 인수인계 로그 취소 차단",
            plan_hash=linked_preview.plan_hash,
            now=datetime(2026, 8, 25, 3, 0),
        )
    assert linked.value.reason_code == cancellation_svc.WORKFLOW_CANCEL_UNSUPPORTED
    assert db_session.query(InventoryOperation).count() == 1
    assert db_session.query(InventoryOperationEffect).count() == 1
    db_session.refresh(document)
    assert document.status == HandoverStatusEnum.RECEIVED
    location_quantities = dict(
        db_session.query(InventoryLocation.department, InventoryLocation.quantity)
        .filter(
            InventoryLocation.item_id == item.item_id,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .all()
    )
    assert location_quantities[DepartmentEnum.TUBE] == Decimal("0")
    assert location_quantities[DepartmentEnum.HIGH_VOLTAGE] == Decimal("2")

    original_log.shipping_request_id = None
    db_session.commit()
    preview = cancellation_svc.preview_cancellation(
        db_session,
        original.operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )
    assert preview.can_cancel is True
    cancellation_svc.cancel_operation(
        db_session,
        operation_id=original.operation_id,
        canceller=receiver,
        reason="인수 처리 취소",
        plan_hash=preview.plan_hash,
        now=datetime(2026, 8, 25, 3, 0),
    )

    db_session.refresh(document)
    assert document.status == HandoverStatusEnum.CANCELLED
    tube_stock = (
        db_session.query(InventoryLocation.quantity)
        .filter(
            InventoryLocation.item_id == item.item_id,
            InventoryLocation.department == DepartmentEnum.TUBE,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .scalar()
    )
    high_voltage_stock = (
        db_session.query(InventoryLocation.quantity)
        .filter(
            InventoryLocation.item_id == item.item_id,
            InventoryLocation.department == DepartmentEnum.HIGH_VOLTAGE,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .scalar()
    )
    assert tube_stock == Decimal("2")
    assert high_voltage_stock in {None, Decimal("0")}
    effects = db_session.query(InventoryOperationEffect).all()
    assert len(effects) == 2
    assert effects[1].reverses_effect_id == effects[0].effect_id
