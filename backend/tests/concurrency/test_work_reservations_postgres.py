"""Real PostgreSQL lock contention for draft reservation command boundaries."""
from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Event, current_thread
from time import monotonic
from typing import Any
import uuid

from fastapi import HTTPException, Request
import pytest
from sqlalchemy import event, text
from sqlalchemy.orm import Session

from app.models import (
    DepartmentEnum, Employee, Inventory, InventoryLocation, IoBatch, IoDraftReservation,
    IoWorkReservationEvent, StockRequest, StockRequestStatusEnum, TransactionLog,
    LocationStatusEnum,
)
from app.routers.io import save_io_draft
from app.schemas.io import IoDraftUpsert
from app.services import io_actions, io_dispatch, sr_approval, stock_request_actions
from app.services.pin_auth import DEFAULT_PIN_HASH
from app.services.work_reservation_admin import cancel_work_reservation
from app.services.work_reservation_errors import WorkReservationError
from tests.concurrency.test_internal_use_batch_decision_concurrent import (
    _preapprove_warehouse, _setup, postgres_make_session,
)
from tests.concurrency.test_io_draft_reservations import setup_payload


Command = Callable[[Session], Any]


def _request() -> Request:
    """Exercise the existing HTTP command boundary without a shared test client."""
    return Request({"type": "http", "headers": [], "method": "PUT", "path": "/api/io/draft"})


