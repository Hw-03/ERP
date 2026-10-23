"""Real connection races on disposable copies of the complete development dataset.

PAUSE_PG_TEMPLATE_URL must identify the dedicated loopback pause_clone_base DB;
PAUSE_PG_DATA_DIRECTORY must match SHOW data_directory. The template is read-only.
Each case copies it, performs the real POOL cutover, and uses existing employees
and AR items. Only scenario quantities in that disposable copy are changed.
"""
from __future__ import annotations

from collections.abc import Callable, Generator
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import importlib
import json
import os
from pathlib import Path
from threading import Barrier, Event, Lock
from time import monotonic, sleep
from typing import Any
import uuid

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app import models as m
from app.schemas.io import IoDraftUpsert
from app.services import io_draft, pool_cutover, sr_draft, stocktake, stocktake_counts
from app.services.inventory_conflicts import InventoryConflict
from app.services.sr_validation import LineInput
from app.services.work_reservation_errors import WorkReservationError
from app.services.work_stocktake_pause import pause_payload
from tests.services.test_io_draft_reservations import draft_payload


Command = Callable[[Session], Any]
Factory = Callable[[], Session]


@pytest.fixture
def cloned_pg(monkeypatch: pytest.MonkeyPatch) -> Generator[Factory, None, None]:
    """Never create/drop a schema or database outside the dedicated cloned cluster."""
    raw_url = os.environ.get("PAUSE_PG_TEMPLATE_URL")
    if not raw_url:
        pytest.skip("PAUSE_PG_TEMPLATE_URL is required for full-development-clone races")
    url = make_url(raw_url)
    expected_directory = os.environ.get("PAUSE_PG_DATA_DIRECTORY", "")
    assert url.get_backend_name() == "postgresql"
    assert url.host == "127.0.0.1" and url.username == "pause_test"
    assert url.database == "pause_clone_base" and url.port and url.port != 5432
    assert expected_directory and Path(expected_directory).is_absolute()
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT",
                          poolclass=NullPool, hide_parameters=True)
    case_name = "pause_race_" + uuid.uuid4().hex
    engine = None
    created = False
    try:
        with admin.connect() as conn:
            actual_directory = conn.execute(text("SHOW data_directory")).scalar_one()
            assert Path(actual_directory).resolve() == Path(expected_directory).resolve()
            assert conn.execute(text("SHOW server_version_num")).scalar_one().startswith("16")
            conn.execute(text(f'CREATE DATABASE "{case_name}" TEMPLATE "pause_clone_base"'))
            created = True
        engine = create_engine(url.set(database=case_name), poolclass=NullPool, hide_parameters=True)
        factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        for module in ("inv_base", "inv_effect", "sr_execution", "dept_adjustment",
                       "inventory_operation_cancellation", "legacy_inventory_operation_adoption"):
            monkeypatch.setattr(importlib.import_module(f"app.services.{module}"), "_is_sqlite", False)
        with factory() as db:
            assert db.execute(text("SELECT current_database()")).scalar_one() == case_name
            assert db.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "20261023_0049"
            control = db.get(m.StocktakeControl, 1)
            assert control.inventory_mode == "LEGACY" and control.active_round_id is None
            actor = db.query(m.Employee).filter_by(is_active=True).filter(
                m.Employee.department_role.in_(["primary", "deputy"])).order_by(m.Employee.employee_id).first()
            assert actor is not None, "The clone needs a real active department approver"
            plan = pool_cutover.preflight(db)
            assert not plan["blocking"], "The source clone must pass the real cutover preflight"
            pool_cutover.apply_cutover(db, cutover_id=uuid.uuid4(),
                expected_fingerprint=plan["source_fingerprint"], actor_id=actor.employee_id)
            db.commit()
            assert db.get(m.StocktakeControl, 1).inventory_mode == "POOL"
            print(json.dumps({"case_db": case_name, "pool_cutover": "applied",
                "items": db.query(m.Item).count(), "employees": db.query(m.Employee).count()}))
        yield factory
    finally:
        if engine is not None:
            engine.dispose()
        if created:
            with admin.connect() as conn:
                # Exactly the generated database; never terminate other cluster sessions.
                conn.execute(text(f'DROP DATABASE "{case_name}" WITH (FORCE)'))
        admin.dispose()


