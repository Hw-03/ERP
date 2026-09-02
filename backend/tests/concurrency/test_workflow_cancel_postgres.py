"""실제 PostgreSQL 두 연결에서 workflow 취소 경합과 3자 재고 증거를 검증한다."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
import os
from threading import Barrier, Event, local
import uuid

from fastapi import HTTPException, Request
import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.models import (
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationEffectKindEnum,
    InventoryOperationRoleEnum,
    Item,
    ShippingAllocation,
    ShippingRequest,
    ShippingRequestEvent,
    ShippingRequestStatusEnum,
    SystemSetting,
    TransactionLog,
    TransactionTypeEnum,
    WarehouseUnplacedItem,
)
from app.services import inv_effect
from app.services import inventory as inventory_svc
from app.services import inventory_operation_cancellation as cancellation_svc
from app.services import inventory_operations as operation_svc
from app.services import shipping as shipping_svc
from app.services import shipping_actions as shipping_actions_svc
from app.services.pin_auth import DEFAULT_PIN_HASH
from app.routers.inventory import transactions as transactions_router


POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
POSTGRES_ACK = os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK", "")

pytestmark = pytest.mark.skipif(
    not POSTGRES_URL or POSTGRES_ACK != "ALLOW_TEST_DB_MUTATION",
    reason="승인된 전용 TEST_POSTGRES_URL에서만 실제 PostgreSQL 경합을 실행",
)


@dataclass(frozen=True)
class _WorkflowCase:
    actor_id: uuid.UUID
    item_id: uuid.UUID
    operation_id: uuid.UUID
    original_log_id: uuid.UUID
    effective_at: datetime
    shipping_request_id: uuid.UUID | None = None
    shipping_allocation_id: uuid.UUID | None = None


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


def _seed_production_receipt(
    make_session: sessionmaker[Session],
) -> _WorkflowCase:
    suffix = uuid.uuid4().hex[:12]
    effective_at = datetime.utcnow()
    with make_session() as db:
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
        actor = Employee(
            employee_code=f"WF-PG-{suffix}",
            name=f"workflow PG {suffix}",
            role="창고/관리자",
            department="창고",
            level=EmployeeLevelEnum.ADMIN,
            warehouse_role="primary",
            department_role="primary",
            display_order=0,
            is_active=True,
            pin_hash=DEFAULT_PIN_HASH,
        )
        item = Item(
            item_name=f"workflow cancel PG {suffix}",
            process_type_code="TF",
            unit="EA",
            model_symbol=suffix,
            serial_no=1,
        )
        db.add_all([actor, item])
        db.flush()
        db.add(
            Inventory(
                item_id=item.item_id,
                quantity=Decimal("0"),
                warehouse_qty=Decimal("0"),
                pending_quantity=Decimal("0"),
            )
        )
        db.add(WarehouseUnplacedItem(item_id=item.item_id, quantity=0))
        db.flush()
        operation = operation_svc._create_business_operation(
            db,
            domain="production",
            action="receipt",
            display_label="생산",
            actor_name=actor.name,
            actor_employee_id=actor.employee_id,
            effective_at=effective_at,
        )
        assert operation is not None
        before_cells = inv_effect._snapshot_cells(db, item.item_id)
        inventory_svc._receive_confirmed(
            db,
            item.item_id,
            Decimal("5"),
            bucket="warehouse",
        )
        inventory = db.query(Inventory).filter(Inventory.item_id == item.item_id).one()
        original_log = operation_svc._attach_transaction(
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.PRODUCE,
                quantity_change=Decimal("5"),
                quantity_before=Decimal("0"),
                quantity_after=inventory.quantity,
                produced_by=actor.name,
                producer_employee_id=actor.employee_id,
                **inv_effect._capture_log_stock_snapshot(
                    db,
                    item.item_id,
                    before_cells,
                ),
            ),
            operation,
            InventoryOperationRoleEnum.PRODUCT_OUTPUT,
        )
        db.add(original_log)
        db.commit()
        return _WorkflowCase(
            actor_id=actor.employee_id,
            item_id=item.item_id,
            operation_id=operation.operation_id,
            original_log_id=original_log.log_id,
            effective_at=effective_at,
        )


def _seed_shipping_pickup(
    make_session: sessionmaker[Session],
) -> _WorkflowCase:
    suffix = uuid.uuid4().hex[:12]
    effective_at = datetime.utcnow()
    with make_session() as db:
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
        actor = Employee(
            employee_code=f"WF-PG-SHIP-{suffix}",
            name=f"workflow shipping PG {suffix}",
            role="창고/관리자",
            department="창고",
            level=EmployeeLevelEnum.ADMIN,
            warehouse_role="primary",
            department_role="primary",
            display_order=0,
            is_active=True,
            pin_hash=DEFAULT_PIN_HASH,
        )
        item = Item(
            item_name=f"workflow shipping cancel PG {suffix}",
            process_type_code="TF",
            unit="EA",
            model_symbol=suffix,
            serial_no=1,
        )
        db.add_all([actor, item])
        db.flush()
        db.add(
            Inventory(
                item_id=item.item_id,
                quantity=Decimal("5"),
                warehouse_qty=Decimal("5"),
                pending_quantity=Decimal("0"),
            )
        )
        db.add(WarehouseUnplacedItem(item_id=item.item_id, quantity=5))
        request = ShippingRequest(
            status=ShippingRequestStatusEnum.PICKED_UP,
            base_pf_item_id=item.item_id,
            final_pf_item_id=item.item_id,
            request_quantity=5,
            picked_up_at=effective_at,
        )
        db.add(request)
        db.flush()
        allocation = ShippingAllocation(
            request_id=request.request_id,
            item_id=item.item_id,
            quantity=5,
            status="CONSUMED",
            consumed_at=effective_at,
        )
        db.add(allocation)
        db.flush()
        operation = operation_svc._create_business_operation(
            db,
            domain="shipping",
            action="pickup",
            display_label="출하 픽업",
            actor_name=actor.name,
            actor_employee_id=actor.employee_id,
            effective_at=effective_at,
        )
        assert operation is not None
        before_cells = inv_effect._snapshot_cells(db, item.item_id)
        inventory_svc._consume_warehouse(db, item.item_id, Decimal("5"))
        inventory = db.query(Inventory).filter(Inventory.item_id == item.item_id).one()
        original_log = operation_svc._attach_transaction(
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.SHIP,
                quantity_change=Decimal("-5"),
                quantity_before=Decimal("5"),
                quantity_after=inventory.quantity,
                produced_by=actor.name,
                producer_employee_id=actor.employee_id,
                shipping_request_id=request.request_id,
                shipping_phase="pickup",
                **inv_effect._capture_log_stock_snapshot(
                    db,
                    item.item_id,
                    before_cells,
                ),
            ),
            operation,
            InventoryOperationRoleEnum.PRIMARY,
        )
        db.add(original_log)
        operation_svc._record_effect(
            db,
            operation=operation,
            effect_kind=InventoryOperationEffectKindEnum.ALLOCATION,
            subject_type="ShippingAllocation",
            subject_id=allocation.allocation_id,
            role="CONSUME",
            before_state={"status": "RESERVED"},
            after_state={"status": "CONSUMED"},
        )
        operation_svc._record_effect(
            db,
            operation=operation,
            effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type="ShippingRequest",
            subject_id=request.request_id,
            role="PICKUP_STATUS",
            before_state={"status": ShippingRequestStatusEnum.PREPARED.value},
            after_state={"status": ShippingRequestStatusEnum.PICKED_UP.value},
        )
        db.add(
            ShippingRequestEvent(
                request_id=request.request_id,
                event_type="PICKED_UP",
                actor_employee_id=actor.employee_id,
                actor_employee_code=actor.employee_code,
                actor_name=actor.name,
            )
        )
        db.commit()
        return _WorkflowCase(
            actor_id=actor.employee_id,
            item_id=item.item_id,
            operation_id=operation.operation_id,
            original_log_id=original_log.log_id,
            effective_at=effective_at,
            shipping_request_id=request.request_id,
            shipping_allocation_id=allocation.allocation_id,
        )


def _preview(
    make_session: sessionmaker[Session],
    case: _WorkflowCase,
) -> cancellation_svc.CancellationPlan:
    with make_session() as db:
        return cancellation_svc.preview_cancellation(
            db,
            case.operation_id,
            now=case.effective_at,
        )


def _cancel(
    make_session: sessionmaker[Session],
    case: _WorkflowCase,
    *,
    plan_hash: str,
) -> str:
    with make_session() as db:
        actor = db.get(Employee, case.actor_id)
        assert actor is not None
        try:
            cancellation_svc.cancel_operation(
                db,
                operation_id=case.operation_id,
                canceller=actor,
                reason="PostgreSQL workflow 취소",
                plan_hash=plan_hash,
                now=case.effective_at,
            )
            return "cancelled"
        except cancellation_svc.WorkflowCancellationConflict as exc:
            db.rollback()
            return exc.reason_code


def _assert_three_way_reversal(db: Session, case: _WorkflowCase) -> None:
    original = db.get(TransactionLog, case.original_log_id)
    assert original is not None
    reversal = (
        db.query(TransactionLog)
        .filter(TransactionLog.reverses_log_id == original.log_id)
        .one()
    )
    original_effects = {
        (effect["scope"], effect.get("row_id")): effect
        for effect in original.inventory_effect
    }
    reversal_effects = {
        (effect["scope"], effect.get("row_id")): effect
        for effect in reversal.inventory_effect
    }
    assert original_effects.keys() == reversal_effects.keys()
    inventory = db.query(Inventory).filter(Inventory.item_id == case.item_id).one()
    unplaced = (
        db.query(WarehouseUnplacedItem)
        .filter(WarehouseUnplacedItem.item_id == case.item_id)
        .one()
    )
    sql_quantities = {
        "warehouse": int(inventory.warehouse_qty or 0),
        "warehouse_unplaced": int(unplaced.quantity or 0),
    }
    for key, expected in original_effects.items():
        reversed_effect = reversal_effects[key]
        assert int(expected["after_quantity"]) == int(reversed_effect["before_quantity"])
        assert int(expected["before_quantity"]) == int(reversed_effect["after_quantity"])
        assert int(reversed_effect["after_quantity"]) == sql_quantities[key[0]]
        assert int(expected["delta"]) + int(reversed_effect["delta"]) == 0


def test_workflow_cancel_twice_has_one_winner_and_no_loser_orphans() -> None:
    engine, make_session = _session_factory()
    try:
        case = _seed_shipping_pickup(make_session)
        assert engine.dialect.server_version_info is not None
        assert engine.dialect.server_version_info[0] == 16
        preview = _preview(make_session, case)
        assert preview.can_cancel is True
        barrier = Barrier(2)

        def worker() -> str:
            barrier.wait(timeout=10)
            return _cancel(make_session, case, plan_hash=preview.plan_hash)

        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = list(executor.map(lambda _index: worker(), range(2)))

        assert sorted(outcomes) == [
            cancellation_svc.WORKFLOW_ALREADY_CANCELLED,
            "cancelled",
        ]
        with make_session() as db:
            assert case.shipping_request_id is not None
            assert case.shipping_allocation_id is not None
            cancellation = db.query(InventoryOperation).filter(
                InventoryOperation.reverses_operation_id == case.operation_id
            ).one()
            assert db.query(TransactionLog).filter(
                TransactionLog.reverses_log_id == case.original_log_id
            ).count() == 1
            assert db.query(InventoryOperationEffect).filter(
                InventoryOperationEffect.operation_id == cancellation.operation_id
            ).count() == 2
            request = db.get(ShippingRequest, case.shipping_request_id)
            allocation = db.get(ShippingAllocation, case.shipping_allocation_id)
            inventory = db.query(Inventory).filter(
                Inventory.item_id == case.item_id
            ).one()
            assert request is not None
            assert allocation is not None
            assert request.status == ShippingRequestStatusEnum.PREPARED
            assert allocation.status == "RESERVED"
            assert int(inventory.pending_quantity or 0) == 0
            assert db.query(ShippingAllocation).filter(
                ShippingAllocation.request_id == case.shipping_request_id
            ).count() == 1
            assert db.query(ShippingRequestEvent).filter(
                ShippingRequestEvent.request_id == case.shipping_request_id,
                ShippingRequestEvent.event_type == "PICKUP_CANCELLED",
            ).count() == 1
            _assert_three_way_reversal(db, case)
    finally:
        engine.dispose()


def test_history_cancel_and_shipping_cancel_share_owner_first_lock_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """History와 전용 출하 취소가 교차해도 deadlock 없이 한 요청만 성공한다."""
    engine, make_session = _session_factory()
    try:
        case = _seed_shipping_pickup(make_session)
        assert case.shipping_request_id is not None
        history_preview_entered = Event()
        shipping_preview_entered = Event()
        worker = local()
        original_preview = cancellation_svc.preview_cancellation

        def coordinated_preview(
            *args: object,
            **kwargs: object,
        ) -> cancellation_svc.CancellationPlan:
            role = getattr(worker, "role", None)
            first_preview = not getattr(worker, "preview_seen", False)
            worker.preview_seen = True
            if role == "history" and first_preview:
                history_preview_entered.set()
                assert shipping_preview_entered.wait(timeout=10)
            elif role == "shipping" and first_preview:
                assert history_preview_entered.wait(timeout=10)
                shipping_preview_entered.set()
            return original_preview(*args, **kwargs)

        monkeypatch.setattr(cancellation_svc, "preview_cancellation", coordinated_preview)

        def history_cancel() -> tuple[str, str]:
            worker.role = "history"
            with make_session() as db:
                actor = db.get(Employee, case.actor_id)
                assert actor is not None
                try:
                    transactions_router.cancel_transaction(
                        case.original_log_id,
                        transactions_router.TransactionCancelRequest(
                            reason="PostgreSQL history-vs-shipping 취소",
                            employee_code=actor.employee_code,
                            pin="0000",
                        ),
                        _request(
                            f"/api/inventory/transactions/{case.original_log_id}/cancel"
                        ),
                        actor,
                        db,
                    )
                    return "history", "success"
                except HTTPException:
                    db.rollback()
                    return "history", "conflict"

        def shipping_cancel() -> tuple[str, str]:
            worker.role = "shipping"
            with make_session() as db:
                actor = db.get(Employee, case.actor_id)
                assert actor is not None
                try:
                    shipping_actions_svc.pickup_cancel_command(
                        db,
                        case.shipping_request_id,
                        actor=actor,
                        client_request_id=uuid.uuid4(),
                        expected_status=ShippingRequestStatusEnum.PICKED_UP,
                        response_factory=lambda _db, request: {
                            "status": request.status.value,
                        },
                    )
                    return "shipping", "success"
                except shipping_svc.ShippingError:
                    db.rollback()
                    return "shipping", "conflict"

        with ThreadPoolExecutor(max_workers=2) as executor:
            history_future = executor.submit(history_cancel)
            shipping_future = executor.submit(shipping_cancel)
            outcomes = [history_future.result(), shipping_future.result()]

        assert sorted(status for _role, status in outcomes) == ["conflict", "success"]
        with make_session() as db:
            assert db.query(InventoryOperation).filter(
                InventoryOperation.reverses_operation_id == case.operation_id
            ).count() == 1
            assert db.query(TransactionLog).filter(
                TransactionLog.reverses_log_id == case.original_log_id
            ).count() == 1
            assert db.query(ShippingRequestEvent).filter(
                ShippingRequestEvent.request_id == case.shipping_request_id,
                ShippingRequestEvent.event_type == "PICKUP_CANCELLED",
            ).count() == 1
            _assert_three_way_reversal(db, case)
    finally:
        engine.dispose()


def test_workflow_cancel_vs_next_consume_has_one_winner_and_no_partial_cancel() -> None:
    engine, make_session = _session_factory()
    try:
        case = _seed_production_receipt(make_session)
        assert engine.dialect.server_version_info is not None
        assert engine.dialect.server_version_info[0] == 16
        preview = _preview(make_session, case)
        assert preview.can_cancel is True
        barrier = Barrier(2)

        def cancel_worker() -> str:
            barrier.wait(timeout=10)
            return _cancel(make_session, case, plan_hash=preview.plan_hash)

        def consume_worker() -> str:
            with make_session() as db:
                try:
                    barrier.wait(timeout=10)
                    inventory_svc._consume_warehouse(
                        db,
                        case.item_id,
                        Decimal("1"),
                    )
                    db.commit()
                    return "consumed"
                except ValueError:
                    db.rollback()
                    return "consume_conflict"

        with ThreadPoolExecutor(max_workers=2) as executor:
            cancel_future = executor.submit(cancel_worker)
            consume_future = executor.submit(consume_worker)
            outcomes = {cancel_future.result(), consume_future.result()}

        assert outcomes in (
            {"cancelled", "consume_conflict"},
            {cancellation_svc.WORKFLOW_DEPENDENCY_CONFLICT, "consumed"},
        )
        with make_session() as db:
            cancellation_count = db.query(InventoryOperation).filter(
                InventoryOperation.reverses_operation_id == case.operation_id
            ).count()
            reversal_log_count = db.query(TransactionLog).filter(
                TransactionLog.reverses_log_id == case.original_log_id
            ).count()
            inventory = db.query(Inventory).filter(
                Inventory.item_id == case.item_id
            ).one()
            unplaced = db.query(WarehouseUnplacedItem).filter(
                WarehouseUnplacedItem.item_id == case.item_id
            ).one()
            assert int(inventory.warehouse_qty or 0) == int(unplaced.quantity or 0)
            related_effect_count = db.query(InventoryOperationEffect).filter(
                InventoryOperationEffect.operation_id.in_(
                    db.query(InventoryOperation.operation_id).filter(
                        InventoryOperation.reverses_operation_id == case.operation_id
                    )
                )
            ).count()
            assert related_effect_count == 0
            if "cancelled" in outcomes:
                assert (cancellation_count, reversal_log_count) == (1, 1)
                assert int(inventory.warehouse_qty or 0) == 0
                _assert_three_way_reversal(db, case)
            else:
                assert (cancellation_count, reversal_log_count) == (0, 0)
                assert int(inventory.warehouse_qty or 0) == 4
                blocked = cancellation_svc.preview_cancellation(
                    db,
                    case.operation_id,
                    now=case.effective_at,
                )
                assert blocked.reason_code == (
                    cancellation_svc.WORKFLOW_DEPENDENCY_CONFLICT
                )
    finally:
        engine.dispose()
