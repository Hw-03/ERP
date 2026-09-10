"""거래 취소가 동시 요청에서 한 번만 재고를 역전하는지 검증한다."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier

from sqlalchemy.orm import sessionmaker

from app.models import (
    DefectQuarantineRecord,
    DefectQuarantineReconstructionAllocation,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    IoBatch,
    Item,
    LocationStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
    WarehouseUnplacedItem,
)
from app.services import transaction_actions


def _actor(session, suffix: str) -> Employee:
    actor = Employee(
        employee_code=f"CANCEL-{suffix}",
        name=f"취소자 {suffix}",
        role="worker",
        department=DepartmentEnum.ASSEMBLY.value,
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active=True,
    )
    session.add(actor)
    session.flush()
    return actor


def _item(session, suffix: str, *, warehouse: int, total: int) -> Item:
    item = Item(
        item_name=f"동시 취소 {suffix}",
        process_type_code="TR",
        unit="EA",
        model_symbol="9",
        serial_no=int(suffix[-1]) + 1,
    )
    session.add(item)
    session.flush()
    session.add_all(
        [
            Inventory(
                item_id=item.item_id,
                quantity=Decimal(total),
                warehouse_qty=Decimal(warehouse),
            ),
            WarehouseUnplacedItem(item_id=item.item_id, quantity=warehouse),
        ]
    )
    session.flush()
    return item


def _race_cancel(concurrent_engine, *, log_ids, actor_id) -> list[str]:
    local_session = sessionmaker(
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        bind=concurrent_engine,
    )
    barrier = Barrier(2)

    def run(log_id) -> str:
        session = local_session()
        try:
            log = session.get(TransactionLog, log_id)
            actor = session.get(Employee, actor_id)
            assert log is not None and actor is not None
            session.commit()
            barrier.wait(timeout=5)
            try:
                transaction_actions.cancel_transaction(
                    session,
                    log=log,
                    canceller=actor,
                    reason="동시 취소 경합",
                    request=None,
                )
            except ValueError as exc:
                return f"rejected:{exc}"
            return "cancelled"
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        return list(pool.map(run, log_ids))


def test_same_transaction_is_reversed_only_once(concurrent_engine, make_session) -> None:
    session = make_session()
    actor = _actor(session, "1")
    item = _item(session, "1", warehouse=0, total=0)
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.SHIP,
        quantity_change=Decimal("-10"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        inventory_effect=[{"scope": "warehouse", "delta": -10}],
    )
    session.add(log)
    session.commit()
    ids = log.log_id, actor.employee_id, item.item_id
    session.close()

    results = _race_cancel(
        concurrent_engine,
        log_ids=[ids[0], ids[0]],
        actor_id=ids[1],
    )

    check = make_session()
    try:
        inventory = check.query(Inventory).one()
        refreshed = check.get(TransactionLog, ids[0])
        assert [result.split(":", 1)[0] for result in results] == [
            "rejected",
            "rejected",
        ]
        assert all("legacy" in result.lower() or "레거시" in result for result in results)
        assert inventory is not None and inventory.warehouse_qty == Decimal("0")
        assert refreshed is not None and refreshed.cancelled is False
    finally:
        check.close()


def test_batch_transactions_are_reversed_only_once(concurrent_engine, make_session) -> None:
    session = make_session()
    actor = _actor(session, "2")
    first = _item(session, "2", warehouse=0, total=0)
    second = _item(session, "3", warehouse=0, total=0)
    batch = IoBatch(
        work_type="out",
        sub_type="ship",
        status="completed",
        requester_employee_id=actor.employee_id,
        requester_name=actor.name,
        requester_department=DepartmentEnum.ASSEMBLY.value,
    )
    session.add(batch)
    session.flush()
    logs = [
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.SHIP,
            quantity_change=Decimal("-10"),
            produced_by=actor.name,
            producer_employee_id=actor.employee_id,
            operation_batch_id=batch.batch_id,
            inventory_effect=[{"scope": "warehouse", "delta": -10}],
        )
        for item in (first, second)
    ]
    session.add_all(logs)
    session.commit()
    ids = (
        logs[0].log_id,
        actor.employee_id,
        [first.item_id, second.item_id],
        [log.log_id for log in logs],
    )
    session.close()

    results = _race_cancel(
        concurrent_engine,
        log_ids=ids[3],
        actor_id=ids[1],
    )

    check = make_session()
    try:
        inventories = check.query(Inventory).order_by(Inventory.item_id).all()
        batch_logs = (
            check.query(TransactionLog)
            .filter(TransactionLog.log_id.in_(ids[3]))
            .all()
        )
        assert [result.split(":", 1)[0] for result in results] == [
            "rejected",
            "rejected",
        ]
        assert all("legacy" in result.lower() or "레거시" in result for result in results)
        assert [inventory.warehouse_qty for inventory in inventories] == [
            Decimal("0"),
            Decimal("0"),
        ]
        assert all(not log.cancelled for log in batch_logs)
    finally:
        check.close()


def test_fifo_allocations_are_restored_only_once(concurrent_engine, make_session) -> None:
    session = make_session()
    actor = _actor(session, "4")
    item = _item(session, "4", warehouse=2, total=4)
    location = InventoryLocation(
        item_id=item.item_id,
        department=DepartmentEnum.ASSEMBLY.value,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=Decimal("2"),
        pending_quantity=Decimal("0"),
    )
    first = DefectQuarantineRecord(
        item_id=item.item_id,
        department=DepartmentEnum.ASSEMBLY.value,
        original_quantity=Decimal("1"),
        remaining_quantity=Decimal("0"),
        quarantined_by_name=actor.name,
        is_legacy=True,
    )
    second = DefectQuarantineRecord(
        item_id=item.item_id,
        department=DepartmentEnum.ASSEMBLY.value,
        original_quantity=Decimal("3"),
        remaining_quantity=Decimal("2"),
        quarantined_by_name=actor.name,
        is_legacy=True,
    )
    session.add_all([location, first, second])
    session.flush()
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.UNMARK_DEFECTIVE,
        quantity_change=Decimal("0"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        department=DepartmentEnum.ASSEMBLY.value,
        inventory_effect=[
            {"scope": "warehouse", "delta": 2},
            {
                "scope": "location",
                "department": DepartmentEnum.ASSEMBLY.value,
                "status": LocationStatusEnum.DEFECTIVE.value,
                "delta": -2,
            },
        ],
    )
    session.add(log)
    session.flush()
    session.add_all(
        [
            DefectQuarantineReconstructionAllocation(
                transaction_log_id=log.log_id,
                record_id=first.record_id,
                quantity=Decimal("1"),
            ),
            DefectQuarantineReconstructionAllocation(
                transaction_log_id=log.log_id,
                record_id=second.record_id,
                quantity=Decimal("1"),
            ),
        ]
    )
    session.commit()
    ids = (
        log.log_id,
        actor.employee_id,
        item.item_id,
        location.location_id,
        first.record_id,
        second.record_id,
    )
    session.close()

    results = _race_cancel(
        concurrent_engine,
        log_ids=[ids[0], ids[0]],
        actor_id=ids[1],
    )

    check = make_session()
    try:
        inventory = check.query(Inventory).one()
        refreshed_location = check.query(InventoryLocation).one()
        refreshed_records = (
            check.query(DefectQuarantineRecord)
            .order_by(DefectQuarantineRecord.original_quantity)
            .all()
        )
        refreshed_first, refreshed_second = refreshed_records
        assert [result.split(":", 1)[0] for result in results] == [
            "rejected",
            "rejected",
        ]
        assert all("legacy" in result.lower() or "레거시" in result for result in results)
        assert inventory is not None and inventory.warehouse_qty == Decimal("2")
        assert refreshed_location is not None and refreshed_location.quantity == Decimal("2")
        assert refreshed_first is not None and refreshed_first.remaining_quantity == Decimal("0")
        assert refreshed_second is not None and refreshed_second.remaining_quantity == Decimal("2")
    finally:
        check.close()
