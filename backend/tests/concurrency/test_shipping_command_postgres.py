"""IC-07/IC-08 shipping availability and command races on real PostgreSQL."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
import os
from queue import Queue
from threading import Barrier, Event
from time import monotonic, sleep
from typing import Callable, Iterable, Sequence
import uuid

import pytest
from sqlalchemy import create_engine, func, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.models import (
    BOM,
    DefectInventoryMovement,
    DefectQuarantineRecord,
    DepartmentEnum,
    DeptAdjSubTypeEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationEffectKindEnum,
    IoBatch,
    Item,
    LocationStatusEnum,
    ShippingAllocation,
    ShippingCommandReceipt,
    ShippingRequest,
    ShippingRequestCompanionLine,
    ShippingRequestEvent,
    ShippingRequestStatusEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    RequestBucketEnum,
    SystemSetting,
    TransactionLog,
    WarehouseUnplacedItem,
)
from app.schemas import IoSubmitRequest, ProductionReceiptRequest
from app.repositories import item_repository
from app.services import defect_actions
from app.services import dept_adjustment
from app.services import io_actions
from app.services import inventory_operation_cancellation as cancellation_svc
from app.services import production_receipt
from app.services import shipping_actions
from app.services import sr_draft
from app.services._tx import transactional
from app.services.sr_validation import LineInput


POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
POSTGRES_ACK = os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK", "")

pytestmark = pytest.mark.skipif(
    not POSTGRES_URL or POSTGRES_ACK != "ALLOW_TEST_DB_MUTATION",
    reason="승인된 전용 TEST_POSTGRES_URL에서만 실제 PostgreSQL 경합을 실행",
)


@dataclass(frozen=True)
class _ShippingCase:
    actor_id: uuid.UUID
    item_id: uuid.UUID
    request_id: uuid.UUID


@dataclass(frozen=True)
class _RaceOutcome:
    result: str
    pid: int
    error_type: str | None


@dataclass(frozen=True)
class _ShippingSnapshot:
    status: ShippingRequestStatusEnum
    source_quantity: int
    allocation_statuses: tuple[str, ...]
    operation_ids: frozenset[uuid.UUID]
    receipt_count: int
    effect_count: int
    event_count: int
    log_count: int


Command = Callable[[Session, Employee], object]


def _session_factory() -> tuple[Engine, sessionmaker[Session]]:
    engine = create_engine(POSTGRES_URL, poolclass=NullPool)
    return engine, sessionmaker(bind=engine, expire_on_commit=False)


def _ensure_cutover(db: Session) -> None:
    setting = db.get(SystemSetting, "inventory_operation_cutover_at")
    if setting is None:
        db.add(
            SystemSetting(
                setting_key="inventory_operation_cutover_at",
                setting_value="2026-01-01T00:00:00",
            )
        )


def _seed_shipping_case(make_session: sessionmaker[Session]) -> _ShippingCase:
    suffix = uuid.uuid4().hex[:12]
    with make_session() as db:
        _ensure_cutover(db)
        actor = Employee(
            employee_code=f"PG5-{suffix}",
            name=f"PostgreSQL shipping {suffix}",
            role="출하/staff",
            department=DepartmentEnum.SHIPPING,
            level=EmployeeLevelEnum.STAFF,
            display_order=0,
            is_active=True,
        )
        final_pa = Item(
            item_name=f"PostgreSQL PA {suffix}",
            process_type_code="PA",
            unit="EA",
            model_symbol=f"S{suffix[:8]}",
            serial_no=1,
        )
        final_pf = Item(
            item_name=f"PostgreSQL PF {suffix}",
            process_type_code="PF",
            unit="EA",
            model_symbol=f"S{suffix[:8]}",
            serial_no=1,
        )
        db.add_all((actor, final_pa, final_pf))
        db.flush()
        db.add_all(
            (
                Inventory(
                    item_id=final_pf.item_id,
                    quantity=Decimal("1"),
                    warehouse_qty=Decimal("0"),
                    pending_quantity=Decimal("0"),
                ),
                InventoryLocation(
                    item_id=final_pf.item_id,
                    department=DepartmentEnum.SHIPPING,
                    status=LocationStatusEnum.PRODUCTION,
                    quantity=Decimal("1"),
                    pending_quantity=Decimal("0"),
                ),
                WarehouseUnplacedItem(item_id=final_pf.item_id, quantity=0),
            )
        )
        request = ShippingRequest(
            status=ShippingRequestStatusEnum.PREPARING,
            base_pf_item_id=final_pf.item_id,
            final_pa_item_id=final_pa.item_id,
            final_pf_item_id=final_pf.item_id,
            request_quantity=1,
            requested_by_name=actor.name,
            invoice_number=f"PG5-{suffix}",
        )
        db.add(request)
        db.commit()
        return _ShippingCase(
            actor_id=actor.employee_id,
            item_id=final_pf.item_id,
            request_id=request.request_id,
        )


def _add_shipping_companion(
    make_session: sessionmaker[Session],
    case: _ShippingCase,
) -> uuid.UUID:
    suffix = uuid.uuid4().hex[:12]
    with make_session() as db:
        companion = Item(
            item_name=f"PostgreSQL companion {suffix}",
            process_type_code="PR",
            unit="EA",
            model_symbol=f"C{suffix[:8]}",
            serial_no=1,
        )
        db.add(companion)
        db.flush()
        db.add_all(
            (
                Inventory(
                    item_id=companion.item_id,
                    quantity=Decimal("1"),
                    warehouse_qty=Decimal("0"),
                    pending_quantity=Decimal("0"),
                ),
                InventoryLocation(
                    item_id=companion.item_id,
                    department=DepartmentEnum.SHIPPING,
                    status=LocationStatusEnum.PRODUCTION,
                    quantity=Decimal("1"),
                    pending_quantity=Decimal("0"),
                ),
                WarehouseUnplacedItem(item_id=companion.item_id, quantity=0),
                ShippingRequestCompanionLine(
                    request_id=case.request_id,
                    item_id=companion.item_id,
                    quantity=1,
                    unit="EA",
                    sort_order=0,
                ),
            )
        )
        db.commit()
        return companion.item_id


def _response_snapshot(_db: Session, request: ShippingRequest) -> dict[str, str]:
    return {
        "request_id": str(request.request_id),
        "status": request.status.value,
    }


def _prepare_command(
    case: _ShippingCase,
    *,
    expected_status: ShippingRequestStatusEnum,
    expected_updated_at: datetime | None = None,
) -> Command:
    client_request_id = uuid.uuid4()

    def execute(db: Session, actor: Employee) -> object:
        return shipping_actions.prepare_complete_command(
            db,
            case.request_id,
            f"SN-{client_request_id.hex[:12]}",
            [],
            actor=actor,
            client_request_id=client_request_id,
            expected_status=expected_status,
            response_factory=_response_snapshot,
            expected_updated_at=expected_updated_at,
        )

    return execute


def _prepare_cancel_command(
    case: _ShippingCase,
    *,
    expected_status: ShippingRequestStatusEnum,
    expected_updated_at: datetime | None = None,
) -> Command:
    client_request_id = uuid.uuid4()

    def execute(db: Session, actor: Employee) -> object:
        return shipping_actions.prepare_cancel_command(
            db,
            case.request_id,
            "PostgreSQL prepare cancellation race",
            actor=actor,
            client_request_id=client_request_id,
            expected_status=expected_status,
            response_factory=_response_snapshot,
            expected_updated_at=expected_updated_at,
        )

    return execute


def _pickup_command(
    case: _ShippingCase,
    *,
    expected_status: ShippingRequestStatusEnum,
    expected_updated_at: datetime | None = None,
) -> Command:
    client_request_id = uuid.uuid4()

    def execute(db: Session, actor: Employee) -> object:
        return shipping_actions.pickup_complete_command(
            db,
            case.request_id,
            actor=actor,
            client_request_id=client_request_id,
            expected_status=expected_status,
            response_factory=_response_snapshot,
            expected_updated_at=expected_updated_at,
        )

    return execute


def _pickup_cancel_command(
    case: _ShippingCase,
    *,
    expected_status: ShippingRequestStatusEnum,
    expected_updated_at: datetime | None = None,
) -> Command:
    client_request_id = uuid.uuid4()

    def execute(db: Session, actor: Employee) -> object:
        return shipping_actions.pickup_cancel_command(
            db,
            case.request_id,
            actor=actor,
            client_request_id=client_request_id,
            expected_status=expected_status,
            response_factory=_response_snapshot,
            expected_updated_at=expected_updated_at,
        )

    return execute


def _run_race(
    make_session: sessionmaker[Session],
    case: _ShippingCase,
    first: Command,
    second: Command,
) -> list[_RaceOutcome]:
    barrier = Barrier(2)

    def run(command: Command) -> _RaceOutcome:
        with make_session() as db:
            actor = db.get(Employee, case.actor_id)
            assert actor is not None
            pid = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            barrier.wait(timeout=10)
            try:
                command(db, actor)
                return _RaceOutcome("success", pid, None)
            except (ValueError, production_receipt.ProductionReceiptError) as exc:
                db.rollback()
                return _RaceOutcome("conflict", pid, type(exc).__name__)

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = (executor.submit(run, first), executor.submit(run, second))
        outcomes = [future.result(timeout=30) for future in futures]
    assert len({outcome.pid for outcome in outcomes}) == 2
    return outcomes


def _assert_worker_waits_for_holder(
    engine: Engine,
    *,
    worker_pid: int,
    holder_pid: int,
) -> None:
    deadline = monotonic() + 10
    last_row: tuple[int, str | None, list[int]] | None = None
    while monotonic() < deadline:
        with engine.connect() as connection:
            row = connection.execute(
                text(
                    "SELECT pid, wait_event_type, pg_blocking_pids(pid) AS blockers "
                    "FROM pg_stat_activity WHERE pid = :worker_pid"
                ),
                {"worker_pid": worker_pid},
            ).one_or_none()
        if row is not None:
            last_row = (row.pid, row.wait_event_type, list(row.blockers or []))
            if row.wait_event_type == "Lock" and holder_pid in set(
                row.blockers or []
            ):
                return
        sleep(0.05)
    pytest.fail(
        "PostgreSQL worker가 선행 트랜잭션 잠금을 기다리지 않았습니다: "
        f"holder={holder_pid}, worker={worker_pid}, activity={last_row}"
    )


def _source_quantity(db: Session, case: _ShippingCase) -> int:
    value = db.query(InventoryLocation.quantity).filter(
        InventoryLocation.item_id == case.item_id,
        InventoryLocation.department == DepartmentEnum.SHIPPING,
        InventoryLocation.status == LocationStatusEnum.PRODUCTION,
    ).scalar()
    assert value is not None
    return int(value)


def _seed_stock_request_draft(
    make_session: sessionmaker[Session],
    case: _ShippingCase,
) -> uuid.UUID:
    with make_session() as db:
        actor = db.get(Employee, case.actor_id)
        item = db.get(Item, case.item_id)
        assert actor is not None and item is not None
        request = StockRequest(
            requester_employee_id=actor.employee_id,
            requester_name=actor.name,
            requester_department=DepartmentEnum.SHIPPING.value,
            request_type=StockRequestTypeEnum.DEPT_TO_WAREHOUSE,
            status=StockRequestStatusEnum.DRAFT,
            requires_warehouse_approval=True,
        )
        db.add(request)
        db.flush()
        db.add(
            StockRequestLine(
                request_id=request.request_id,
                item_id=item.item_id,
                item_name_snapshot=item.item_name,
                mes_code_snapshot=item.mes_code,
                quantity=1,
                from_bucket=RequestBucketEnum.PRODUCTION,
                from_department=DepartmentEnum.SHIPPING.value,
                to_bucket=RequestBucketEnum.WAREHOUSE,
                to_department=None,
                status=StockRequestStatusEnum.DRAFT,
            )
        )
        db.commit()
        return request.request_id


def _shipping_snapshot(db: Session, case: _ShippingCase) -> _ShippingSnapshot:
    request = db.get(ShippingRequest, case.request_id)
    assert request is not None
    operation_ids = frozenset(
        operation_id
        for (operation_id,) in db.query(InventoryOperation.operation_id)
        .filter(
            InventoryOperation.actor_employee_id == case.actor_id,
            InventoryOperation.domain == "shipping",
        )
        .all()
    )
    return _ShippingSnapshot(
        status=request.status,
        source_quantity=_source_quantity(db, case),
        allocation_statuses=tuple(
            status
            for (status,) in db.query(ShippingAllocation.status)
            .filter(ShippingAllocation.request_id == case.request_id)
            .order_by(ShippingAllocation.created_at.asc())
            .all()
        ),
        operation_ids=operation_ids,
        receipt_count=db.query(ShippingCommandReceipt).filter(
            ShippingCommandReceipt.actor_employee_id == case.actor_id
        ).count(),
        effect_count=(
            db.query(InventoryOperationEffect)
            .join(
                InventoryOperation,
                InventoryOperation.operation_id
                == InventoryOperationEffect.operation_id,
            )
            .filter(
                InventoryOperation.actor_employee_id == case.actor_id,
                InventoryOperation.domain == "shipping",
            )
            .count()
        ),
        event_count=db.query(ShippingRequestEvent).filter(
            ShippingRequestEvent.request_id == case.request_id
        ).count(),
        log_count=db.query(TransactionLog).filter(
            TransactionLog.shipping_request_id == case.request_id
        ).count(),
    )


def _assert_single_transition_operation(
    db: Session,
    before: _ShippingSnapshot,
    after: _ShippingSnapshot,
    *,
    allocation_status: str,
) -> uuid.UUID:
    new_operation_ids = after.operation_ids - before.operation_ids
    assert len(new_operation_ids) == 1
    operation_id = next(iter(new_operation_ids))
    effects = db.query(InventoryOperationEffect).filter(
        InventoryOperationEffect.operation_id == operation_id
    ).all()
    allocation_effects = [
        effect
        for effect in effects
        if effect.effect_kind == InventoryOperationEffectKindEnum.ALLOCATION
    ]
    workflow_effects = [
        effect
        for effect in effects
        if effect.effect_kind == InventoryOperationEffectKindEnum.WORKFLOW
    ]
    assert len(allocation_effects) == 1
    assert len(workflow_effects) == 1
    assert allocation_effects[0].after_state["status"] == allocation_status
    assert db.query(ShippingCommandReceipt).filter(
        ShippingCommandReceipt.operation_id == operation_id
    ).count() == 1
    return operation_id


@pytest.mark.parametrize(
    (
        "race_kind",
        "expected_status",
        "expected_source_quantity",
        "expected_allocation_status",
        "expected_log_delta",
    ),
    [
        (
            "prepare_twice",
            ShippingRequestStatusEnum.PREPARED,
            1,
            "RESERVED",
            0,
        ),
        (
            "pickup_twice",
            ShippingRequestStatusEnum.PICKED_UP,
            0,
            "CONSUMED",
            1,
        ),
    ],
)
def test_postgres_shipping_transition_races_have_one_mutation_winner(
    race_kind: str,
    expected_status: ShippingRequestStatusEnum,
    expected_source_quantity: int,
    expected_allocation_status: str,
    expected_log_delta: int,
) -> None:
    engine, make_session = _session_factory()
    case = _seed_shipping_case(make_session)
    try:
        if race_kind == "pickup_twice":
            with make_session() as db:
                actor = db.get(Employee, case.actor_id)
                assert actor is not None
                _prepare_command(
                    case,
                    expected_status=ShippingRequestStatusEnum.PREPARING,
                )(db, actor)
        with make_session() as db:
            before = _shipping_snapshot(db, case)
            request = db.get(ShippingRequest, case.request_id)
            assert request is not None
            expected_updated_at = request.updated_at

        if race_kind == "prepare_twice":
            commands = (
                _prepare_command(
                    case,
                    expected_status=ShippingRequestStatusEnum.PREPARING,
                    expected_updated_at=expected_updated_at,
                ),
                _prepare_command(
                    case,
                    expected_status=ShippingRequestStatusEnum.PREPARING,
                    expected_updated_at=expected_updated_at,
                ),
            )
        else:
            commands = (
                _pickup_command(
                    case,
                    expected_status=ShippingRequestStatusEnum.PREPARED,
                    expected_updated_at=expected_updated_at,
                ),
                _pickup_command(
                    case,
                    expected_status=ShippingRequestStatusEnum.PREPARED,
                    expected_updated_at=expected_updated_at,
                ),
            )

        outcomes = _run_race(make_session, case, *commands)
        assert sorted(outcome.result for outcome in outcomes) == [
            "conflict",
            "success",
        ]

        with make_session() as db:
            after = _shipping_snapshot(db, case)
            assert after.status == expected_status
            assert after.source_quantity == expected_source_quantity
            assert after.allocation_statuses[-1:] == (expected_allocation_status,)
            assert after.receipt_count - before.receipt_count == 1
            assert after.effect_count - before.effect_count == 2
            assert after.event_count - before.event_count == 1
            assert after.log_count - before.log_count == expected_log_delta
            _assert_single_transition_operation(
                db,
                before,
                after,
                allocation_status=expected_allocation_status,
            )
    finally:
        engine.dispose()


def test_postgres_pickup_and_prepare_cancel_have_one_current_state_winner() -> None:
    engine, make_session = _session_factory()
    case = _seed_shipping_case(make_session)
    try:
        with make_session() as db:
            actor = db.get(Employee, case.actor_id)
            assert actor is not None
            _prepare_command(
                case,
                expected_status=ShippingRequestStatusEnum.PREPARING,
            )(db, actor)
        with make_session() as db:
            before = _shipping_snapshot(db, case)
            request = db.get(ShippingRequest, case.request_id)
            assert request is not None
            assert request.status == ShippingRequestStatusEnum.PREPARED
            expected_updated_at = request.updated_at

        outcomes = _run_race(
            make_session,
            case,
            _pickup_command(
                case,
                expected_status=ShippingRequestStatusEnum.PREPARED,
                expected_updated_at=expected_updated_at,
            ),
            _prepare_cancel_command(
                case,
                expected_status=ShippingRequestStatusEnum.PREPARED,
                expected_updated_at=expected_updated_at,
            ),
        )
        assert sorted(outcome.result for outcome in outcomes) == [
            "conflict",
            "success",
        ]

        with make_session() as db:
            after = _shipping_snapshot(db, case)
            expected_by_status = {
                ShippingRequestStatusEnum.PICKED_UP: (0, "CONSUMED", 1),
                ShippingRequestStatusEnum.PREPARING: (1, "RELEASED", 0),
            }
            assert after.status in expected_by_status
            source_quantity, allocation_status, log_delta = expected_by_status[
                after.status
            ]
            assert after.source_quantity == source_quantity
            assert after.allocation_statuses[-1:] == (allocation_status,)
            assert after.receipt_count - before.receipt_count == 1
            assert after.effect_count - before.effect_count == 2
            assert after.event_count - before.event_count == 1
            assert after.log_count - before.log_count == log_delta
            _assert_single_transition_operation(
                db,
                before,
                after,
                allocation_status=allocation_status,
            )
    finally:
        engine.dispose()


@pytest.mark.parametrize("transition", ["prepare", "pickup"])
def test_postgres_stale_next_state_cancel_cannot_chain_after_transition(
    transition: str,
) -> None:
    """A cancel expecting the next state cannot consume a concurrent transition."""

    engine, make_session = _session_factory()
    case = _seed_shipping_case(make_session)
    try:
        if transition == "pickup":
            with make_session() as db:
                actor = db.get(Employee, case.actor_id)
                assert actor is not None
                _prepare_command(
                    case,
                    expected_status=ShippingRequestStatusEnum.PREPARING,
                )(db, actor)
        with make_session() as db:
            before = _shipping_snapshot(db, case)
            request = db.get(ShippingRequest, case.request_id)
            assert request is not None
            expected_updated_at = request.updated_at

        if transition == "prepare":
            commands = (
                _prepare_command(
                    case,
                    expected_status=ShippingRequestStatusEnum.PREPARING,
                    expected_updated_at=expected_updated_at,
                ),
                _prepare_cancel_command(
                    case,
                    expected_status=ShippingRequestStatusEnum.PREPARED,
                    expected_updated_at=expected_updated_at,
                ),
            )
            expected = (
                ShippingRequestStatusEnum.PREPARED,
                1,
                "RESERVED",
                0,
            )
        else:
            commands = (
                _pickup_command(
                    case,
                    expected_status=ShippingRequestStatusEnum.PREPARED,
                    expected_updated_at=expected_updated_at,
                ),
                _pickup_cancel_command(
                    case,
                    expected_status=ShippingRequestStatusEnum.PICKED_UP,
                    expected_updated_at=expected_updated_at,
                ),
            )
            expected = (
                ShippingRequestStatusEnum.PICKED_UP,
                0,
                "CONSUMED",
                1,
            )

        outcomes = _run_race(make_session, case, *commands)
        assert [outcome.result for outcome in outcomes] == ["success", "conflict"]

        with make_session() as db:
            after = _shipping_snapshot(db, case)
            expected_status, source_quantity, allocation_status, log_delta = expected
            assert after.status == expected_status
            assert after.source_quantity == source_quantity
            assert after.allocation_statuses[-1:] == (allocation_status,)
            assert after.receipt_count - before.receipt_count == 1
            assert after.effect_count - before.effect_count == 2
            assert after.event_count - before.event_count == 1
            assert after.log_count - before.log_count == log_delta
            _assert_single_transition_operation(
                db,
                before,
                after,
                allocation_status=allocation_status,
            )
    finally:
        engine.dispose()


@pytest.mark.parametrize("cancel_kind", ["prepare", "pickup"])
def test_postgres_shipping_cancel_races_have_one_mutation_winner(
    cancel_kind: str,
) -> None:
    engine, make_session = _session_factory()
    case = _seed_shipping_case(make_session)
    try:
        with make_session() as db:
            actor = db.get(Employee, case.actor_id)
            assert actor is not None
            _prepare_command(
                case,
                expected_status=ShippingRequestStatusEnum.PREPARING,
            )(db, actor)
        if cancel_kind == "pickup":
            with make_session() as db:
                actor = db.get(Employee, case.actor_id)
                assert actor is not None
                _pickup_command(
                    case,
                    expected_status=ShippingRequestStatusEnum.PREPARED,
                )(db, actor)
        with make_session() as db:
            before = _shipping_snapshot(db, case)
            request = db.get(ShippingRequest, case.request_id)
            assert request is not None
            expected_updated_at = request.updated_at

        if cancel_kind == "prepare":
            command = _prepare_cancel_command(
                case,
                expected_status=ShippingRequestStatusEnum.PREPARED,
                expected_updated_at=expected_updated_at,
            )
            expected = (
                ShippingRequestStatusEnum.PREPARING,
                1,
                "RELEASED",
                0,
            )
            second = _prepare_cancel_command(
                case,
                expected_status=ShippingRequestStatusEnum.PREPARED,
                expected_updated_at=expected_updated_at,
            )
        else:
            command = _pickup_cancel_command(
                case,
                expected_status=ShippingRequestStatusEnum.PICKED_UP,
                expected_updated_at=expected_updated_at,
            )
            expected = (
                ShippingRequestStatusEnum.PREPARED,
                1,
                "RESERVED",
                1,
            )
            second = _pickup_cancel_command(
                case,
                expected_status=ShippingRequestStatusEnum.PICKED_UP,
                expected_updated_at=expected_updated_at,
            )

        outcomes = _run_race(make_session, case, command, second)
        assert sorted(outcome.result for outcome in outcomes) == [
            "conflict",
            "success",
        ]

        with make_session() as db:
            after = _shipping_snapshot(db, case)
            expected_status, source_quantity, allocation_status, log_delta = expected
            assert after.status == expected_status
            assert after.source_quantity == source_quantity
            assert after.allocation_statuses[-1:] == (allocation_status,)
            assert after.receipt_count - before.receipt_count == 1
            assert after.effect_count - before.effect_count == 2
            assert after.event_count - before.event_count == 1
            assert after.log_count - before.log_count == log_delta
            operation_id = _assert_single_transition_operation(
                db,
                before,
                after,
                allocation_status=allocation_status,
            )
            cancellation = db.get(InventoryOperation, operation_id)
            assert cancellation is not None
            assert cancellation.reverses_operation_id is not None
    finally:
        engine.dispose()


@pytest.mark.parametrize("writer_kind", ["update", "delete"])
def test_postgres_prepare_and_request_writer_serialize_without_stale_state(
    writer_kind: str,
) -> None:
    engine, make_session = _session_factory()
    case = _seed_shipping_case(make_session)
    try:
        with make_session() as db:
            request = db.get(ShippingRequest, case.request_id)
            assert request is not None
            expected_updated_at = request.updated_at
        prepare = _prepare_command(
            case,
            expected_status=ShippingRequestStatusEnum.PREPARING,
            expected_updated_at=expected_updated_at,
        )

        def writer(db: Session, actor: Employee) -> object:
            if writer_kind == "delete":
                return shipping_actions.delete_request(db, case.request_id, actor)
            return shipping_actions.update_request(
                db,
                case.request_id,
                {"notes": "PostgreSQL serialized request update"},
                actor,
            )

        outcomes = _run_race(make_session, case, prepare, writer)
        assert sorted(outcome.result for outcome in outcomes) == [
            "conflict",
            "success",
        ]
        shipping_won = outcomes[0].result == "success"

        with make_session() as db:
            request = db.get(ShippingRequest, case.request_id)
            assert request is not None
            assert (request.status == ShippingRequestStatusEnum.PREPARED) is shipping_won
            assert not (
                request.status == ShippingRequestStatusEnum.CANCELLED
                and db.query(ShippingAllocation).filter(
                    ShippingAllocation.request_id == case.request_id,
                    ShippingAllocation.status == "RESERVED",
                ).count()
            )
            assert db.query(ShippingAllocation).filter(
                ShippingAllocation.request_id == case.request_id
            ).count() == int(shipping_won)
            assert db.query(ShippingCommandReceipt).filter(
                ShippingCommandReceipt.actor_employee_id == case.actor_id
            ).count() == int(shipping_won)
            assert db.query(InventoryOperation).filter(
                InventoryOperation.actor_employee_id == case.actor_id,
                InventoryOperation.domain == "shipping",
            ).count() == int(shipping_won)
            if not shipping_won and writer_kind == "update":
                assert request.status == ShippingRequestStatusEnum.PREPARING
                assert request.notes == "PostgreSQL serialized request update"
            if not shipping_won and writer_kind == "delete":
                assert request.status == ShippingRequestStatusEnum.CANCELLED
    finally:
        engine.dispose()


def test_postgres_prepare_and_stock_request_draft_submit_have_one_owner() -> None:
    engine, make_session = _session_factory()
    case = _seed_shipping_case(make_session)
    stock_request_id = _seed_stock_request_draft(make_session, case)
    try:
        with make_session() as db:
            shipping_request = db.get(ShippingRequest, case.request_id)
            assert shipping_request is not None
            expected_updated_at = shipping_request.updated_at
        prepare = _prepare_command(
            case,
            expected_status=ShippingRequestStatusEnum.PREPARING,
            expected_updated_at=expected_updated_at,
        )

        def submit_draft(db: Session, actor: Employee) -> object:
            with transactional(db):
                return sr_draft.submit_draft_request(
                    db,
                    request_id=stock_request_id,
                    requester=actor,
                )

        outcomes = _run_race(make_session, case, prepare, submit_draft)
        assert sorted(outcome.result for outcome in outcomes) == [
            "conflict",
            "success",
        ]
        shipping_won = outcomes[0].result == "success"
        stock_request_won = outcomes[1].result == "success"

        with make_session() as db:
            shipping_request = db.get(ShippingRequest, case.request_id)
            stock_request = db.get(StockRequest, stock_request_id)
            assert shipping_request is not None and stock_request is not None
            pending = db.query(InventoryLocation.pending_quantity).filter(
                InventoryLocation.item_id == case.item_id,
                InventoryLocation.department == DepartmentEnum.SHIPPING,
                InventoryLocation.status == LocationStatusEnum.PRODUCTION,
            ).scalar()
            assert (
                shipping_request.status == ShippingRequestStatusEnum.PREPARED
            ) is shipping_won
            assert (
                stock_request.status == StockRequestStatusEnum.RESERVED
            ) is stock_request_won
            assert stock_request.status == (
                StockRequestStatusEnum.RESERVED
                if stock_request_won
                else StockRequestStatusEnum.DRAFT
            )
            assert int(pending or 0) == int(stock_request_won)
            assert db.query(ShippingAllocation).filter(
                ShippingAllocation.request_id == case.request_id,
                ShippingAllocation.status == "RESERVED",
            ).count() == int(shipping_won)
            assert int(pending or 0) + db.query(ShippingAllocation).filter(
                ShippingAllocation.request_id == case.request_id,
                ShippingAllocation.status == "RESERVED",
            ).count() == 1
            assert db.query(ShippingCommandReceipt).filter(
                ShippingCommandReceipt.actor_employee_id == case.actor_id
            ).count() == int(shipping_won)
            assert db.query(InventoryOperation).filter(
                InventoryOperation.actor_employee_id == case.actor_id,
                InventoryOperation.domain == "shipping",
            ).count() == int(shipping_won)
    finally:
        engine.dispose()


@pytest.mark.parametrize("leader", ["save", "submit"])
def test_postgres_stock_request_draft_save_and_submit_lock_owner_first(
    leader: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine, make_session = _session_factory()
    case = _seed_shipping_case(make_session)
    stock_request_id = _seed_stock_request_draft(make_session, case)
    leader_reached_pause = Event()
    release_leader = Event()
    save_pid: Queue[int] = Queue()
    submit_pid: Queue[int] = Queue()
    real_lock_active_many = item_repository.lock_active_many
    real_preflight = sr_draft._preflight_inventory_check

    def pause_save_after_item_lock(
        db: Session,
        item_ids: Iterable[uuid.UUID],
    ) -> dict[uuid.UUID, Item]:
        rows = real_lock_active_many(db, item_ids)
        if leader == "save" and db.info.get("draft_save_worker"):
            leader_reached_pause.set()
            assert release_leader.wait(timeout=10)
        return rows

    def pause_submit_before_inventory_lock(
        db: Session,
        request_type: StockRequestTypeEnum,
        lines_input: Sequence[LineInput],
    ) -> None:
        if leader == "submit":
            leader_reached_pause.set()
            assert release_leader.wait(timeout=10)
        real_preflight(db, request_type, lines_input)

    monkeypatch.setattr(
        item_repository,
        "lock_active_many",
        pause_save_after_item_lock,
    )
    monkeypatch.setattr(
        sr_draft,
        "_preflight_inventory_check",
        pause_submit_before_inventory_lock,
    )

    line_input = LineInput(
        item_id=case.item_id,
        quantity=Decimal("1"),
        from_bucket=RequestBucketEnum.PRODUCTION,
        from_department=DepartmentEnum.SHIPPING.value,
        to_bucket=RequestBucketEnum.WAREHOUSE,
        to_department=None,
    )

    def save() -> tuple[str, object]:
        with make_session() as db:
            actor = db.get(Employee, case.actor_id)
            assert actor is not None
            db.info["draft_save_worker"] = True
            save_pid.put(db.execute(text("SELECT pg_backend_pid()")).scalar_one())
            try:
                with transactional(db):
                    saved = sr_draft.upsert_draft_request(
                        db,
                        requester=actor,
                        request_type=StockRequestTypeEnum.DEPT_TO_WAREHOUSE,
                        lines_input=[line_input],
                        reference_no=None,
                        notes="PostgreSQL concurrent draft save",
                    )
                    saved_id = saved.request_id
                return "success", saved_id
            except Exception as exc:
                db.rollback()
                return "error", type(exc).__name__

    def submit() -> tuple[str, object]:
        with make_session() as db:
            actor = db.get(Employee, case.actor_id)
            assert actor is not None
            submit_pid.put(db.execute(text("SELECT pg_backend_pid()")).scalar_one())
            try:
                with transactional(db):
                    submitted = sr_draft.submit_draft_request(
                        db,
                        request_id=stock_request_id,
                        requester=actor,
                    )
                    status = submitted.status
                return "success", status
            except Exception as exc:
                db.rollback()
                return "error", type(exc).__name__

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            if leader == "save":
                first_future = executor.submit(save)
                holder_queue, second, worker_queue = save_pid, submit, submit_pid
            else:
                first_future = executor.submit(submit)
                holder_queue, second, worker_queue = submit_pid, save, save_pid
            assert leader_reached_pause.wait(timeout=10)
            holder_pid = holder_queue.get(timeout=10)
            second_future = executor.submit(second)
            worker_pid = worker_queue.get(timeout=10)
            try:
                _assert_worker_waits_for_holder(
                    engine,
                    worker_pid=worker_pid,
                    holder_pid=holder_pid,
                )
            finally:
                release_leader.set()
            first_result = first_future.result(timeout=30)
            second_result = second_future.result(timeout=30)

        assert first_result[0] == "success"
        assert second_result[0] == "success"
        save_result = first_result if leader == "save" else second_result
        assert (save_result[1] == stock_request_id) is (leader == "save")

        with make_session() as db:
            submitted = db.get(StockRequest, stock_request_id)
            assert submitted is not None
            assert submitted.status == StockRequestStatusEnum.RESERVED
            assert len(submitted.lines) == 1
            assert submitted.lines[0].status == StockRequestStatusEnum.RESERVED
            assert submitted.lines[0].quantity == Decimal("1")
            drafts = db.query(StockRequest).filter(
                StockRequest.requester_employee_id == case.actor_id,
                StockRequest.request_type
                == StockRequestTypeEnum.DEPT_TO_WAREHOUSE,
                StockRequest.status == StockRequestStatusEnum.DRAFT,
            ).all()
            assert len(drafts) == int(leader == "submit")
            if drafts:
                assert drafts[0].notes == "PostgreSQL concurrent draft save"
                assert drafts[0].request_id == save_result[1]
    finally:
        release_leader.set()
        engine.dispose()


def _seed_consumer(
    make_session: sessionmaker[Session],
    case: _ShippingCase,
    consumer_kind: str,
) -> Command:
    if consumer_kind == "production":
        suffix = uuid.uuid4().hex[:10]
        with make_session() as db:
            parent = Item(
                item_name=f"PostgreSQL produced {suffix}",
                process_type_code="TF",
                unit="EA",
                model_symbol=f"P{suffix[:8]}",
                serial_no=1,
            )
            db.add(parent)
            db.flush()
            db.add_all(
                (
                    BOM(
                        parent_item_id=parent.item_id,
                        child_item_id=case.item_id,
                        quantity=1,
                        unit="EA",
                    ),
                    Inventory(
                        item_id=parent.item_id,
                        quantity=Decimal("0"),
                        warehouse_qty=Decimal("0"),
                        pending_quantity=Decimal("0"),
                    ),
                    WarehouseUnplacedItem(item_id=parent.item_id, quantity=0),
                )
            )
            db.commit()
            parent_id = parent.item_id
        payload = ProductionReceiptRequest(item_id=parent_id, quantity=1)

        def execute(db: Session, actor: Employee) -> object:
            parent = db.get(Item, parent_id)
            assert parent is not None
            return production_receipt.execute_production_receipt(
                db,
                payload,
                parent,
                actor=actor,
            )

        execute.parent_id = parent_id  # type: ignore[attr-defined]
        return execute

    if consumer_kind == "io":
        payload = IoSubmitRequest.model_validate(
            {
                "requester_employee_id": str(case.actor_id),
                "work_type": "process",
                "sub_type": "consume",
                "client_request_id": uuid.uuid4().hex,
                "bundles": [
                    {
                        "bundle_id": str(uuid.uuid4()),
                        "source_kind": "direct_item",
                        "title": "PostgreSQL IO reservation race",
                        "source_item_id": str(case.item_id),
                        "quantity": 1,
                        "lines": [
                            {
                                "line_id": str(uuid.uuid4()),
                                "item_id": str(case.item_id),
                                "item_name": "PostgreSQL IO reservation race",
                                "unit": "EA",
                                "direction": "out",
                                "from_bucket": "production",
                                "from_department": DepartmentEnum.SHIPPING.value,
                                "to_bucket": "none",
                                "quantity": 1,
                                "included": True,
                                "selected": True,
                                "origin": "direct",
                            }
                        ],
                    }
                ],
            }
        )

        def execute(db: Session, actor: Employee) -> object:
            return io_actions.submit(db, payload, requester=actor)

        return execute

    if consumer_kind == "department_adjustment":

        def execute(db: Session, actor: Employee) -> object:
            return dept_adjustment.submit_adjustment(
                db,
                DeptAdjSubTypeEnum.CORRECTION,
                [
                    dept_adjustment.AdjLine(
                        item_id=case.item_id,
                        direction="out",
                        quantity=Decimal("1"),
                        department=DepartmentEnum.SHIPPING,
                    )
                ],
                actor=actor,
                notes="PostgreSQL shipping reservation race",
            )

        return execute

    with make_session() as db:
        db.add(
            InventoryLocation(
                item_id=case.item_id,
                department=DepartmentEnum.SHIPPING,
                status=LocationStatusEnum.DEFECTIVE,
                quantity=Decimal("0"),
                pending_quantity=Decimal("0"),
            )
        )
        db.commit()
    client_request_id = uuid.uuid4().hex

    def execute(db: Session, actor: Employee) -> object:
        return defect_actions.quarantine_inventory(
            db,
            item_id=case.item_id,
            qty=Decimal("1"),
            source="production",
            target_dept=DepartmentEnum.SHIPPING,
            source_dept=DepartmentEnum.SHIPPING,
            actor=actor,
            reason_category=None,
            reason_memo="PostgreSQL shipping reservation race",
            client_request_id=client_request_id,
        )

    return execute


def _source_effect_quantity(db: Session, case: _ShippingCase) -> int:
    consumed = 0
    logs = db.query(TransactionLog).filter(
        TransactionLog.item_id == case.item_id,
        TransactionLog.producer_employee_id == case.actor_id,
    ).all()
    for log in logs:
        for effect in log.inventory_effect or []:
            if (
                effect.get("scope") == "location"
                and effect.get("department") == DepartmentEnum.SHIPPING.value
                and effect.get("status") == LocationStatusEnum.PRODUCTION.value
            ):
                consumed -= int(effect.get("delta") or 0)
    return consumed


def _reservation_effect_quantity(db: Session, case: _ShippingCase) -> int:
    effects = (
        db.query(InventoryOperationEffect)
        .join(
            InventoryOperation,
            InventoryOperation.operation_id == InventoryOperationEffect.operation_id,
        )
        .filter(
            InventoryOperation.actor_employee_id == case.actor_id,
            InventoryOperation.domain == "shipping",
            InventoryOperationEffect.effect_kind
            == InventoryOperationEffectKindEnum.ALLOCATION,
            InventoryOperationEffect.role == "RESERVE",
        )
        .all()
    )
    return sum(int(effect.after_state.get("quantity") or 0) for effect in effects)


@pytest.mark.parametrize(
    "consumer_kind",
    ["production", "io", "department_adjustment", "defect"],
)
def test_postgres_shipping_reservation_vs_consumer_has_one_physical_winner(
    consumer_kind: str,
) -> None:
    engine, make_session = _session_factory()
    case = _seed_shipping_case(make_session)
    consumer = _seed_consumer(make_session, case, consumer_kind)
    prepare = _prepare_command(
        case,
        expected_status=ShippingRequestStatusEnum.PREPARING,
    )
    try:
        outcomes = _run_race(make_session, case, prepare, consumer)
        assert sorted(outcome.result for outcome in outcomes) == [
            "conflict",
            "success",
        ]
        shipping_won = outcomes[0].result == "success"
        consumer_won = outcomes[1].result == "success"

        with make_session() as db:
            request = db.get(ShippingRequest, case.request_id)
            assert request is not None
            source_quantity = _source_quantity(db, case)
            reserved_quantity = int(
                db.query(func.coalesce(func.sum(ShippingAllocation.quantity), 0))
                .filter(
                    ShippingAllocation.request_id == case.request_id,
                    ShippingAllocation.status == "RESERVED",
                )
                .scalar()
                or 0
            )
            operation_rows = db.query(InventoryOperation).filter(
                InventoryOperation.actor_employee_id == case.actor_id
            ).all()
            item_logs = db.query(TransactionLog).filter(
                TransactionLog.item_id == case.item_id,
                TransactionLog.producer_employee_id == case.actor_id,
            ).all()

            # Expected outcome, committed SQL state, and immutable effect snapshots agree.
            assert shipping_won is (request.status == ShippingRequestStatusEnum.PREPARED)
            assert consumer_won is (source_quantity == 0)
            assert reserved_quantity == int(shipping_won)
            assert 1 - source_quantity == int(consumer_won)
            assert _reservation_effect_quantity(db, case) == int(shipping_won)
            assert _source_effect_quantity(db, case) == int(consumer_won)
            assert reserved_quantity + (1 - source_quantity) == 1

            # The losing transaction leaves no operation, receipt, log, event, or partial row.
            assert len(operation_rows) == 1
            assert len(item_logs) == int(consumer_won)
            assert db.query(ShippingCommandReceipt).filter(
                ShippingCommandReceipt.actor_employee_id == case.actor_id
            ).count() == int(shipping_won)
            assert db.query(ShippingRequestEvent).filter(
                ShippingRequestEvent.request_id == case.request_id
            ).count() == int(shipping_won)
            assert db.query(ShippingAllocation).filter(
                ShippingAllocation.request_id == case.request_id
            ).count() == int(shipping_won)
            assert all(log.operation_id == operation_rows[0].operation_id for log in item_logs)

            io_batches = db.query(IoBatch).filter(
                IoBatch.requester_employee_id == case.actor_id
            ).count()
            assert io_batches == int(consumer_kind == "io" and consumer_won)
            defect_records = db.query(DefectQuarantineRecord).filter(
                DefectQuarantineRecord.item_id == case.item_id,
                DefectQuarantineRecord.quarantined_by_employee_id == case.actor_id,
            ).count()
            defect_movements = db.query(DefectInventoryMovement).filter(
                DefectInventoryMovement.item_id == case.item_id,
                DefectInventoryMovement.actor_employee_id == case.actor_id,
            ).count()
            assert defect_records == int(consumer_kind == "defect" and consumer_won)
            assert defect_movements == int(consumer_kind == "defect" and consumer_won)

            parent_id = getattr(consumer, "parent_id", None)
            if parent_id is not None:
                produced_quantity = db.query(InventoryLocation.quantity).filter(
                    InventoryLocation.item_id == parent_id,
                    InventoryLocation.department == DepartmentEnum.TUBE,
                    InventoryLocation.status == LocationStatusEnum.PRODUCTION,
                ).scalar()
                assert int(produced_quantity or 0) == int(consumer_won)
    finally:
        engine.dispose()


def test_postgres_prepare_cancel_prelocks_multi_item_allocations_in_canonical_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine, make_session = _session_factory()
    case = _seed_shipping_case(make_session)
    companion_item_id = _add_shipping_companion(make_session, case)
    prepare = _prepare_command(
        case,
        expected_status=ShippingRequestStatusEnum.PREPARING,
    )
    with make_session() as db:
        actor = db.get(Employee, case.actor_id)
        assert actor is not None
        prepare(db, actor)
    with make_session() as db:
        request = db.get(ShippingRequest, case.request_id)
        assert request is not None
        expected_updated_at = request.updated_at
        allocations = (
            db.query(ShippingAllocation)
            .filter(ShippingAllocation.request_id == case.request_id)
            .order_by(
                ShippingAllocation.item_id.asc(),
                ShippingAllocation.department.asc(),
                ShippingAllocation.allocation_id.asc(),
            )
            .all()
        )
        allocation_ids = [allocation.allocation_id for allocation in allocations]
        allocation_item_ids = sorted({allocation.item_id for allocation in allocations})
    assert allocation_item_ids == sorted({case.item_id, companion_item_id})
    assert len(allocation_ids) == 2

    cancel = _prepare_cancel_command(
        case,
        expected_status=ShippingRequestStatusEnum.PREPARED,
        expected_updated_at=expected_updated_at,
    )
    cancel_reached_reverse = Event()
    release_cancel = Event()
    cancel_pid: Queue[int] = Queue()
    allocation_writer_pids: Queue[int] = Queue()
    real_reverse = cancellation_svc._reverse_operation_effect

    def pause_before_first_reverse(db: Session, **kwargs) -> InventoryOperationEffect:
        if db.info.get("prepare_cancel_lock_holder") and not db.info.get(
            "prepare_cancel_reverse_paused"
        ):
            db.info["prepare_cancel_reverse_paused"] = True
            cancel_reached_reverse.set()
            assert release_cancel.wait(timeout=10)
        return real_reverse(db, **kwargs)

    monkeypatch.setattr(
        cancellation_svc,
        "_reverse_operation_effect",
        pause_before_first_reverse,
    )

    def run_cancel() -> str:
        with make_session() as db:
            actor = db.get(Employee, case.actor_id)
            assert actor is not None
            db.info["prepare_cancel_lock_holder"] = True
            cancel_pid.put(db.execute(text("SELECT pg_backend_pid()")).scalar_one())
            cancel(db, actor)
            return "success"

    def lock_allocation(allocation_id: uuid.UUID) -> str:
        with make_session() as db:
            allocation_writer_pids.put(
                db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            )
            allocation = (
                db.query(ShippingAllocation)
                .filter(ShippingAllocation.allocation_id == allocation_id)
                .with_for_update()
                .one()
            )
            return allocation.status

    try:
        with ThreadPoolExecutor(max_workers=3) as executor:
            cancel_future = executor.submit(run_cancel)
            assert cancel_reached_reverse.wait(timeout=10)
            holder_pid = cancel_pid.get(timeout=10)
            writer_futures = [
                executor.submit(lock_allocation, allocation_id)
                for allocation_id in allocation_ids
            ]
            worker_pids = [allocation_writer_pids.get(timeout=10) for _ in allocation_ids]
            try:
                for worker_pid in worker_pids:
                    _assert_worker_waits_for_holder(
                        engine,
                        worker_pid=worker_pid,
                        holder_pid=holder_pid,
                    )
            finally:
                release_cancel.set()
            assert cancel_future.result(timeout=30) == "success"
            assert {
                writer_future.result(timeout=30)
                for writer_future in writer_futures
            } == {"RELEASED"}

        with make_session() as db:
            request = db.get(ShippingRequest, case.request_id)
            assert request is not None
            assert request.status == ShippingRequestStatusEnum.PREPARING
            assert {
                allocation.status
                for allocation in db.query(ShippingAllocation)
                .filter(ShippingAllocation.request_id == case.request_id)
                .all()
            } == {"RELEASED"}
    finally:
        release_cancel.set()
        engine.dispose()