def _scenario(factory: Factory, *, quantity: int = 1) -> dict[str, Any]:
    """Select genuine catalog/employee identities and isolate only their stock cells."""
    with factory() as db:
        actor = db.query(m.Employee).filter_by(is_active=True).filter(
            m.Employee.department_role.in_(["primary", "deputy"])).order_by(m.Employee.employee_id).first()
        reserved_requests = db.query(m.StockRequestLine.item_id).join(m.StockRequest).filter(
            m.StockRequest.status.in_([m.StockRequestStatusEnum.SUBMITTED, m.StockRequestStatusEnum.RESERVED]))
        shipping = db.query(m.ShippingAllocation.item_id).filter(m.ShippingAllocation.status == "RESERVED")
        draft_reserved = db.query(m.IoDraftReservation.item_id)
        candidates = db.query(m.Item).filter(m.Item.process_type_code == "AR", m.Item.deleted_at.is_(None),
            ~m.Item.item_id.in_(reserved_requests), ~m.Item.item_id.in_(shipping),
            ~m.Item.item_id.in_(draft_reserved),
            ~m.Item.item_id.in_(db.query(m.DefectStockPool.item_id))).order_by(m.Item.item_id).limit(2).all()
        assert len(candidates) == 2, "The full clone needs two unreserved real AR items"
        for item in candidates:
            inventory = db.query(m.Inventory).filter_by(item_id=item.item_id).one()
            inventory.quantity = inventory.warehouse_qty = quantity
            inventory.pending_quantity = 0
            for location in db.query(m.InventoryLocation).filter_by(item_id=item.item_id):
                location.quantity = location.pending_quantity = 0
        setting = db.get(m.SystemSetting, "warehouse_box_tracking_enabled")
        if setting is not None:
            setting.setting_value = "false"
        db.commit()
        return {"actor_id": actor.employee_id, "item_ids": [i.item_id for i in candidates],
                "payloads": [draft_payload(actor, item, quantity=1) for item in candidates],
                "log_count": db.query(m.TransactionLog).count()}