def _save(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    """Use the router's same-key IntegrityError recovery as production does."""
    return save_io_draft(IoDraftUpsert.model_validate(payload), _request(), db)


def _outcome(command: Command, db: Session) -> dict[str, Any]:
    """Keep domain conflicts observable while letting unexpected failures fail."""
    try:
        value = command(db)
        db.commit()
        return {"ok": True, "value": value}
    except WorkReservationError as exc:
        db.rollback()
        return {"ok": False, "code": exc.code, "extra": exc.extra}
    except HTTPException as exc:
        db.rollback()
        return {"ok": False, "code": exc.detail["code"], "detail": exc.detail}
    except ValueError as exc:
        db.rollback()
        return {"ok": False, "code": type(exc).__name__, "message": str(exc)}


def _locked_race(
    make_session: Callable[[], Session],
    first: Command,
    second: Command,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Hold the winner before commit and prove the loser waits on its PG PID."""
    first_at_commit = Event()
    release_first = Event()
    second_connected = Event()
    backend_pids: dict[str, int] = {}

    def run(role: str, command: Command) -> dict[str, Any]:
        current_thread().name = f"cp7-{role}"
        with make_session() as db:
            backend_pids[role] = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            db.execute(text("SET lock_timeout = '10s'"))
            db.execute(text("SET statement_timeout = '15s'"))
            if role == "first":
                paused = False

                @event.listens_for(db, "before_commit")
                def before_commit(session: Session) -> None:
                    nonlocal paused
                    if paused or session.in_nested_transaction():
                        return
                    session.flush()
                    paused = True
                    first_at_commit.set()
                    assert release_first.wait(timeout=15), "first transaction was not released"
            else:
                second_connected.set()
            return _outcome(command, db)

    with ThreadPoolExecutor(max_workers=2) as pool:
        winner = pool.submit(run, "first", first)
        try:
            assert first_at_commit.wait(timeout=15), (
                winner.result(timeout=1) if winner.done() else "first command did not reach commit"
            )
            contender = pool.submit(run, "second", second)
            assert second_connected.wait(timeout=10)
            deadline = monotonic() + 10
            blocked = False
            with make_session() as observer:
                while monotonic() < deadline:
                    blockers = observer.execute(
                        text("SELECT pg_blocking_pids(:pid)"), {"pid": backend_pids["second"]},
                    ).scalar_one()
                    if backend_pids["first"] in blockers:
                        blocked = True
                        break
                    if contender.done():
                        break
            assert blocked, (
                f"expected actual PostgreSQL lock wait, got "
                f"{contender.result(timeout=1) if contender.done() else 'no blocker'}"
            )
        finally:
            release_first.set()
        return winner.result(timeout=15), contender.result(timeout=15)


@pytest.mark.parametrize("source", ["warehouse", "production"])
@pytest.mark.parametrize("same_key", [False, True])
def test_postgres_last_unit_and_creation_retry_serialize(
    postgres_make_session, same_key: bool, source: str,
) -> None:
    payload = setup_payload(postgres_make_session)
    if source == "production":
        with postgres_make_session() as db:
            inventory = db.query(Inventory).one()
            inventory.warehouse_qty = 0
            db.add(InventoryLocation(
                item_id=inventory.item_id, department=DepartmentEnum.ASSEMBLY,
                status=LocationStatusEnum.PRODUCTION, quantity=1, pending_quantity=0,
            ))
            db.commit()
        payload["sub_type"] = "dept_to_warehouse"
        payload["bundles"][0]["lines"][0].update(
            from_bucket="production", from_department=DepartmentEnum.ASSEMBLY.value,
            to_bucket="warehouse", to_department=None,
        )
    other = deepcopy(payload)
    if not same_key:
        other["client_request_id"] = str(uuid.uuid4())
        other["bundles"][0]["bundle_id"] = str(uuid.uuid4())
        other["bundles"][0]["lines"][0]["line_id"] = str(uuid.uuid4())
    first, second = _locked_race(
        postgres_make_session, lambda db: _save(db, payload), lambda db: _save(db, other),
    )
    assert first["ok"]
    if same_key:
        assert second["ok"]
        assert first["value"]["batch_id"] == second["value"]["batch_id"]
    else:
        assert second["ok"], second
        issue = second["value"]["reservation_issue"]
        assert issue["code"] == "stock_shortage"
        assert issue["shortages"][0]["shortage_quantity"] == 1
    with postgres_make_session() as db:
        batches = db.query(IoBatch).all()
        assert len(batches) == (1 if same_key else 2)
        assert all(batch.revision == 1 for batch in batches)
        assert db.query(IoDraftReservation).one().quantity == 1
        assert db.query(IoWorkReservationEvent).count() == (1 if same_key else 2)
        inventory = db.query(Inventory).one()
        assert inventory.quantity == 1
        if source == "warehouse":
            assert (inventory.warehouse_qty, inventory.pending_quantity) == (1, 1)
        else:
            assert (inventory.warehouse_qty, inventory.pending_quantity) == (0, 0)
            location = db.query(InventoryLocation).one()
            assert (location.quantity, location.pending_quantity) == (1, 1)
        assert db.query(TransactionLog).count() == 0


@pytest.mark.parametrize("different_owner", [False, True])
def test_postgres_same_creation_key_rejects_different_intent_or_owner(
    postgres_make_session, different_owner: bool,
) -> None:
    payload = setup_payload(postgres_make_session)
    other = deepcopy(payload)
    if different_owner:
        with postgres_make_session() as db:
            owner = Employee(
                employee_code="OTHER-PG-OWNER", name="Other owner", role="staff",
                department=DepartmentEnum.ASSEMBLY, is_active=True,
            )
            db.add(owner)
            db.commit()
            other["requester_employee_id"] = str(owner.employee_id)
    else:
        other["notes"] = "different creation intent"
    first, second = _locked_race(
        postgres_make_session, lambda db: _save(db, payload), lambda db: _save(db, other),
    )
    assert first["ok"], first
    assert second["code"] == ("FORBIDDEN" if different_owner else "WORK_CREATE_KEY_CONFLICT"), second
    with postgres_make_session() as db:
        assert db.query(IoBatch).one().revision == 1
        assert db.query(IoDraftReservation).one().quantity == 1
        assert db.query(Inventory).one().pending_quantity == 1
        assert db.query(IoWorkReservationEvent).count() == 1
        assert db.query(TransactionLog).count() == 0


@pytest.mark.parametrize(
    ("first_action", "second_action"),
    [("edit", "submit"), ("submit", "edit"), ("cancel", "submit"),
     ("submit", "cancel"), ("edit", "cancel"), ("cancel", "edit")],
)
def test_postgres_edit_submit_admin_cancel_only_one_revision_commits(
    postgres_make_session, first_action: str, second_action: str,
) -> None:
    payload = setup_payload(postgres_make_session)
    with postgres_make_session() as db:
        saved = _save(db, payload)
    batch_id = uuid.UUID(str(saved["batch_id"]))
    owner_id = uuid.UUID(payload["requester_employee_id"])
    edited = deepcopy(payload)
    edited.update(batch_id=str(batch_id), expected_revision=1, notes="winning edit")

    def command(action: str) -> Command:
        if action == "edit":
            return lambda db: _save(db, edited)
        if action == "submit":
            return lambda db: io_actions.submit_existing_draft(
                db, batch_id=batch_id, requester_employee_id=owner_id, expected_revision=1,
            )
        return lambda db: cancel_work_reservation(
            db, batch_id=batch_id, expected_revision=1, reason="concurrent cancellation",
            request=_request(),
        )

    first, second = _locked_race(
        postgres_make_session, command(first_action), command(second_action),
    )
    assert first["ok"], first
    assert second["code"] == "WORK_REVISION_CONFLICT", second
    with postgres_make_session() as db:
        batch = db.get(IoBatch, batch_id)
        assert batch.revision == 2
        assert batch.status == {"edit": "draft", "submit": "reserved", "cancel": "cancelled"}[first_action]
        assert db.query(IoWorkReservationEvent).count() == 2
        assert db.query(IoDraftReservation).count() == (1 if first_action == "edit" else 0)
        requests = db.query(StockRequest).all()
        assert len(requests) == (1 if first_action == "submit" else 0)
        if requests:
            assert requests[0].status == StockRequestStatusEnum.RESERVED
        assert db.query(Inventory).one().pending_quantity == (0 if first_action == "cancel" else 1)
        assert db.query(Inventory).one().warehouse_qty == 1
        assert db.query(TransactionLog).count() == 0
        if first_action == "cancel":
            cancel_work_reservation(
                db, batch_id=batch_id, expected_revision=1, reason="concurrent cancellation",
                request=_request(),
            )
            db.commit()
            assert batch.revision == 2
            assert db.query(IoWorkReservationEvent).count() == 2


def _submitted_approval(make_session: Callable[[], Session]) -> dict[str, uuid.UUID]:
    """Create one ordinary approval whose draft and approval each reserve once."""
    payload = setup_payload(make_session)
    with make_session() as db:
        owner = db.get(Employee, uuid.UUID(payload["requester_employee_id"]))
        owner.pin_hash = DEFAULT_PIN_HASH
        approver = Employee(
            employee_code="PG-APPROVER", name="Approver", role="staff",
            department=owner.department, warehouse_role="primary", is_active=True,
            pin_hash=DEFAULT_PIN_HASH,
        )
        db.add(approver)
        db.commit()
        actor_id = approver.employee_id
        saved = _save(db, payload)
        batch_id = uuid.UUID(str(saved["batch_id"]))
        io_actions.submit_existing_draft(
            db, batch_id=batch_id, requester_employee_id=owner.employee_id, expected_revision=1,
        )
        return {
            "batch_id": batch_id, "owner_id": owner.employee_id, "actor_id": actor_id,
            "request_id": db.query(StockRequest).one().request_id,
        }


@pytest.mark.parametrize(
    ("first_action", "second_action"),
    [("revert", "approve"), ("approve", "revert"), ("revert", "cancel"), ("cancel", "revert")],
)
def test_postgres_request_edit_vs_approval_or_cancel_preserves_single_ledger(
    postgres_make_session, first_action: str, second_action: str,
) -> None:
    ids = _submitted_approval(postgres_make_session)
    batch_id, request_id = ids["batch_id"], ids["request_id"]

    def command(action: str) -> Command:
        def execute(db: Session) -> Any:
            request = db.get(StockRequest, request_id)
            owner = db.get(Employee, ids["owner_id"])
            if action == "revert":
                return stock_request_actions.revert_to_draft(
                    db, request=request, requester=owner, pin="0000", expected_revision=2,
                )
            if action == "approve":
                return stock_request_actions.approve_warehouse_request(
                    db, request, approver=db.get(Employee, ids["actor_id"]), pin="0000",
                )
            return stock_request_actions.cancel_request(db, request, requester=owner, pin="0000")
        return execute

    first, second = _locked_race(
        postgres_make_session, command(first_action), command(second_action),
    )
    assert first["ok"], first
    if second_action == "revert":
        assert second["code"] == "WORK_REVISION_CONFLICT", second
    else:
        # Existing approval/cancellation APIs may reject or return an unchanged terminal request.
        assert second.get("code") in {None, "ValueError", "WORK_STATE_CONFLICT"}, second
    with postgres_make_session() as db:
        batch = db.get(IoBatch, batch_id)
        assert batch.revision == 3
        assert batch.status == {"revert": "draft", "approve": "completed", "cancel": "cancelled"}[first_action]
        assert db.query(IoDraftReservation).count() == (1 if first_action == "revert" else 0)
        assert db.query(Inventory).one().pending_quantity == (1 if first_action == "revert" else 0)
        assert db.query(Inventory).one().warehouse_qty == (0 if first_action == "approve" else 1)
        assert db.query(TransactionLog).count() == (1 if first_action == "approve" else 0)
        assert db.get(StockRequest, request_id).status == (
            StockRequestStatusEnum.COMPLETED if first_action == "approve" else StockRequestStatusEnum.CANCELLED
        )


def test_postgres_ordinary_failure_record_cannot_overwrite_intervening_request_edit(
    postgres_make_session, monkeypatch,
) -> None:
    ids = _submitted_approval(postgres_make_session)
    failure_rolled_back = Event()
    allow_failure_record = Event()
    record_failed = stock_request_actions._record_failed_decision

    def fail_execution(*args: Any, **kwargs: Any) -> None:
        raise ValueError("forced ordinary approval failure")

    def pause_failure_record(*args: Any, **kwargs: Any) -> Any:
        failure_rolled_back.set()
        assert allow_failure_record.wait(timeout=15)
        return record_failed(*args, **kwargs)

    def approve() -> dict[str, Any]:
        with postgres_make_session() as db:
            return _outcome(lambda session: stock_request_actions.approve_warehouse_request(
                session, session.get(StockRequest, ids["request_id"]),
                approver=session.get(Employee, ids["actor_id"]), pin="0000",
            ), db)

    monkeypatch.setattr(sr_approval, "_execute_all_lines", fail_execution)
    monkeypatch.setattr(stock_request_actions, "_record_failed_decision", pause_failure_record)
    with ThreadPoolExecutor(max_workers=1) as pool:
        failing = pool.submit(approve)
        try:
            assert failure_rolled_back.wait(timeout=10)
            with postgres_make_session() as db:
                stock_request_actions.revert_to_draft(
                    db, request=db.get(StockRequest, ids["request_id"]),
                    requester=db.get(Employee, ids["owner_id"]), pin="0000", expected_revision=2,
                )
        finally:
            allow_failure_record.set()
        assert failing.result(timeout=10)["code"] == "WORK_REVISION_CONFLICT"
    with postgres_make_session() as db:
        batch = db.get(IoBatch, ids["batch_id"])
        assert (batch.status, batch.revision, batch.reservation_status) == ("draft", 3, "reserved")
        assert db.get(StockRequest, ids["request_id"]).status == StockRequestStatusEnum.CANCELLED
        assert db.query(IoDraftReservation).one().quantity == 1
        assert db.query(Inventory).one().pending_quantity == 1
        assert db.query(Inventory).one().warehouse_qty == 1
        assert db.query(TransactionLog).count() == 0
        assert db.query(IoWorkReservationEvent).filter_by(action="settlement_failed").count() == 0


def test_postgres_failed_final_approval_holds_lock_through_failure_commit(
    postgres_make_session, monkeypatch,
) -> None:
    ids = _setup(postgres_make_session)
    _preapprove_warehouse(postgres_make_session, ids)
    original_apply = io_dispatch._apply_line
    applied_lines = 0
    with postgres_make_session() as db:
        initial_revision = db.get(IoBatch, ids["batch_id"]).revision

    def fail_after_one_line(*args: Any, **kwargs: Any) -> Any:
        nonlocal applied_lines
        if current_thread().name == "cp7-first":
            applied_lines += 1
            if applied_lines == 2:
                raise RuntimeError("forced failure after first physical effect")
        return original_apply(*args, **kwargs)

    def approve(db: Session) -> None:
        stock_request_actions.approve_department_request(
            db, db.get(StockRequest, ids["department_request_id"]),
            approver=db.get(Employee, ids["department_approver_id"]), pin="0000",
        )

    monkeypatch.setattr(io_dispatch, "_apply_line", fail_after_one_line)
    first, second = _locked_race(postgres_make_session, approve, approve)
    assert first["code"] == "IO_SETTLEMENT_FAILED_PERSISTED", first
    assert first["extra"]["state_committed"] is True
    assert not second["ok"], second
    assert applied_lines == 2
    with postgres_make_session() as db:
        batch = db.get(IoBatch, ids["batch_id"])
        assert batch.status == "failed"
        assert batch.revision == initial_revision + 1
        assert batch.reservation_status == "inactive"
        assert {row.status for row in db.query(StockRequest)} == {StockRequestStatusEnum.FAILED_APPROVAL}
        assert db.query(IoDraftReservation).count() == 0
        assert db.query(TransactionLog).count() == 0
        assert all(row.quantity == 5 and row.pending_quantity == 0 for row in db.query(Inventory))
        assert db.query(InventoryLocation).one().quantity == 5
        assert db.query(InventoryLocation).one().pending_quantity == 0
        assert db.query(IoWorkReservationEvent).filter_by(action="settlement_failed").count() == 1
