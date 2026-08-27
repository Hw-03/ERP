"""CP4 command 경합과 semantic idempotency의 실제 PostgreSQL 증거."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
import os
from queue import Queue
from threading import Barrier, local
from time import monotonic, sleep
import uuid

from fastapi import HTTPException, Request
import pytest
from sqlalchemy import create_engine, func, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    HandoverDoc,
    HandoverLine,
    HandoverStatusEnum,
    Inventory,
    InventoryLocation,
    InventoryOperation,
    InventoryOperationEffect,
    IoBatch,
    Item,
    LocationStatusEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    SystemSetting,
    TransactionLog,
)
from app.routers import io as io_router
from app.routers import stock_requests as stock_request_router
from app.schemas import IoSubmitRequest, StockRequestCreate
from app.services import handover as handover_svc
from app.services import inv_base, inv_effect
from app.services import inventory_operation_cancellation as cancellation_svc
from app.services import inventory_operations as operation_svc
from app.services import stock_requests as stock_request_svc
from app.services.pin_auth import DEFAULT_PIN_HASH


POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
POSTGRES_ACK = os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK", "")

pytestmark = pytest.mark.skipif(
    not POSTGRES_URL or POSTGRES_ACK != "ALLOW_TEST_DB_MUTATION",
    reason="승인된 전용 TEST_POSTGRES_URL에서만 실제 PostgreSQL 경합을 실행",
)


@dataclass(frozen=True)
class _HandoverCase:
    handover_id: uuid.UUID
    actor_id: uuid.UUID
    item_id: uuid.UUID
    handover_code: str


@dataclass(frozen=True)
class _CommandCase:
    actor_id: uuid.UUID
    item_id: uuid.UUID
    client_request_id: str


@pytest.fixture(autouse=True)
def _force_postgresql_lock_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    """공용 conftest의 SQLite import 상태와 무관하게 실제 PG 잠금을 사용한다."""
    monkeypatch.setattr(inv_base, "_is_sqlite", False)
    monkeypatch.setattr(inv_effect, "_is_sqlite", False)
    monkeypatch.setattr(cancellation_svc, "_is_sqlite", False)


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


def _employee(
    suffix: str,
    *,
    department: DepartmentEnum,
    warehouse_role: str = "none",
) -> Employee:
    return Employee(
        employee_code=f"PG4-{suffix}",
        name=f"PostgreSQL CP4 {suffix}",
        role=f"{department.value}/staff",
        department=department,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role=warehouse_role,
        department_role="none",
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )


def _ensure_cutover(db: Session) -> None:
    setting = db.get(SystemSetting, operation_svc.CUTOVER_SETTING_KEY)
    if setting is None:
        db.add(
            SystemSetting(
                setting_key=operation_svc.CUTOVER_SETTING_KEY,
                setting_value="2026-01-01T00:00:00",
            )
        )
    else:
        setting.setting_value = "2026-01-01T00:00:00"


def _seed_handover(make_session: sessionmaker[Session]) -> _HandoverCase:
    suffix = uuid.uuid4().hex[:10]
    with make_session() as db:
        _ensure_cutover(db)
        author = _employee(f"HOA-{suffix}", department=DepartmentEnum.TUBE)
        receiver = _employee(
            f"HOR-{suffix}", department=DepartmentEnum.HIGH_VOLTAGE
        )
        item = Item(
            item_name=f"PostgreSQL handover {suffix}",
            process_type_code="TF",
            unit="EA",
            model_symbol=f"H{suffix}",
            serial_no=1,
        )
        db.add_all((author, receiver, item))
        db.flush()
        db.add(
            Inventory(
                item_id=item.item_id,
                quantity=Decimal("5"),
                warehouse_qty=Decimal("0"),
                pending_quantity=Decimal("0"),
            )
        )
        db.add_all(
            (
                InventoryLocation(
                    item_id=item.item_id,
                    department=DepartmentEnum.TUBE,
                    status=LocationStatusEnum.PRODUCTION,
                    quantity=Decimal("5"),
                    pending_quantity=Decimal("0"),
                ),
                InventoryLocation(
                    item_id=item.item_id,
                    department=DepartmentEnum.HIGH_VOLTAGE,
                    status=LocationStatusEnum.PRODUCTION,
                    quantity=Decimal("0"),
                    pending_quantity=Decimal("0"),
                ),
            )
        )
        code = f"HO-PG4-{suffix}"
        document = HandoverDoc(
            handover_code=code,
            status=HandoverStatusEnum.SUBMITTED,
            author_employee_id=author.employee_id,
            author_name=author.name,
            from_department=DepartmentEnum.TUBE.value,
            to_department=DepartmentEnum.HIGH_VOLTAGE.value,
            title="PostgreSQL CP4 handover",
        )
        db.add(document)
        db.flush()
        db.add(
            HandoverLine(
                handover_id=document.handover_id,
                item_id=item.item_id,
                item_name_snapshot=item.item_name,
                quantity=Decimal("2"),
            )
        )
        db.commit()
        return _HandoverCase(
            handover_id=document.handover_id,
            actor_id=receiver.employee_id,
            item_id=item.item_id,
            handover_code=code,
        )


def _seed_command(
    make_session: sessionmaker[Session],
    *,
    prefix: str,
    warehouse_qty: Decimal,
    department: DepartmentEnum = DepartmentEnum.WAREHOUSE,
    warehouse_role: str = "primary",
) -> _CommandCase:
    suffix = uuid.uuid4().hex[:10]
    with make_session() as db:
        _ensure_cutover(db)
        actor = _employee(
            f"{prefix}-{suffix}",
            department=department,
            warehouse_role=warehouse_role,
        )
        item = Item(
            item_name=f"PostgreSQL {prefix} {suffix}",
            process_type_code="TR",
            unit="EA",
            model_symbol=f"{prefix[:2]}{suffix}",
            serial_no=1,
        )
        db.add_all((actor, item))
        db.flush()
        db.add(
            Inventory(
                item_id=item.item_id,
                quantity=warehouse_qty,
                warehouse_qty=warehouse_qty,
                pending_quantity=Decimal("0"),
            )
        )
        db.commit()
        return _CommandCase(
            actor_id=actor.employee_id,
            item_id=item.item_id,
            client_request_id=f"pg4-{prefix.lower()}-{suffix}",
        )


def _hold_row(
    connection: Connection,
    *,
    table_name: str,
    id_column: str,
    row_id: uuid.UUID,
) -> int:
    holder_pid = connection.execute(text("SELECT pg_backend_pid()")).scalar_one()
    connection.execute(
        text(
            f"SELECT {id_column} FROM {table_name} "
            f"WHERE {id_column} = :row_id FOR UPDATE"
        ),
        {"row_id": row_id.hex},
    ).scalar_one()
    return holder_pid


def _assert_workers_wait_for_holder(
    engine: Engine,
    worker_pids: tuple[int, int],
    holder_pid: int,
) -> None:
    deadline = monotonic() + 10
    last_rows: list[tuple[int, str | None, list[int]]] = []
    while monotonic() < deadline:
        with engine.connect() as connection:
            rows = connection.execute(
                text(
                    "SELECT pid, wait_event_type, pg_blocking_pids(pid) AS blockers "
                    "FROM pg_stat_activity WHERE pid IN (:first_pid, :second_pid)"
                ),
                {"first_pid": worker_pids[0], "second_pid": worker_pids[1]},
            ).all()
        last_rows = [
            (row.pid, row.wait_event_type, list(row.blockers or [])) for row in rows
        ]
        if len(last_rows) == 2:
            blocker_map = {pid: set(blockers) for pid, _wait, blockers in last_rows}

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
        "PostgreSQL worker가 holder 잠금을 기다리지 않았습니다: "
        f"holder={holder_pid}, workers={worker_pids}, activity={last_rows}"
    )


def _location_quantity(
    db: Session,
    *,
    item_id: uuid.UUID,
    department: DepartmentEnum,
) -> Decimal:
    quantity = db.query(InventoryLocation.quantity).filter(
        InventoryLocation.item_id == item_id,
        InventoryLocation.department == department,
        InventoryLocation.status == LocationStatusEnum.PRODUCTION,
    ).scalar()
    assert quantity is not None
    return Decimal(str(quantity))


def _inventory(db: Session, item_id: uuid.UUID) -> Inventory:
    return db.query(Inventory).filter(Inventory.item_id == item_id).one()


def _io_payload(case: _CommandCase) -> IoSubmitRequest:
    bundle_id = uuid.uuid5(case.item_id, "bundle")
    line_id = uuid.uuid5(case.item_id, "line")
    return IoSubmitRequest.model_validate(
        {
            "requester_employee_id": str(case.actor_id),
            "work_type": "receive",
            "sub_type": "receive_supplier",
            "client_request_id": case.client_request_id,
            "bundles": [
                {
                    "bundle_id": str(bundle_id),
                    "source_kind": "direct_item",
                    "title": "PostgreSQL IO",
                    "source_item_id": str(case.item_id),
                    "quantity": 2,
                    "expanded_level": 1,
                    "lines": [
                        {
                            "line_id": str(line_id),
                            "item_id": str(case.item_id),
                            "item_name": "PostgreSQL IO",
                            "unit": "EA",
                            "direction": "in",
                            "from_bucket": "none",
                            "to_bucket": "warehouse",
                            "quantity": 2,
                            "included": True,
                            "selected": True,
                            "origin": "direct",
                        }
                    ],
                }
            ],
        }
    )


def _stock_payload(case: _CommandCase) -> StockRequestCreate:
    return StockRequestCreate.model_validate(
        {
            "requester_employee_id": str(case.actor_id),
            "request_type": "warehouse_to_dept",
            "client_request_id": case.client_request_id,
            "lines": [
                {
                    "item_id": str(case.item_id),
                    "quantity": 1,
                    "from_bucket": "warehouse",
                    "to_bucket": "production",
                    "to_department": DepartmentEnum.ASSEMBLY.value,
                }
            ],
        }
    )


def test_postgres_cp4_fingerprint_columns_are_nullable_varchar_64() -> None:
    engine = create_engine(POSTGRES_URL, poolclass=NullPool)
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text(
                    "SELECT table_name, is_nullable, character_maximum_length "
                    "FROM information_schema.columns "
                    "WHERE table_schema = current_schema() "
                    "AND column_name = 'request_fingerprint' "
                    "AND table_name IN ('io_batches', 'stock_requests')"
                )
            ).all()
            handover_enum_values = connection.execute(
                text(
                    "SELECT enumlabel FROM pg_enum "
                    "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
                    "WHERE pg_type.typname = 'handover_status_enum'"
                )
            ).scalars().all()
        assert {
            (row.table_name, row.is_nullable, row.character_maximum_length)
            for row in rows
        } == {("io_batches", "YES", 64), ("stock_requests", "YES", 64)}
        assert "CANCELLED" in handover_enum_values
    finally:
        engine.dispose()


def test_postgres_io_same_key_collision_applies_once_and_replays(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine, make_session = _session_factory()
    case = _seed_command(make_session, prefix="IO", warehouse_qty=Decimal("0"))
    precheck_barrier = Barrier(2)
    per_thread = local()
    real_resolver = io_router._resolve_io_idempotency
    monkeypatch.setattr(io_router, "lock_idempotency_key", lambda *_args: None)

    def synchronized_resolver(*args, **kwargs):
        result = real_resolver(*args, **kwargs)
        if result is None and not getattr(per_thread, "waited", False):
            per_thread.waited = True
            precheck_barrier.wait(timeout=10)
        return result

    monkeypatch.setattr(io_router, "_resolve_io_idempotency", synchronized_resolver)
    start_barrier = Barrier(2)

    def submit() -> tuple[uuid.UUID, int]:
        with make_session() as db:
            actor = db.get(Employee, case.actor_id)
            pid = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            start_barrier.wait(timeout=10)
            response = io_router.submit_io(
                payload=_io_payload(case),
                http_request=_request("/api/io/submit"),
                actor=actor,
                db=db,
            )
            return uuid.UUID(str(response["batch"]["batch_id"])), pid

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = [future.result() for future in (executor.submit(submit), executor.submit(submit))]
        assert len({outcome[0] for outcome in outcomes}) == 1
        assert len({outcome[1] for outcome in outcomes}) == 2
        with make_session() as verify:
            assert verify.query(IoBatch).filter(
                IoBatch.client_request_id == case.client_request_id
            ).count() == 1
            inventory = _inventory(verify, case.item_id)
            assert inventory.warehouse_qty == Decimal("2")
            logs = verify.query(TransactionLog).filter(
                TransactionLog.item_id == case.item_id
            ).all()
            assert len(logs) == 1
            assert logs[0].operation_id is not None
            assert verify.query(InventoryOperation).filter(
                InventoryOperation.operation_id == logs[0].operation_id
            ).count() == 1
    finally:
        engine.dispose()


def test_postgres_stock_request_same_key_collision_reserves_once_and_replays(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine, make_session = _session_factory()
    case = _seed_command(
        make_session,
        prefix="SR",
        warehouse_qty=Decimal("10"),
        department=DepartmentEnum.ASSEMBLY,
        warehouse_role="none",
    )
    precheck_barrier = Barrier(2)
    per_thread = local()
    real_resolver = stock_request_router._resolve_stock_request_idempotency
    monkeypatch.setattr(
        stock_request_router, "lock_idempotency_key", lambda *_args: None
    )

    def synchronized_resolver(*args, **kwargs):
        result = real_resolver(*args, **kwargs)
        if result is None and not getattr(per_thread, "waited", False):
            per_thread.waited = True
            precheck_barrier.wait(timeout=10)
        return result

    monkeypatch.setattr(
        stock_request_router,
        "_resolve_stock_request_idempotency",
        synchronized_resolver,
    )
    start_barrier = Barrier(2)

    def submit() -> tuple[uuid.UUID, int]:
        with make_session() as db:
            actor = db.get(Employee, case.actor_id)
            pid = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            start_barrier.wait(timeout=10)
            response = stock_request_router.create_stock_request(
                payload=_stock_payload(case), actor=actor, db=db
            )
            return response.request_id, pid

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = [future.result() for future in (executor.submit(submit), executor.submit(submit))]
        assert len({outcome[0] for outcome in outcomes}) == 1
        assert len({outcome[1] for outcome in outcomes}) == 2
        with make_session() as verify:
            request = verify.query(StockRequest).filter(
                StockRequest.client_request_id == case.client_request_id
            ).one()
            assert verify.query(StockRequestLine).filter(
                StockRequestLine.request_id == request.request_id
            ).count() == 1
            inventory = _inventory(verify, case.item_id)
            assert inventory.warehouse_qty == Decimal("10")
            assert inventory.pending_quantity == Decimal("1")
            assert verify.query(TransactionLog).filter(
                TransactionLog.item_id == case.item_id
            ).count() == 0
    finally:
        engine.dispose()


def test_postgres_stock_request_code_retry_reacquires_idempotency_lock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine, make_session = _session_factory()
    case = _seed_command(
        make_session,
        prefix="SRCODE",
        warehouse_qty=Decimal("10"),
        department=DepartmentEnum.ASSEMBLY,
        warehouse_role="none",
    )
    collision_code = f"SR-COLLISION-{uuid.uuid4().hex[:12]}"
    retry_code = f"SR-RETRY-{uuid.uuid4().hex[:12]}"
    with make_session() as db:
        actor = db.get(Employee, case.actor_id)
        db.add(
            StockRequest(
                request_code=collision_code,
                requester_employee_id=actor.employee_id,
                requester_name=actor.name,
                requester_department=actor.department,
                request_type=StockRequestTypeEnum.RAW_RECEIVE,
                status=StockRequestStatusEnum.COMPLETED,
                requires_warehouse_approval=False,
                requires_department_approval=False,
            )
        )
        db.commit()

    codes = iter((collision_code, retry_code))
    monkeypatch.setattr(
        stock_request_svc,
        "_generate_request_code",
        lambda _now: next(codes),
    )
    real_lock = stock_request_router.lock_idempotency_key
    lock_calls: list[str] = []

    def tracked_lock(db: Session, client_request_id: str) -> None:
        lock_calls.append(client_request_id)
        real_lock(db, client_request_id)

    monkeypatch.setattr(stock_request_router, "lock_idempotency_key", tracked_lock)

    try:
        with make_session() as db:
            actor = db.get(Employee, case.actor_id)
            response = stock_request_router.create_stock_request(
                payload=_stock_payload(case), actor=actor, db=db
            )
            assert response.request_code == retry_code
        assert lock_calls == [case.client_request_id, case.client_request_id]
        with make_session() as verify:
            assert verify.query(StockRequest).filter(
                StockRequest.client_request_id == case.client_request_id
            ).count() == 1
            inventory = _inventory(verify, case.item_id)
            assert inventory.warehouse_qty == Decimal("10")
            assert inventory.pending_quantity == Decimal("1")
    finally:
        engine.dispose()


def test_postgres_cross_route_same_key_race_has_one_owner() -> None:
    engine, make_session = _session_factory()
    case = _seed_command(
        make_session,
        prefix="CROSS",
        warehouse_qty=Decimal("10"),
        department=DepartmentEnum.ASSEMBLY,
        warehouse_role="none",
    )
    start_barrier = Barrier(2)

    def submit_io() -> tuple[str, int, str | None, str | None, int]:
        with make_session() as db:
            actor = db.get(Employee, case.actor_id)
            pid = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            start_barrier.wait(timeout=10)
            try:
                io_router.submit_io(
                    payload=_io_payload(case),
                    http_request=_request("/api/io/submit"),
                    actor=actor,
                    db=db,
                )
                return "io", 201, None, None, pid
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, dict) else {}
                extra = detail.get("extra") if isinstance(detail, dict) else {}
                reason = extra.get("reason") if isinstance(extra, dict) else None
                code = detail.get("code") if isinstance(detail, dict) else None
                return "io", exc.status_code, code, reason, pid

    def submit_stock_request() -> tuple[str, int, str | None, str | None, int]:
        with make_session() as db:
            actor = db.get(Employee, case.actor_id)
            pid = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            start_barrier.wait(timeout=10)
            try:
                stock_request_router.create_stock_request(
                    payload=_stock_payload(case), actor=actor, db=db
                )
                return "stock_request", 201, None, None, pid
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, dict) else {}
                extra = detail.get("extra") if isinstance(detail, dict) else {}
                reason = extra.get("reason") if isinstance(extra, dict) else None
                code = detail.get("code") if isinstance(detail, dict) else None
                return "stock_request", exc.status_code, code, reason, pid

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = [
                future.result()
                for future in (
                    executor.submit(submit_io),
                    executor.submit(submit_stock_request),
                )
            ]
        assert sorted(outcome[1] for outcome in outcomes) == [201, 409]
        assert {outcome[2] for outcome in outcomes if outcome[1] == 409} == {
            "IDEMPOTENCY_CONFLICT"
        }
        assert {outcome[3] for outcome in outcomes if outcome[1] == 409} == {
            "route_mismatch"
        }
        assert len({outcome[4] for outcome in outcomes}) == 2

        with make_session() as verify:
            io_count = verify.query(IoBatch).filter(
                IoBatch.client_request_id == case.client_request_id
            ).count()
            request_count = verify.query(StockRequest).filter(
                StockRequest.client_request_id == case.client_request_id
            ).count()
            assert io_count + request_count == 1
            inventory = _inventory(verify, case.item_id)
            logs = verify.query(TransactionLog).filter(
                TransactionLog.item_id == case.item_id
            ).count()
            if io_count == 1:
                assert inventory.warehouse_qty == Decimal("12")
                assert inventory.pending_quantity == Decimal("0")
                assert logs == 1
            else:
                assert inventory.warehouse_qty == Decimal("10")
                assert inventory.pending_quantity == Decimal("1")
                assert logs == 0
    finally:
        engine.dispose()


def test_postgres_handover_receive_race_has_one_winner_and_no_orphans() -> None:
    engine, make_session = _session_factory()
    case = _seed_handover(make_session)
    barrier = Barrier(2)
    worker_pid_queue: Queue[int] = Queue()

    def receive() -> tuple[str, int, str | None]:
        with make_session() as db:
            pid = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            actor = db.get(Employee, case.actor_id)
            worker_pid_queue.put(pid)
            barrier.wait(timeout=10)
            try:
                handover_svc.receive_handover(
                    db, case.handover_id, actor=actor, pin="0000"
                )
                return "success", pid, None
            except handover_svc.HandoverCommandConflict as exc:
                db.rollback()
                return "conflict", pid, exc.reason

    try:
        with engine.connect() as holder, ThreadPoolExecutor(max_workers=2) as executor:
            holder_transaction = holder.begin()
            holder_pid = _hold_row(
                holder,
                table_name="handovers",
                id_column="handover_id",
                row_id=case.handover_id,
            )
            futures = [executor.submit(receive) for _ in range(2)]
            worker_pids = (
                worker_pid_queue.get(timeout=10),
                worker_pid_queue.get(timeout=10),
            )
            try:
                _assert_workers_wait_for_holder(engine, worker_pids, holder_pid)
            finally:
                holder_transaction.rollback()
            outcomes = [future.result() for future in futures]

        assert sorted(outcome[0] for outcome in outcomes) == ["conflict", "success"]
        assert len({outcome[1] for outcome in outcomes}) == 2
        assert next(outcome[2] for outcome in outcomes if outcome[0] == "conflict") == "already_received"
        with make_session() as verify:
            document = verify.get(HandoverDoc, case.handover_id)
            assert document.status == HandoverStatusEnum.RECEIVED
            assert _location_quantity(
                verify,
                item_id=case.item_id,
                department=DepartmentEnum.TUBE,
            ) == Decimal("3")
            assert _location_quantity(
                verify,
                item_id=case.item_id,
                department=DepartmentEnum.HIGH_VOLTAGE,
            ) == Decimal("2")
            logs = verify.query(TransactionLog).filter(
                TransactionLog.reference_no == case.handover_code
            ).all()
            operations = verify.query(InventoryOperation).filter(
                InventoryOperation.idempotency_key
                == f"handover:{case.handover_id}:receive"
            ).all()
            effects = verify.query(InventoryOperationEffect).filter(
                InventoryOperationEffect.subject_id == str(case.handover_id)
            ).all()
            assert (len(logs), len(operations), len(effects)) == (1, 1, 1)
            assert logs[0].operation_id == operations[0].operation_id
            assert effects[0].operation_id == operations[0].operation_id
    finally:
        engine.dispose()


def test_postgres_handover_cancel_race_has_one_winner_and_no_orphans() -> None:
    engine, make_session = _session_factory()
    case = _seed_handover(make_session)
    now = datetime.utcnow()
    with make_session() as db:
        actor = db.get(Employee, case.actor_id)
        handover_svc.receive_handover(db, case.handover_id, actor=actor, pin="0000")
        original = db.query(InventoryOperation).filter(
            InventoryOperation.idempotency_key
            == f"handover:{case.handover_id}:receive"
        ).one()
        original_operation_id = original.operation_id
    with make_session() as db:
        preview = cancellation_svc.preview_cancellation(
            db, original_operation_id, now=now
        )
    barrier = Barrier(2)
    worker_pid_queue: Queue[int] = Queue()

    def cancel() -> tuple[str, int]:
        with make_session() as db:
            pid = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            actor = db.get(Employee, case.actor_id)
            worker_pid_queue.put(pid)
            barrier.wait(timeout=10)
            try:
                cancellation_svc.cancel_operation(
                    db,
                    operation_id=original_operation_id,
                    canceller=actor,
                    reason="PostgreSQL handover cancel race",
                    plan_hash=preview.plan_hash,
                    now=now,
                )
                return "success", pid
            except cancellation_svc.CancellationError:
                db.rollback()
                return "conflict", pid

    try:
        with engine.connect() as holder, ThreadPoolExecutor(max_workers=2) as executor:
            holder_transaction = holder.begin()
            holder_pid = _hold_row(
                holder,
                table_name="inventory_operations",
                id_column="operation_id",
                row_id=original_operation_id,
            )
            futures = [executor.submit(cancel) for _ in range(2)]
            worker_pids = (
                worker_pid_queue.get(timeout=10),
                worker_pid_queue.get(timeout=10),
            )
            try:
                _assert_workers_wait_for_holder(engine, worker_pids, holder_pid)
            finally:
                holder_transaction.rollback()
            outcomes = [future.result() for future in futures]

        assert sorted(outcome[0] for outcome in outcomes) == ["conflict", "success"]
        assert len({outcome[1] for outcome in outcomes}) == 2
        with make_session() as verify:
            document = verify.get(HandoverDoc, case.handover_id)
            assert document.status == HandoverStatusEnum.CANCELLED
            cancellations = verify.query(InventoryOperation).filter(
                InventoryOperation.reverses_operation_id == original_operation_id
            ).all()
            assert len(cancellations) == 1
            assert _location_quantity(
                verify,
                item_id=case.item_id,
                department=DepartmentEnum.TUBE,
            ) == Decimal("5")
            assert _location_quantity(
                verify,
                item_id=case.item_id,
                department=DepartmentEnum.HIGH_VOLTAGE,
            ) == Decimal("0")
            item_logs = verify.query(TransactionLog).filter(
                TransactionLog.item_id == case.item_id
            ).all()
            assert len(item_logs) == 2
            assert all(log.operation_id is not None for log in item_logs)
            operation_ids = {operation.operation_id for operation in cancellations}
            operation_ids.add(original_operation_id)
            assert verify.query(InventoryOperation).filter(
                InventoryOperation.operation_id.in_(operation_ids)
            ).count() == 2
    finally:
        engine.dispose()


def test_postgres_handover_rollback_then_retry_has_one_physical_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine, make_session = _session_factory()
    case = _seed_handover(make_session)
    real_capture = handover_svc.inv_effect._capture_effect

    def fail_capture(*_args, **_kwargs):
        raise RuntimeError("forced ledger failure")

    try:
        monkeypatch.setattr(handover_svc.inv_effect, "_capture_effect", fail_capture)
        with make_session() as db:
            actor = db.get(Employee, case.actor_id)
            with pytest.raises(RuntimeError, match="forced ledger failure"):
                handover_svc.receive_handover(
                    db, case.handover_id, actor=actor, pin="0000"
                )
        with make_session() as verify:
            assert verify.get(HandoverDoc, case.handover_id).status == HandoverStatusEnum.SUBMITTED
            assert _location_quantity(
                verify,
                item_id=case.item_id,
                department=DepartmentEnum.TUBE,
            ) == Decimal("5")
            assert _location_quantity(
                verify,
                item_id=case.item_id,
                department=DepartmentEnum.HIGH_VOLTAGE,
            ) == Decimal("0")
            assert verify.query(TransactionLog).filter(
                TransactionLog.reference_no == case.handover_code
            ).count() == 0
            assert verify.query(InventoryOperation).filter(
                InventoryOperation.idempotency_key
                == f"handover:{case.handover_id}:receive"
            ).count() == 0

        monkeypatch.setattr(handover_svc.inv_effect, "_capture_effect", real_capture)
        with make_session() as db:
            actor = db.get(Employee, case.actor_id)
            handover_svc.receive_handover(
                db, case.handover_id, actor=actor, pin="0000"
            )
        with make_session() as verify:
            assert verify.get(HandoverDoc, case.handover_id).status == HandoverStatusEnum.RECEIVED
            assert verify.query(TransactionLog).filter(
                TransactionLog.reference_no == case.handover_code
            ).count() == 1
            assert verify.query(InventoryOperation).filter(
                InventoryOperation.idempotency_key
                == f"handover:{case.handover_id}:receive"
            ).count() == 1
            assert verify.query(InventoryOperationEffect).filter(
                InventoryOperationEffect.subject_id == str(case.handover_id)
            ).count() == 1
    finally:
        engine.dispose()


def test_postgres_lost_response_retries_replay_io_and_stock_without_duplication() -> None:
    engine, make_session = _session_factory()
    io_case = _seed_command(make_session, prefix="IOL", warehouse_qty=Decimal("0"))
    stock_case = _seed_command(
        make_session,
        prefix="SRL",
        warehouse_qty=Decimal("10"),
        department=DepartmentEnum.ASSEMBLY,
        warehouse_role="none",
    )
    try:
        with make_session() as db:
            actor = db.get(Employee, io_case.actor_id)
            first_io = io_router.submit_io(
                payload=_io_payload(io_case),
                http_request=_request("/api/io/submit"),
                actor=actor,
                db=db,
            )
            first_io_id = first_io["batch"]["batch_id"]
        # 첫 응답을 클라이언트가 받지 못했다고 가정하고 같은 본문과 key를 재전송한다.
        with make_session() as db:
            actor = db.get(Employee, io_case.actor_id)
            retried_io = io_router.submit_io(
                payload=_io_payload(io_case),
                http_request=_request("/api/io/submit"),
                actor=actor,
                db=db,
            )
            assert retried_io["batch"]["batch_id"] == first_io_id

        with make_session() as db:
            actor = db.get(Employee, stock_case.actor_id)
            first_stock = stock_request_router.create_stock_request(
                payload=_stock_payload(stock_case), actor=actor, db=db
            )
            first_stock_id = first_stock.request_id
        with make_session() as db:
            actor = db.get(Employee, stock_case.actor_id)
            retried_stock = stock_request_router.create_stock_request(
                payload=_stock_payload(stock_case), actor=actor, db=db
            )
            assert retried_stock.request_id == first_stock_id

        with make_session() as verify:
            assert verify.query(IoBatch).filter(
                IoBatch.client_request_id == io_case.client_request_id
            ).count() == 1
            assert verify.query(TransactionLog).filter(
                TransactionLog.item_id == io_case.item_id
            ).count() == 1
            assert _inventory(verify, io_case.item_id).warehouse_qty == Decimal("2")
            stock_request = verify.query(StockRequest).filter(
                StockRequest.client_request_id == stock_case.client_request_id
            ).one()
            assert verify.query(StockRequestLine).filter(
                StockRequestLine.request_id == stock_request.request_id
            ).count() == 1
            assert _inventory(verify, stock_case.item_id).pending_quantity == Decimal("1")
            assert verify.query(TransactionLog).filter(
                TransactionLog.item_id == stock_case.item_id
            ).count() == 0
            assert verify.query(InventoryOperation).join(
                TransactionLog,
                TransactionLog.operation_id == InventoryOperation.operation_id,
            ).filter(TransactionLog.item_id == io_case.item_id).count() == 1
            io_operation_id = verify.query(TransactionLog.operation_id).filter(
                TransactionLog.item_id == io_case.item_id
            ).scalar()
            assert verify.query(func.count(InventoryOperationEffect.effect_id)).filter(
                InventoryOperationEffect.operation_id == io_operation_id
            ).scalar() == 1
    finally:
        engine.dispose()