def _save(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    """Execute the actual draft service and leave its transaction to the caller."""
    return io_draft.save_draft(db, IoDraftUpsert.model_validate(payload))


def _execute(db: Session, case: dict[str, Any], kind: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Use independent command receipts and the genuine authenticated service boundary."""
    return stocktake.execute(db, db.get(m.Employee, case["actor_id"]), kind, str(uuid.uuid4()), payload)


def _start_preview(factory: Factory, case: dict[str, Any]) -> dict[str, Any]:
    """Prepare the complete real catalog target set, without hand-seeded targets."""
    with factory() as db:
        preview = _execute(db, case, "round_start_preview", {"title": "Disposable clone race"})
    return {"preview_id": preview["preview_id"], "preview_hash": preview["preview_hash"]}


def _start_round(factory: Factory, case: dict[str, Any]) -> None:
    """Publish the real target set and atomically pause all copied drafts."""
    preview = _start_preview(factory, case)
    with factory() as db:
        case["round"] = _execute(db, case, "round_start", preview)


def _count_payload(factory: Factory, case: dict[str, Any], item_id: uuid.UUID, scope: str) -> dict[str, Any]:
    """Read the current target version instead of assuming a seeded attempt state."""
    with factory() as db:
        target = db.query(m.StocktakeTarget).join(m.StocktakeTargetSet).filter(
            m.StocktakeTargetSet.round_id == uuid.UUID(case["round"]["round_id"]),
            m.StocktakeTarget.item_id == item_id, m.StocktakeTarget.scope_key == scope).one()
        return {"target_id": str(target.target_id), "expected_target_version": target.version,
                "round_epoch": case["round"]["epoch"]}


def _prepare_application(factory: Factory, case: dict[str, Any], item_id: uuid.UUID,
                         scope: str, *, normal: int | None = None) -> dict[str, Any]:
    """Run count/start/save/confirm and seal a real application preview."""
    payload = _count_payload(factory, case, item_id, scope)
    with factory() as db:
        count = _execute(db, case, "count_start", payload)
        target = db.get(m.StocktakeTarget, uuid.UUID(payload["target_id"]))
        quantities = stocktake_counts.figures(db, target)["quantities"]
        if normal is not None:
            quantities["normal"] = normal
        for kind, extra in (("count_save", {"quantities": quantities}), ("count_confirm", {})):
            count = _execute(db, case, kind, {"count_id": count["count_id"],
                "expected_version": count["version"], "fence": count["fence"], **extra})
        preview = _execute(db, case, "application_preview", {"round_id": case["round"]["round_id"],
            "confirmation_revision_ids": [count["confirmation_revision_id"]]})
        return {"round_id": case["round"]["round_id"], "preview_id": preview["preview_id"],
                "preview_hash": preview["preview_hash"]}


def _apply_item(factory: Factory, case: dict[str, Any], item_id: uuid.UUID,
                *, warehouse_quantity: int = 1, last_pending: bool = False) -> dict[str, Any] | None:
    """Apply the destination first and optionally leave the source's final application pending."""
    with factory() as db:
        destination = db.query(m.InventoryScope).filter_by(physical_department=m.DepartmentEnum.ASSEMBLY.value).one().scope_key
    last = None
    for scope in (destination, "warehouse"):
        last = _prepare_application(factory, case, item_id, scope,
            normal=warehouse_quantity if scope == "warehouse" else 0)
        if scope == "warehouse" and last_pending:
            return last
        with factory() as db:
            _execute(db, case, "application_apply", last)
    return last


def _resume_payload(factory: Factory, payload: dict[str, Any], batch_id: uuid.UUID) -> dict[str, Any]:
    """Capture exactly the revision and token a client would submit for remaining work."""
    with factory() as db:
        batch = db.get(m.IoBatch, batch_id)
        pause = pause_payload(db, "io", batch_id)
        assert pause is not None
        return {**deepcopy(payload), "batch_id": str(batch_id), "expected_revision": batch.revision,
                "stocktake_resume_token": pause["token"]}


def _saved(factory: Factory, payload: dict[str, Any]) -> uuid.UUID:
    """Persist a real draft before opening the competing connections."""
    with factory() as db:
        result = _save(db, payload)
        db.commit()
        return uuid.UUID(str(result["batch_id"]))


def _outcome(db: Session, command: Command) -> dict[str, Any]:
    """Expose only expected domain failures; database/deadlock errors fail the test."""
    try:
        result = command(db)
        db.commit()
        return {"ok": True, "value": result}
    except (WorkReservationError, InventoryConflict) as exc:
        db.rollback()
        return {"ok": False, "code": exc.code}


def _race(factory: Factory, first: Command, second: Command, *, blocked: bool = True) -> tuple[dict, dict]:
    """Prove PID blocking, or second commit before first release, on separate connections."""
    at_commit, release, connected = Event(), Event(), Event()
    pids: dict[str, int] = {}
    evidence: dict[str, Any] = {}

    def run(role: str, command: Command) -> dict[str, Any]:
        with factory() as db:
            pids[role] = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            db.execute(text("SET lock_timeout = '20s'"))
            db.execute(text("SET statement_timeout = '30s'"))
            if role == "first":
                held = False

                @event.listens_for(db, "before_commit")
                def hold(session: Session) -> None:
                    nonlocal held
                    if held or session.in_nested_transaction():
                        return
                    session.flush()
                    held = True
                    at_commit.set()
                    assert release.wait(30), "first transaction release timed out"
            else:
                connected.set()
            return _outcome(db, command)

    with ThreadPoolExecutor(max_workers=2) as pool:
        winner = pool.submit(run, "first", first)
        try:
            assert at_commit.wait(25), winner.result(1) if winner.done() else "first never reached commit"
            contender = pool.submit(run, "second", second)
            assert connected.wait(10)
            assert pids["first"] != pids["second"]
            with factory() as observer:
                evidence["case_db"] = observer.execute(text("SELECT current_database()")).scalar_one()
                deadline = monotonic() + 10
                saw_block = False
                while monotonic() < deadline:
                    blockers = observer.execute(text("SELECT pg_blocking_pids(:pid)"),
                        {"pid": pids["second"]}).scalar_one()
                    if pids["first"] in blockers:
                        saw_block = True
                        break
                    if contender.done():
                        break
                    sleep(0.01)
            if blocked:
                assert saw_block, contender.result(1) if contender.done() else "no actual PG blocker"
                evidence.update(blocking_pid=pids["first"], waiting_pid=pids["second"])
            else:
                assert not saw_block, "unrelated work unexpectedly blocked on first transaction"
                result = contender.result(10)
                assert result["ok"] and not release.is_set(), result
                evidence.update(second_committed_before_first_release=True, backend_pids=pids)
        finally:
            release.set()
        results = winner.result(20), contender.result(20)
    evidence["outcomes"] = ["ok" if result["ok"] else result["code"] for result in results]
    print(json.dumps(evidence))
    return results


def _assert_reserved(factory: Factory, item_id: uuid.UUID, batch_id: uuid.UUID) -> None:
    """A single reservation must agree with inventory and the removed pause boundary."""
    with factory() as db:
        inventory = db.query(m.Inventory).filter_by(item_id=item_id).one()
        assert (inventory.quantity, inventory.warehouse_qty, inventory.pending_quantity) == (1, 1, 1)
        assert all(row.quantity == 0 for row in db.query(m.InventoryLocation).filter_by(item_id=item_id))
        rows = db.query(m.IoDraftReservation).filter_by(item_id=item_id).all()
        assert len(rows) == 1 and rows[0].batch_id == batch_id and rows[0].quantity == 1
        assert db.query(m.IoWorkReservationEvent).filter_by(batch_id=batch_id, action="stocktake_resumed").count() == 1
        assert pause_payload(db, "io", batch_id) is None


@pytest.mark.parametrize("start_first", [False, True])
def test_clone_save_and_round_start_serialize(cloned_pg: Factory, start_first: bool) -> None:
    case = _scenario(cloned_pg)
    preview = _start_preview(cloned_pg, case)
    save = lambda db: _save(db, case["payloads"][0])
    start = lambda db: _execute(db, case, "round_start", preview)
    first, second = _race(cloned_pg, start if start_first else save, save if start_first else start)
    assert first["ok"] and second["ok"]
    saved = second["value"] if start_first else first["value"]
    with cloned_pg() as db:
        batch = db.get(m.IoBatch, uuid.UUID(str(saved["batch_id"])))
        assert batch.status == "draft" and batch.reservation_status == "inactive"
        assert batch.bundles[0].lines[0].quantity == 1
        assert batch.revision == (1 if start_first else 2)
        assert pause_payload(db, "io", batch.batch_id)["state"] == "blocked"
        assert db.query(m.IoDraftReservation).filter_by(batch_id=batch.batch_id).count() == 0
        inventory = db.query(m.Inventory).filter_by(item_id=case["item_ids"][0]).one()
        assert (inventory.quantity, inventory.warehouse_qty, inventory.pending_quantity) == (1, 1, 0)
        assert all(row.quantity == 0 for row in db.query(m.InventoryLocation).filter_by(item_id=inventory.item_id))
        assert db.query(m.TransactionLog).count() == case["log_count"]


@pytest.mark.parametrize("same_draft", [True, False])
def test_clone_duplicate_resume_and_last_unit(cloned_pg: Factory, same_draft: bool) -> None:
    case = _scenario(cloned_pg, quantity=2 if not same_draft else 1)
    original = case["payloads"][0]
    first_id = _saved(cloned_pg, original)
    other = deepcopy(original)
    other["client_request_id"] = str(uuid.uuid4())
    other["bundles"][0]["bundle_id"] = str(uuid.uuid4())
    other["bundles"][0]["lines"][0]["line_id"] = str(uuid.uuid4())
    second_id = first_id if same_draft else _saved(cloned_pg, other)
    _start_round(cloned_pg, case)
    _apply_item(cloned_pg, case, case["item_ids"][0])
    first_payload = _resume_payload(cloned_pg, original, first_id)
    second_payload = first_payload if same_draft else _resume_payload(cloned_pg, other, second_id)
    first, second = _race(cloned_pg, lambda db: _save(db, first_payload), lambda db: _save(db, second_payload))
    assert first["ok"]
    assert second["code"] == ("WORK_REVISION_CONFLICT" if same_draft else "STOCK_SHORTAGE")
    _assert_reserved(cloned_pg, case["item_ids"][0], first_id)
    if not same_draft:
        with cloned_pg() as db:
            loser = db.get(m.IoBatch, second_id)
            assert loser.revision == second_payload["expected_revision"]
            assert pause_payload(db, "io", second_id)["token"] == second_payload["stocktake_resume_token"]


@pytest.mark.parametrize("recount_first", [False, True])
def test_clone_resume_and_recount_serialize(cloned_pg: Factory, recount_first: bool) -> None:
    case = _scenario(cloned_pg)
    batch_id = _saved(cloned_pg, case["payloads"][0])
    _start_round(cloned_pg, case)
    _apply_item(cloned_pg, case, case["item_ids"][0])
    resume_payload = _resume_payload(cloned_pg, case["payloads"][0], batch_id)
    recount_payload = _count_payload(cloned_pg, case, case["item_ids"][0], "warehouse")
    resume = lambda db: _save(db, resume_payload)
    recount = lambda db: _execute(db, case, "count_start", recount_payload)
    first, second = _race(cloned_pg, recount if recount_first else resume, resume if recount_first else recount)
    assert first["ok"]
    assert second.get("code") == ("WORK_REVISION_CONFLICT" if recount_first else None)
    with cloned_pg() as db:
        pause = pause_payload(db, "io", batch_id)
        assert pause["state"] == "blocked" and pause["token"] != resume_payload["stocktake_resume_token"]
        inventory = db.query(m.Inventory).filter_by(item_id=case["item_ids"][0]).one()
        assert (inventory.quantity, inventory.warehouse_qty, inventory.pending_quantity) == (1, 1, 0)
        assert all(row.quantity == 0 for row in db.query(m.InventoryLocation).filter_by(item_id=inventory.item_id))
        assert db.query(m.IoDraftReservation).filter_by(batch_id=batch_id).count() == 0
        assert db.get(m.IoBatch, batch_id).bundles[0].lines[0].quantity == 1


def test_clone_last_application_then_resume(cloned_pg: Factory) -> None:
    case = _scenario(cloned_pg)
    batch_id = _saved(cloned_pg, case["payloads"][0])
    _start_round(cloned_pg, case)
    application = _apply_item(cloned_pg, case, case["item_ids"][0], last_pending=True)
    resume = _resume_payload(cloned_pg, case["payloads"][0], batch_id)
    with cloned_pg() as db:
        assert pause_payload(db, "io", batch_id)["state"] == "blocked"
    first, second = _race(cloned_pg, lambda db: _execute(db, case, "application_apply", application),
        lambda db: _save(db, resume))
    assert first["ok"] and second["ok"]
    _assert_reserved(cloned_pg, case["item_ids"][0], batch_id)


def test_clone_unrelated_resume_and_application_do_not_block(cloned_pg: Factory) -> None:
    case = _scenario(cloned_pg)
    batch_id = _saved(cloned_pg, case["payloads"][0])
    _start_round(cloned_pg, case)
    _apply_item(cloned_pg, case, case["item_ids"][0])
    application = _prepare_application(cloned_pg, case, case["item_ids"][1], "warehouse", normal=2)
    resume = _resume_payload(cloned_pg, case["payloads"][0], batch_id)
    first, second = _race(cloned_pg, lambda db: _save(db, resume),
        lambda db: _execute(db, case, "application_apply", application), blocked=False)
    assert first["ok"] and second["ok"]
    _assert_reserved(cloned_pg, case["item_ids"][0], batch_id)
    with cloned_pg() as db:
        assert db.query(m.Inventory).filter_by(item_id=case["item_ids"][1]).one().warehouse_qty == 2


def test_clone_legacy_duplicate_resume_token(cloned_pg: Factory) -> None:
    case = _scenario(cloned_pg)

    def legacy_save(db: Session, token: uuid.UUID | None = None) -> Any:
        return sr_draft.upsert_draft_request(db, requester=db.get(m.Employee, case["actor_id"]),
            request_type=m.StockRequestTypeEnum.WAREHOUSE_TO_DEPT, reference_no=None, notes="Clone race",
            lines_input=[LineInput(item_id=case["item_ids"][0], quantity=1,
                from_bucket=m.RequestBucketEnum.WAREHOUSE, from_department=None,
                to_bucket=m.RequestBucketEnum.PRODUCTION, to_department=m.DepartmentEnum.ASSEMBLY.value)],
            stocktake_resume_token=token)

    with cloned_pg() as db:
        request_id = legacy_save(db).request_id
        db.commit()
    _start_round(cloned_pg, case)
    _apply_item(cloned_pg, case, case["item_ids"][0])
    with cloned_pg() as db:
        token = uuid.UUID(pause_payload(db, "stock_request", request_id)["token"])
    first, second = _race(cloned_pg, lambda db: legacy_save(db, token), lambda db: legacy_save(db, token))
    assert first["ok"] and second["code"] == "WORK_STOCKTAKE_PAUSED"
    with cloned_pg() as db:
        request = db.get(m.StockRequest, request_id)
        assert request.status == m.StockRequestStatusEnum.DRAFT and len(request.lines) == 1
        assert request.lines[0].quantity == 1
        assert pause_payload(db, "stock_request", request_id) is None
        inventory = db.query(m.Inventory).filter_by(item_id=case["item_ids"][0]).one()
        assert (inventory.quantity, inventory.warehouse_qty, inventory.pending_quantity) == (1, 1, 0)
        assert all(row.quantity == 0 for row in db.query(m.InventoryLocation).filter_by(item_id=inventory.item_id))


def _simultaneous_resumes(factory: Factory, payloads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Open both first target-lock queries together, then observe the actual winning PID."""
    barrier, at_commit, release = Barrier(2), Event(), Event()
    winner_lock = Lock()
    state: dict[str, Any] = {"pids": {}, "winner": None}

    def run(index: int) -> dict[str, Any]:
        with factory() as db:
            state["pids"][index] = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
            db.execute(text("SET lock_timeout = '20s'"))
            db.execute(text("SET statement_timeout = '30s'"))
            entered = False

            @event.listens_for(db.connection(), "before_cursor_execute")
            def before_targets(conn: Any, cursor: Any, statement: str, parameters: Any,
                               context: Any, executemany: bool) -> None:
                nonlocal entered
                if not entered and "stocktake_targets" in statement and "FOR UPDATE" in statement:
                    entered = True
                    barrier.wait(15)

            @event.listens_for(db, "before_commit")
            def hold_winner(session: Session) -> None:
                if session.in_nested_transaction():
                    return
                with winner_lock:
                    if state["winner"] is not None:
                        return
                    state["winner"] = index
                session.flush()
                at_commit.set()
                assert release.wait(25)

            result = _outcome(db, lambda session: _save(session, payloads[index]))
            assert entered, "Both resumes must enter the real target FOR UPDATE query"
            return result

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(run, index) for index in (0, 1)]
        try:
            assert at_commit.wait(20), "Concurrent target acquisition did not reach a commit"
            winner = state["winner"]
            winning_pid, waiting_pid = state["pids"][winner], state["pids"][1 - winner]
            assert winning_pid != waiting_pid
            with factory() as observer:
                case_db = observer.execute(text("SELECT current_database()")).scalar_one()
                deadline = monotonic() + 10
                blocked = False
                while monotonic() < deadline:
                    blockers = observer.execute(text("SELECT pg_blocking_pids(:pid)"),
                        {"pid": waiting_pid}).scalar_one()
                    if winning_pid in blockers:
                        blocked = True
                        break
                    if futures[1 - winner].done():
                        break
                    sleep(0.01)
            if not blocked and futures[1 - winner].done():
                # Surface a deadlock/SQL failure instead of masking it as missing evidence.
                futures[1 - winner].result()
            assert blocked, "No actual PostgreSQL wait after simultaneous target acquisition"
        finally:
            release.set()
        results = [future.result(20) for future in futures]
    print(json.dumps({"case_db": case_db, "simultaneous_target_barrier": True,
        "blocking_pid": winning_pid, "waiting_pid": waiting_pid,
        "outcomes": ["ok" if result["ok"] else result["code"] for result in results]}))
    return results


def test_clone_reverse_multi_item_resumes_acquire_targets_without_deadlock(cloned_pg: Factory) -> None:
    case = _scenario(cloned_pg, quantity=2)
    first_payload = deepcopy(case["payloads"][0])
    first_payload["bundles"].extend(deepcopy(case["payloads"][1]["bundles"]))
    second_payload = deepcopy(first_payload)
    second_payload["client_request_id"] = str(uuid.uuid4())
    second_payload["bundles"].reverse()
    for bundle in second_payload["bundles"]:
        bundle["bundle_id"] = str(uuid.uuid4())
        for line in bundle["lines"]:
            line["line_id"] = str(uuid.uuid4())
    ids = [_saved(cloned_pg, payload) for payload in (first_payload, second_payload)]
    _start_round(cloned_pg, case)
    for item_id in case["item_ids"]:
        _apply_item(cloned_pg, case, item_id)
    resumes = [_resume_payload(cloned_pg, payload, batch_id)
        for payload, batch_id in zip((first_payload, second_payload), ids)]
    results = _simultaneous_resumes(cloned_pg, resumes)
    assert sorted("ok" if result["ok"] else result["code"] for result in results) == ["STOCK_SHORTAGE", "ok"]
    winner = next(index for index, result in enumerate(results) if result["ok"])
    for item_id in case["item_ids"]:
        _assert_reserved(cloned_pg, item_id, ids[winner])
    with cloned_pg() as db:
        for item_id in case["item_ids"]:
            assert db.query(m.Inventory).filter_by(item_id=item_id).one().quantity == 1
            assert all(row.quantity == 0 for row in db.query(m.InventoryLocation).filter_by(item_id=item_id))
        loser = db.get(m.IoBatch, ids[1 - winner])
        assert loser.revision == resumes[1 - winner]["expected_revision"]
        assert pause_payload(db, "io", loser.batch_id)["token"] == resumes[1 - winner]["stocktake_resume_token"]
        assert db.query(m.IoWorkReservationEvent).filter_by(batch_id=ids[winner], action="stocktake_resumed").count() == 1


def test_clone_resume_before_last_application_keeps_token_for_retry(cloned_pg: Factory) -> None:
    case = _scenario(cloned_pg)
    batch_id = _saved(cloned_pg, case["payloads"][0])
    _start_round(cloned_pg, case)
    application = _apply_item(cloned_pg, case, case["item_ids"][0], last_pending=True)
    resume = _resume_payload(cloned_pg, case["payloads"][0], batch_id)
    resume["notes"] = "Resume after final application"
    with cloned_pg() as db:
        before = pause_payload(db, "io", batch_id)
        rejected = _outcome(db, lambda session: _save(session, resume))
        assert rejected == {"ok": False, "code": "WORK_STOCKTAKE_PAUSED"}
        assert pause_payload(db, "io", batch_id) == before
        batch = db.get(m.IoBatch, batch_id)
        assert batch.revision == resume["expected_revision"] and batch.notes is None
        assert db.query(m.IoDraftReservation).filter_by(batch_id=batch_id).count() == 0
        _execute(db, case, "application_apply", application)
        retried = _outcome(db, lambda session: _save(session, resume))
        assert retried["ok"]
        assert db.get(m.IoBatch, batch_id).revision == resume["expected_revision"] + 1
        assert db.query(m.IoWorkReservationEvent).filter_by(batch_id=batch_id, action="stocktake_resumed").count() == 1
        inventory = db.query(m.Inventory).filter_by(item_id=case["item_ids"][0]).one()
        assert inventory.quantity == 1
        assert all(row.quantity == 0 for row in db.query(m.InventoryLocation).filter_by(item_id=inventory.item_id))
    _assert_reserved(cloned_pg, case["item_ids"][0], batch_id)
