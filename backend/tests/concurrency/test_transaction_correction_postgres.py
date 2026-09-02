"""실제 PostgreSQL에서 수량 보정과 취소 경합을 검증한다."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
import os
from queue import Queue
from threading import Barrier
from time import monotonic, sleep
import uuid

from fastapi import HTTPException, Request
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.models import (
    AdminAuditLog,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationKindEnum,
    InventoryOperationRoleEnum,
    Item,
    SystemSetting,
    TransactionEditLog,
    TransactionLog,
    TransactionTypeEnum,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
    WarehouseUnplacedItem,
)
from app.schemas import WarehouseBoxItemPayload
from app.services import inv_effect
from app.services import inventory_operation_cancellation as cancellation_svc
from app.services import inventory_operations as operation_svc
from app.services import transaction_actions
from app.services import warehouse_map as warehouse_map_svc
from app.services.inv_transfer import _consume_warehouse, _receive_confirmed
from app.services.pin_auth import DEFAULT_PIN_HASH
from app.routers.inventory import transactions as transactions_router


POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
POSTGRES_ACK = os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK", "")

pytestmark = pytest.mark.skipif(
    not POSTGRES_URL or POSTGRES_ACK != "ALLOW_TEST_DB_MUTATION",
    reason="승인된 전용 TEST_POSTGRES_URL에서만 실제 PostgreSQL 경합을 실행",
)


@dataclass(frozen=True)
class _CorrectionCase:
    actor_id: uuid.UUID
    item_id: uuid.UUID
    source_log_id: uuid.UUID
    source_operation_id: uuid.UUID


@dataclass(frozen=True)
class _V2CancelRaceCase:
    actor_id: uuid.UUID
    item_id: uuid.UUID
    operation_id: uuid.UUID


@dataclass(frozen=True)
class _PlacementEffectRaceCase:
    actor_id: uuid.UUID
    item_id: uuid.UUID
    box_id: uuid.UUID
    box_row_id: uuid.UUID


@pytest.fixture(autouse=True)
def _force_postgresql_lock_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    """공용 conftest의 SQLite import 환경과 무관하게 실제 PG 잠금을 사용한다."""
    monkeypatch.setattr(inv_effect, "_uses_row_locks", lambda _db: True)


def _session_factory() -> tuple[Engine, sessionmaker[Session]]:
    engine = create_engine(POSTGRES_URL, poolclass=NullPool)
    return engine, sessionmaker(bind=engine, expire_on_commit=False)


def _request(path: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": path,
            "headers": [],
            "query_string": b"",
            "scheme": "http",
            "server": ("testserver", 80),
            "client": ("127.0.0.1", 1),
        }
    )


def _hold_source_operation(
    connection: Connection,
    operation_id: uuid.UUID,
) -> int:
    """검증용 connection이 source operation을 선점하고 holder PID를 반환한다."""
    holder_pid = connection.execute(text("SELECT pg_backend_pid()")).scalar_one()
    connection.execute(
        text(
            "SELECT operation_id FROM inventory_operations "
            "WHERE operation_id = :operation_id FOR UPDATE"
        ),
        {"operation_id": operation_id.hex},
    ).scalar_one()
    return holder_pid


def _assert_workers_wait_for_holder(
    engine: Engine,
    worker_pids: tuple[int, int],
    holder_pid: int,
) -> None:
    """두 worker가 holder의 operation lock 대기열에 들어갔는지 확인한다."""
    deadline = monotonic() + 10
    last_rows: list[tuple[int, str | None, list[int]]] = []
    while monotonic() < deadline:
        with engine.connect() as connection:
            rows = connection.execute(
                text(
                    "SELECT pid, wait_event_type, pg_blocking_pids(pid) AS blockers "
                    "FROM pg_stat_activity WHERE pid IN (:first_pid, :second_pid)"
                ),
                {
                    "first_pid": worker_pids[0],
                    "second_pid": worker_pids[1],
                },
            ).all()
        last_rows = [
            (row.pid, row.wait_event_type, list(row.blockers or [])) for row in rows
        ]
        if len(last_rows) == 2:
            blocker_map = {
                pid: set(blockers) for pid, _wait_type, blockers in last_rows
            }

            def reaches_holder(pid: int) -> bool:
                pending = [pid]
                seen: set[int] = set()
                while pending:
                    current = pending.pop()
                    if current in seen:
                        continue
                    seen.add(current)
                    for blocker in blocker_map.get(current, set()):
                        if blocker == holder_pid:
                            return True
                        if blocker in blocker_map:
                            pending.append(blocker)
                return False

            if all(
                wait_type == "Lock" and reaches_holder(pid)
                for pid, wait_type, _blockers in last_rows
            ):
                return
        sleep(0.05)
    pytest.fail(
        "두 PostgreSQL worker가 source operation holder를 기다리지 않았습니다: "
        f"holder={holder_pid}, workers={worker_pids}, activity={last_rows}"
    )


def _assert_worker_waits_for_holder(
    engine: Engine,
    worker_pid: int,
    holder_pid: int,
) -> None:
    """한 worker가 holder의 물리 원장 잠금을 기다리는지 확인한다."""
    deadline = monotonic() + 10
    last_row = None
    while monotonic() < deadline:
        with engine.connect() as connection:
            last_row = connection.execute(
                text(
                    "SELECT wait_event_type, pg_blocking_pids(pid) AS blockers "
                    "FROM pg_stat_activity WHERE pid = :worker_pid"
                ),
                {"worker_pid": worker_pid},
            ).one_or_none()
        if (
            last_row is not None
            and last_row.wait_event_type == "Lock"
            and holder_pid in set(last_row.blockers or [])
        ):
            return
        sleep(0.05)
    pytest.fail(
        "PostgreSQL worker가 물리 원장 holder를 기다리지 않았습니다: "
        f"holder={holder_pid}, worker={worker_pid}, activity={last_row}"
    )


def _seed_case(make_session: sessionmaker[Session]) -> _CorrectionCase:
    suffix = uuid.uuid4().hex[:10]
    with make_session() as db:
        cutover = db.get(SystemSetting, operation_svc.CUTOVER_SETTING_KEY)
        if cutover is None:
            db.add(
                SystemSetting(
                    setting_key=operation_svc.CUTOVER_SETTING_KEY,
                    setting_value="2026-01-01T00:00:00",
                )
            )
        else:
            cutover.setting_value = "2026-01-01T00:00:00"
        actor = Employee(
            employee_code=f"PG-CORR-{suffix}",
            name="PostgreSQL correction actor",
            role="창고/관리자",
            department=DepartmentEnum.WAREHOUSE,
            level=EmployeeLevelEnum.ADMIN,
            warehouse_role="primary",
            department_role="none",
            display_order=0,
            is_active="true",
            pin_hash=DEFAULT_PIN_HASH,
        )
        item = Item(
            item_name=f"PostgreSQL correction item {suffix}",
            process_type_code="TR",
            unit="EA",
            model_symbol=f"PGC{suffix}",
            serial_no=1,
        )
        db.add_all((actor, item))
        db.flush()
        inventory = Inventory(
            item_id=item.item_id,
            quantity=Decimal("100"),
            warehouse_qty=Decimal("100"),
            pending_quantity=Decimal("0"),
        )
        operation = InventoryOperation(
            kind=InventoryOperationKindEnum.BUSINESS,
            domain="inventory_io",
            action="receive",
            display_label="PostgreSQL simple receive",
            actor_name=actor.name,
            actor_employee_id=actor.employee_id,
            department=DepartmentEnum.WAREHOUSE.value,
        )
        unplaced = WarehouseUnplacedItem(
            item_id=item.item_id,
            quantity=100,
        )
        db.add_all((inventory, unplaced, operation))
        db.flush()
        source = TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=Decimal("100"),
            quantity_before=Decimal("0"),
            quantity_after=Decimal("100"),
            warehouse_qty_before=Decimal("0"),
            warehouse_qty_after=Decimal("100"),
            department_qty_before=Decimal("0"),
            department_qty_after=Decimal("0"),
            produced_by=actor.name,
            producer_employee_id=actor.employee_id,
            department=DepartmentEnum.WAREHOUSE.value,
            inventory_effect=[{"scope": "warehouse", "delta": 100}],
            operation_id=operation.operation_id,
            operation_role=InventoryOperationRoleEnum.PRIMARY,
        )
        db.add(source)
        db.commit()
        return _CorrectionCase(
            actor_id=actor.employee_id,
            item_id=item.item_id,
            source_log_id=source.log_id,
            source_operation_id=operation.operation_id,
        )


def _seed_v2_cancel_race(
    make_session: sessionmaker[Session],
) -> _V2CancelRaceCase:
    suffix = uuid.uuid4().hex[:10]
    with make_session() as db:
        cutover = db.get(SystemSetting, operation_svc.CUTOVER_SETTING_KEY)
        if cutover is None:
            db.add(
                SystemSetting(
                    setting_key=operation_svc.CUTOVER_SETTING_KEY,
                    setting_value="2026-01-01T00:00:00",
                )
            )
        else:
            cutover.setting_value = "2026-01-01T00:00:00"
        actor = Employee(
            employee_code=f"PG-V2-CANCEL-{suffix}",
            name="PostgreSQL v2 cancel actor",
            role="창고/관리자",
            department=DepartmentEnum.WAREHOUSE,
            level=EmployeeLevelEnum.ADMIN,
            warehouse_role="primary",
            department_role="none",
            display_order=0,
            is_active="true",
            pin_hash=DEFAULT_PIN_HASH,
        )
        item = Item(
            item_name=f"PostgreSQL v2 cancel item {suffix}",
            process_type_code="TR",
            unit="EA",
            model_symbol=f"PGV{suffix}",
            serial_no=1,
        )
        db.add_all((actor, item))
        db.flush()
        db.add_all(
            (
                Inventory(
                    item_id=item.item_id,
                    quantity=Decimal("0"),
                    warehouse_qty=Decimal("0"),
                    pending_quantity=Decimal("0"),
                ),
                WarehouseUnplacedItem(item_id=item.item_id, quantity=0),
            )
        )
        operation = operation_svc._create_business_operation(
            db,
            domain="inventory_io",
            action="receive",
            display_label="PostgreSQL v2 receive",
            actor_name=actor.name,
            actor_employee_id=actor.employee_id,
            department=DepartmentEnum.WAREHOUSE.value,
            effective_at=datetime(2026, 9, 1, 0, 0),
        )
        assert operation is not None
        before = inv_effect._snapshot_cells(db, item.item_id)
        _receive_confirmed(db, item.item_id, Decimal("5"))
        inventory = db.query(Inventory).filter(Inventory.item_id == item.item_id).one()
        db.add(
            operation_svc._attach_transaction(
                TransactionLog(
                    item_id=item.item_id,
                    transaction_type=TransactionTypeEnum.RECEIVE,
                    quantity_change=Decimal("5"),
                    quantity_before=Decimal("0"),
                    quantity_after=inventory.quantity,
                    produced_by=actor.name,
                    producer_employee_id=actor.employee_id,
                    department=DepartmentEnum.WAREHOUSE.value,
                    **inv_effect._capture_log_stock_snapshot(db, item.item_id, before),
                ),
                operation,
                InventoryOperationRoleEnum.PRIMARY,
            )
        )
        db.commit()
        return _V2CancelRaceCase(
            actor_id=actor.employee_id,
            item_id=item.item_id,
            operation_id=operation.operation_id,
        )


def _seed_placement_effect_race(
    make_session: sessionmaker[Session],
) -> _PlacementEffectRaceCase:
    suffix = uuid.uuid4().hex[:10]
    with make_session() as db:
        cutover = db.get(SystemSetting, operation_svc.CUTOVER_SETTING_KEY)
        if cutover is None:
            db.add(
                SystemSetting(
                    setting_key=operation_svc.CUTOVER_SETTING_KEY,
                    setting_value="2026-01-01T00:00:00",
                )
            )
        else:
            cutover.setting_value = "2026-01-01T00:00:00"
        actor = Employee(
            employee_code=f"PG-EFFECT-RACE-{suffix}",
            name="PostgreSQL effect race actor",
            role="창고/관리자",
            department=DepartmentEnum.WAREHOUSE,
            level=EmployeeLevelEnum.ADMIN,
            warehouse_role="primary",
            department_role="none",
            display_order=0,
            is_active="true",
            pin_hash=DEFAULT_PIN_HASH,
        )
        item = Item(
            item_name=f"PostgreSQL effect race item {suffix}",
            process_type_code="TR",
            unit="EA",
            model_symbol=f"PGE{suffix}",
            serial_no=1,
        )
        angle = WarehouseAngle(
            id=100_000_000 + int(suffix[:6], 16),
            label=f"PostgreSQL effect race {suffix}",
        )
        db.add_all((actor, item, angle))
        db.flush()
        box = WarehouseBox(
            angle_id=angle.id,
            row_no=1,
            layer_no=1,
            jari_index=0,
            size="SMALL",
            stack_order=0,
        )
        db.add(box)
        db.flush()
        box_row = WarehouseBoxItem(
            box_id=box.box_id,
            item_id=item.item_id,
            quantity=2,
        )
        db.add_all(
            (
                Inventory(
                    item_id=item.item_id,
                    quantity=Decimal("12"),
                    warehouse_qty=Decimal("12"),
                    pending_quantity=Decimal("0"),
                ),
                WarehouseUnplacedItem(item_id=item.item_id, quantity=10),
                box_row,
            )
        )
        db.commit()
        return _PlacementEffectRaceCase(
            actor_id=actor.employee_id,
            item_id=item.item_id,
            box_id=box.box_id,
            box_row_id=box_row.id,
        )


def _correction_counts(db: Session, case: _CorrectionCase) -> tuple[int, int, int, int]:
    edit_count = db.query(TransactionEditLog).filter(
        TransactionEditLog.original_log_id == case.source_log_id,
        TransactionEditLog.correction_log_id.isnot(None),
    ).count()
    log_count = db.query(TransactionLog).filter(
        TransactionLog.reference_no == str(case.source_log_id),
        TransactionLog.transaction_type == TransactionTypeEnum.ADJUST,
    ).count()
    operation_count = db.query(InventoryOperation).filter(
        InventoryOperation.idempotency_key
        == f"transaction_correction:{case.source_log_id}"
    ).count()
    audit_count = db.query(AdminAuditLog).filter(
        AdminAuditLog.action == "transaction.quantity_correction",
        AdminAuditLog.target_id == str(case.source_log_id),
    ).count()
    return edit_count, log_count, operation_count, audit_count


def _assert_log_delta(log: TransactionLog, before: Decimal, after: Decimal) -> None:
    expected = after - before
    assert Decimal(str(log.quantity_change)) == expected
    effects = list(log.inventory_effect or [])
    warehouse_effects = [cell for cell in effects if cell["scope"] == "warehouse"]
    physical_effects = [
        cell
        for cell in effects
        if cell["scope"]
        in {"warehouse_box", "warehouse_zone", "warehouse_unplaced"}
    ]
    assert len(warehouse_effects) == 1
    assert int(warehouse_effects[0]["delta"]) == int(expected)
    assert sum(int(cell["delta"]) for cell in physical_effects) == int(expected)
    assert all(cell.get("row_id") for cell in physical_effects)
    assert all(
        int(cell["after_quantity"]) - int(cell["before_quantity"])
        == int(cell["delta"])
        for cell in effects
    )
    assert Decimal(str(log.warehouse_qty_after)) - Decimal(
        str(log.warehouse_qty_before)
    ) == expected


def test_postgres_cp4_partial_unique_index_is_present() -> None:
    engine = create_engine(POSTGRES_URL, poolclass=NullPool)
    try:
        with engine.connect() as connection:
            revision = connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
            indexdef = connection.execute(
                text(
                    "SELECT indexdef FROM pg_indexes "
                    "WHERE schemaname = current_schema() "
                    "AND tablename = 'transaction_edit_logs' "
                    "AND indexname = 'uq_transaction_edit_log_quantity_correction'"
                )
            ).scalar_one()
        assert revision == "20260831_0033"
        assert "UNIQUE INDEX" in indexdef
        assert "WHERE (correction_log_id IS NOT NULL)" in indexdef
    finally:
        engine.dispose()


def test_postgres_v2_cancel_and_outbound_have_one_physical_winner() -> None:
    engine, make_session = _session_factory()
    case = _seed_v2_cancel_race(make_session)
    now = datetime(2026, 9, 1, 0, 1)
    with make_session() as preview_db:
        preview = cancellation_svc.preview_cancellation(
            preview_db,
            case.operation_id,
            now=now,
        )
    barrier = Barrier(2)

    def cancel() -> str:
        with make_session() as db:
            actor = db.get(Employee, case.actor_id)
            barrier.wait(timeout=10)
            try:
                cancellation_svc.cancel_operation(
                    db,
                    operation_id=case.operation_id,
                    canceller=actor,
                    reason="PostgreSQL v2 cancel race",
                    plan_hash=preview.plan_hash,
                    now=now,
                )
                return "cancel_success"
            except cancellation_svc.CancellationError:
                db.rollback()
                return "cancel_conflict"

    def outbound() -> str:
        with make_session() as db:
            barrier.wait(timeout=10)
            try:
                _consume_warehouse(db, case.item_id, Decimal("1"))
                db.commit()
                return "outbound_success"
            except ValueError:
                db.rollback()
                return "outbound_conflict"

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(cancel), executor.submit(outbound)]
            resolved = {future.result() for future in futures}

        assert resolved in (
            {"cancel_success", "outbound_conflict"},
            {"cancel_conflict", "outbound_success"},
        )
        with make_session() as verify:
            inventory = verify.query(Inventory).filter(
                Inventory.item_id == case.item_id
            ).one()
            unplaced = verify.query(WarehouseUnplacedItem).filter(
                WarehouseUnplacedItem.item_id == case.item_id
            ).one()
            cancellation_count = verify.query(InventoryOperation).filter(
                InventoryOperation.reverses_operation_id == case.operation_id
            ).count()
            if "cancel_success" in resolved:
                assert (inventory.warehouse_qty, unplaced.quantity) == (
                    Decimal("0"),
                    0,
                )
                assert cancellation_count == 1
            else:
                assert (inventory.warehouse_qty, unplaced.quantity) == (
                    Decimal("4"),
                    4,
                )
                assert cancellation_count == 0
    finally:
        engine.dispose()


def test_postgres_effect_snapshot_serializes_placement_and_cancels_only_own_delta() -> None:
    engine, make_session = _session_factory()
    case = _seed_placement_effect_race(make_session)
    worker_pid_queue: Queue[int] = Queue()
    now = datetime(2026, 9, 1, 1, 0)

    def outbound() -> uuid.UUID:
        with make_session() as db:
            worker_pid_queue.put(
                db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            )
            actor = db.get(Employee, case.actor_id)
            operation = operation_svc._create_business_operation(
                db,
                domain="inventory_io",
                action="mark_defective",
                display_label="PostgreSQL effect snapshot race",
                actor_name=actor.name,
                actor_employee_id=actor.employee_id,
                department=DepartmentEnum.WAREHOUSE.value,
                effective_at=now,
            )
            assert operation is not None
            before = inv_effect._snapshot_cells(db, case.item_id)
            inventory, quantity_before = _consume_warehouse(
                db,
                case.item_id,
                Decimal("2"),
            )
            db.add(
                operation_svc._attach_transaction(
                    TransactionLog(
                        item_id=case.item_id,
                        transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
                        quantity_change=Decimal("-2"),
                        quantity_before=quantity_before,
                        quantity_after=inventory.quantity,
                        produced_by=actor.name,
                        producer_employee_id=actor.employee_id,
                        department=DepartmentEnum.WAREHOUSE.value,
                        **inv_effect._capture_log_stock_snapshot(
                            db,
                            case.item_id,
                            before,
                        ),
                    ),
                    operation,
                    InventoryOperationRoleEnum.PRIMARY,
                )
            )
            db.commit()
            return operation.operation_id

    placement_db = make_session()
    try:
        holder_pid = placement_db.execute(
            text("SELECT pg_backend_pid()")
        ).scalar_one()
        warehouse_map_svc._replace_box_items(
            placement_db,
            case.box_id,
            [WarehouseBoxItemPayload(item_id=case.item_id, quantity=7)],
        )

        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(outbound)
            worker_pid = worker_pid_queue.get(timeout=10)
            _assert_worker_waits_for_holder(engine, worker_pid, holder_pid)
            placement_db.commit()
            operation_id = future.result(timeout=10)

        with make_session() as verify:
            log = verify.query(TransactionLog).filter(
                TransactionLog.operation_id == operation_id
            ).one()
            physical_effects = {
                cell["scope"]: cell
                for cell in log.inventory_effect
                if cell["scope"]
                in {"warehouse_box", "warehouse_zone", "warehouse_unplaced"}
            }
            assert physical_effects == {
                "warehouse_box": {
                    "scope": "warehouse_box",
                    "row_id": str(case.box_row_id),
                    "box_id": str(case.box_id),
                    "before_quantity": 7,
                    "after_quantity": 5,
                    "delta": -2,
                }
            }
            preview = cancellation_svc.preview_cancellation(
                verify,
                operation_id,
                now=now,
            )
            assert preview.can_cancel is True
            actor = verify.get(Employee, case.actor_id)
            cancellation_svc.cancel_operation(
                verify,
                operation_id=operation_id,
                canceller=actor,
                reason="PostgreSQL effect snapshot race cancel",
                plan_hash=preview.plan_hash,
                now=now,
            )

        with make_session() as verify:
            inventory = verify.query(Inventory).filter(
                Inventory.item_id == case.item_id
            ).one()
            box_row = verify.query(WarehouseBoxItem).filter(
                WarehouseBoxItem.id == case.box_row_id
            ).one()
            unplaced = verify.query(WarehouseUnplacedItem).filter(
                WarehouseUnplacedItem.item_id == case.item_id
            ).one()
            assert (inventory.warehouse_qty, box_row.quantity, unplaced.quantity) == (
                Decimal("12"),
                7,
                5,
            )
            assert verify.query(InventoryOperation).filter(
                InventoryOperation.reverses_operation_id == operation_id
            ).count() == 1
    finally:
        placement_db.close()
        engine.dispose()


def test_postgres_concurrent_corrections_have_one_winner_and_no_loser_orphans() -> None:
    engine, make_session = _session_factory()
    case = _seed_case(make_session)
    barrier = Barrier(2)
    worker_pid_queue: Queue[int] = Queue()

    def correct(target: Decimal) -> tuple[str, Decimal, int, str | None]:
        with make_session() as db:
            pid = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            actor = db.get(Employee, case.actor_id)
            worker_pid_queue.put(pid)
            barrier.wait(timeout=10)
            try:
                transaction_actions.correct_transaction_quantity(
                    db,
                    log_id=case.source_log_id,
                    editor=actor,
                    new_quantity=target,
                    reason=f"PostgreSQL concurrent correction to {target}",
                    request=None,
                )
                return "success", target, pid, None
            except transaction_actions.CorrectionConflict as exc:
                db.rollback()
                return "conflict", target, pid, exc.reason

    try:
        with engine.connect() as holder, ThreadPoolExecutor(max_workers=2) as executor:
            holder_transaction = holder.begin()
            holder_pid = _hold_source_operation(holder, case.source_operation_id)
            futures = [
                executor.submit(correct, target)
                for target in (Decimal("80"), Decimal("70"))
            ]
            worker_pids = (
                worker_pid_queue.get(timeout=10),
                worker_pid_queue.get(timeout=10),
            )
            try:
                _assert_workers_wait_for_holder(engine, worker_pids, holder_pid)
            finally:
                holder_transaction.rollback()
            outcomes = [future.result() for future in futures]

        assert len({outcome[2] for outcome in outcomes}) == 2
        assert sorted(outcome[0] for outcome in outcomes) == ["conflict", "success"]
        loser = next(outcome for outcome in outcomes if outcome[0] == "conflict")
        winner = next(outcome for outcome in outcomes if outcome[0] == "success")
        assert loser[3] == "already_corrected"

        with make_session() as verify:
            inventory = verify.query(Inventory).filter(
                Inventory.item_id == case.item_id
            ).one()
            correction = verify.query(TransactionLog).filter(
                TransactionLog.reference_no == str(case.source_log_id),
                TransactionLog.transaction_type == TransactionTypeEnum.ADJUST,
            ).one()
            correction_operation = verify.query(InventoryOperation).filter(
                InventoryOperation.idempotency_key
                == f"transaction_correction:{case.source_log_id}"
            ).one()
            assert inventory.warehouse_qty == winner[1]
            assert verify.query(WarehouseUnplacedItem).filter(
                WarehouseUnplacedItem.item_id == case.item_id
            ).one().quantity == winner[1]
            assert _correction_counts(verify, case) == (1, 1, 1, 1)
            assert correction.operation_id == correction_operation.operation_id
            assert verify.query(InventoryOperationEffect).filter(
                InventoryOperationEffect.operation_id == correction_operation.operation_id
            ).count() == 0
            _assert_log_delta(correction, Decimal("100"), winner[1])
    finally:
        engine.dispose()


def test_postgres_correction_and_cancel_have_one_winner_and_no_loser_orphans() -> None:
    engine, make_session = _session_factory()
    case = _seed_case(make_session)
    barrier = Barrier(2)
    worker_pid_queue: Queue[int] = Queue()

    def correct() -> tuple[str, str, int]:
        with make_session() as db:
            pid = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            actor = db.get(Employee, case.actor_id)
            worker_pid_queue.put(pid)
            barrier.wait(timeout=10)
            try:
                transaction_actions.correct_transaction_quantity(
                    db,
                    log_id=case.source_log_id,
                    editor=actor,
                    new_quantity=Decimal("80"),
                    reason="PostgreSQL correction-vs-cancel",
                    request=None,
                )
                return "correction", "success", pid
            except transaction_actions.CorrectionConflict:
                db.rollback()
                return "correction", "conflict", pid

    def cancel() -> tuple[str, str, int]:
        with make_session() as db:
            pid = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            actor = db.get(Employee, case.actor_id)
            worker_pid_queue.put(pid)
            barrier.wait(timeout=10)
            try:
                transactions_router.cancel_transaction(
                    case.source_log_id,
                    transactions_router.TransactionCancelRequest(
                        reason="PostgreSQL correction-vs-cancel",
                        employee_code=actor.employee_code,
                        pin="0000",
                    ),
                    _request(
                        f"/api/inventory/transactions/{case.source_log_id}/cancel"
                    ),
                    actor,
                    db,
                )
                return "cancel", "success", pid
            except HTTPException:
                db.rollback()
                return "cancel", "conflict", pid

    try:
        with engine.connect() as holder, ThreadPoolExecutor(max_workers=2) as executor:
            holder_transaction = holder.begin()
            holder_pid = _hold_source_operation(holder, case.source_operation_id)
            correction_future = executor.submit(correct)
            cancel_future = executor.submit(cancel)
            worker_pids = (
                worker_pid_queue.get(timeout=10),
                worker_pid_queue.get(timeout=10),
            )
            try:
                _assert_workers_wait_for_holder(engine, worker_pids, holder_pid)
            finally:
                holder_transaction.rollback()
            outcomes = [correction_future.result(), cancel_future.result()]

        assert len({outcome[2] for outcome in outcomes}) == 2
        assert sorted(outcome[1] for outcome in outcomes) == ["conflict", "success"]
        winner = next(outcome[0] for outcome in outcomes if outcome[1] == "success")

        with make_session() as verify:
            inventory = verify.query(Inventory).filter(
                Inventory.item_id == case.item_id
            ).one()
            correction_counts = _correction_counts(verify, case)
            cancellations = verify.query(InventoryOperation).filter(
                InventoryOperation.reverses_operation_id == case.source_operation_id
            ).all()
            reversals = verify.query(TransactionLog).filter(
                TransactionLog.reverses_log_id == case.source_log_id
            ).all()
            assert verify.query(InventoryOperation).filter(
                InventoryOperation.operation_id == case.source_operation_id
            ).count() == 1

            if winner == "correction":
                assert inventory.warehouse_qty == Decimal("80")
                assert correction_counts == (1, 1, 1, 1)
                assert cancellations == []
                assert reversals == []
                correction = verify.query(TransactionLog).filter(
                    TransactionLog.reference_no == str(case.source_log_id),
                    TransactionLog.transaction_type == TransactionTypeEnum.ADJUST,
                ).one()
                _assert_log_delta(correction, Decimal("100"), Decimal("80"))
            else:
                assert inventory.warehouse_qty == Decimal("0")
                assert correction_counts == (0, 0, 0, 0)
                assert len(cancellations) == 1
                assert len(reversals) == 1
                assert reversals[0].operation_id == cancellations[0].operation_id
                _assert_log_delta(reversals[0], Decimal("100"), Decimal("0"))

            winner_operation_ids = {
                operation.operation_id
                for operation in cancellations
            }
            winner_operation_ids.update(
                operation.operation_id
                for operation in verify.query(InventoryOperation).filter(
                    InventoryOperation.idempotency_key
                    == f"transaction_correction:{case.source_log_id}"
                ).all()
            )
            assert len(winner_operation_ids) == 1
            assert verify.query(InventoryOperationEffect).filter(
                InventoryOperationEffect.operation_id.in_(winner_operation_ids)
            ).count() == 0
    finally:
        engine.dispose()


def test_postgres_corrected_operation_rejects_fresh_cancellation_preview() -> None:
    engine, make_session = _session_factory()
    case = _seed_case(make_session)
    now = datetime.utcnow()
    try:
        with make_session() as db:
            actor = db.get(Employee, case.actor_id)
            transaction_actions.correct_transaction_quantity(
                db,
                log_id=case.source_log_id,
                editor=actor,
                new_quantity=Decimal("120"),
                reason="PostgreSQL fresh cancel guard",
                request=None,
            )

        with make_session() as db:
            actor = db.get(Employee, case.actor_id)
            preview = cancellation_svc.preview_cancellation(
                db,
                case.source_operation_id,
                now=now,
            )
            assert preview.can_cancel is False
            assert cancellation_svc.CORRECTED_OPERATION_MESSAGE in preview.blockers
            with pytest.raises(cancellation_svc.CancellationNotAllowed):
                cancellation_svc.cancel_operation(
                    db,
                    operation_id=case.source_operation_id,
                    canceller=actor,
                    reason="PostgreSQL corrected source cancel",
                    plan_hash=preview.plan_hash,
                    now=now,
                )

        with make_session() as verify:
            inventory = verify.query(Inventory).filter(
                Inventory.item_id == case.item_id
            ).one()
            assert inventory.warehouse_qty == Decimal("120")
            assert _correction_counts(verify, case) == (1, 1, 1, 1)
            assert verify.query(InventoryOperation).filter(
                InventoryOperation.reverses_operation_id == case.source_operation_id
            ).count() == 0
            assert verify.query(TransactionLog).filter(
                TransactionLog.reverses_log_id == case.source_log_id
            ).count() == 0
    finally:
        engine.dispose()
