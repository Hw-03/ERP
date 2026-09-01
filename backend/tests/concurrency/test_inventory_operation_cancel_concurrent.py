"""동일 작업 동시 취소는 정확히 한 역전 작업만 남겨야 한다."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from decimal import Decimal

import pytest

from app.models import (
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryOperation,
    InventoryOperationKindEnum,
    InventoryOperationRoleEnum,
    Item,
    SystemSetting,
    TransactionLog,
    TransactionTypeEnum,
    WarehouseUnplacedItem,
)
from app.services import inv_effect
from app.services import inventory as inventory_svc
from app.services import inventory_operation_cancellation as cancellation_svc
from app.services import inventory_operations as operation_svc
from app.services import legacy_inventory_operation_adoption as legacy_adoption_svc
from app.services import transaction_actions
from app.services.pin_auth import DEFAULT_PIN_HASH


def _setup(make_session) -> tuple[object, object]:
    session = make_session()
    actor = Employee(
        employee_code="CONCURRENT-CANCEL",
        name="동시 취소 관리자",
        role="창고/관리자",
        department="창고",
        level=EmployeeLevelEnum.ADMIN,
        warehouse_role="primary",
        department_role="none",
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    item = Item(
        item_name="동시 취소 품목",
        process_type_code="TF",
        unit="EA",
        model_symbol="9",
        serial_no=1,
    )
    session.add_all([actor, item])
    session.flush()
    session.add(
        Inventory(
            item_id=item.item_id,
            quantity=Decimal("0"),
            warehouse_qty=Decimal("0"),
            pending_quantity=Decimal("0"),
        )
    )
    session.add(WarehouseUnplacedItem(item_id=item.item_id, quantity=0))
    session.add(
        SystemSetting(
            setting_key=operation_svc.CUTOVER_SETTING_KEY,
            setting_value="2026-01-01T00:00:00",
        )
    )
    session.flush()
    operation = operation_svc._create_business_operation(
        session,
        domain="inventory_io",
        action="receive",
        display_label="입고",
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
        department="창고",
        effective_at=datetime(2026, 8, 25, 3, 0),
    )
    assert operation is not None
    before = inv_effect._snapshot_cells(session, item.item_id)
    inventory_svc._receive_confirmed(
        session,
        item.item_id,
        Decimal("7"),
        bucket="warehouse",
    )
    inventory = inventory_svc._get_or_create_inventory(session, item.item_id)
    session.add(
        operation_svc._attach_transaction(
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.RECEIVE,
                quantity_change=Decimal("7"),
                quantity_before=Decimal("0"),
                quantity_after=inventory.quantity,
                produced_by=actor.name,
                producer_employee_id=actor.employee_id,
                department="창고",
                **inv_effect._capture_log_stock_snapshot(session, item.item_id, before),
            ),
            operation,
            InventoryOperationRoleEnum.PRIMARY,
        )
    )
    session.commit()
    ids = operation.operation_id, actor.employee_id
    session.close()
    return ids


@pytest.mark.usefixtures("concurrent_engine")
def test_same_operation_concurrent_cancel_has_exactly_one_success(
    concurrent_engine, make_session
) -> None:
    operation_id, actor_id = _setup(make_session)
    preview_session = make_session()
    preview = cancellation_svc.preview_cancellation(
        preview_session,
        operation_id,
        now=datetime(2026, 8, 25, 3, 0),
    )
    preview_session.close()
    outcomes: list[str] = []

    def try_cancel() -> str:
        session = make_session()
        try:
            actor = session.get(Employee, actor_id)
            cancellation_svc.cancel_operation(
                session,
                operation_id=operation_id,
                canceller=actor,
                reason="동시 취소",
                plan_hash=preview.plan_hash,
                now=datetime(2026, 8, 25, 3, 0),
            )
            return "success"
        except cancellation_svc.CancellationError:
            session.rollback()
            return "conflict"
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(try_cancel) for _ in range(2)]
        for future in as_completed(futures):
            outcomes.append(future.result())

    verify = make_session()
    try:
        cancellation_count = (
            verify.query(InventoryOperation)
            .filter(InventoryOperation.kind == InventoryOperationKindEnum.CANCELLATION)
            .count()
        )
        inventory = verify.query(Inventory).one()
        assert sorted(outcomes) == ["conflict", "success"]
        assert cancellation_count == 1
        assert verify.query(TransactionLog).count() == 2
        assert inventory.warehouse_qty == Decimal("0")
        assert verify.query(WarehouseUnplacedItem).one().quantity == 0
    finally:
        verify.close()


def _setup_legacy(make_session) -> tuple[object, object]:
    session = make_session()
    actor = Employee(
        employee_code="CONCURRENT-LEGACY",
        name="동시 레거시 취소 관리자",
        role="창고/관리자",
        department="창고",
        level=EmployeeLevelEnum.ADMIN,
        warehouse_role="primary",
        department_role="none",
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    item = Item(
        item_name="동시 레거시 취소 품목",
        process_type_code="TF",
        unit="EA",
        model_symbol="9",
        serial_no=2,
    )
    session.add_all([actor, item])
    session.flush()
    session.add(
        Inventory(
            item_id=item.item_id,
            quantity=Decimal("7"),
            warehouse_qty=Decimal("7"),
            pending_quantity=Decimal("0"),
        )
    )
    session.add(WarehouseUnplacedItem(item_id=item.item_id, quantity=7))
    session.add(
        SystemSetting(
            setting_key=operation_svc.CUTOVER_SETTING_KEY,
            setting_value="2026-01-01T00:00:00",
        )
    )
    legacy_log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("7"),
        quantity_before=Decimal("0"),
        quantity_after=Decimal("7"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        department="창고",
        inventory_effect=[{"scope": "warehouse", "delta": 7}],
        created_at=datetime.utcnow(),
    )
    session.add(legacy_log)
    session.commit()
    ids = legacy_log.log_id, actor.employee_id
    session.close()
    return ids


@pytest.mark.usefixtures("concurrent_engine")
def test_same_legacy_log_concurrent_cancel_remains_quarantined(
    concurrent_engine, make_session
) -> None:
    log_id, actor_id = _setup_legacy(make_session)
    outcomes: list[str] = []

    def try_cancel() -> str:
        session = make_session()
        try:
            actor = session.get(Employee, actor_id)
            log = session.get(TransactionLog, log_id)
            transaction_actions.cancel_transaction(
                session,
                log=log,
                canceller=actor,
                reason="동시 레거시 취소",
                request=None,
            )
            return "success"
        except (
            legacy_adoption_svc.LegacyCancellationAdoptionError,
            cancellation_svc.CancellationError,
        ):
            session.rollback()
            return "conflict"
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(try_cancel) for _ in range(2)]
        for future in as_completed(futures):
            outcomes.append(future.result())

    verify = make_session()
    try:
        source = verify.get(TransactionLog, log_id)
        cancellation_count = (
            verify.query(InventoryOperation)
            .filter(InventoryOperation.kind == InventoryOperationKindEnum.CANCELLATION)
            .count()
        )
        assert outcomes == ["conflict", "conflict"]
        assert verify.query(InventoryOperation).count() == 0
        assert cancellation_count == 0
        assert verify.query(TransactionLog).count() == 1
        assert source.cancelled is False
        assert source.operation_id is None
        assert verify.query(Inventory).one().warehouse_qty == Decimal("7")
        assert verify.query(WarehouseUnplacedItem).one().quantity == 7
    finally:
        verify.close()
