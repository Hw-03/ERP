"""Real SQLite transactions serialize recovery fences against original deliveries."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event, Lock, current_thread
import uuid

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app import models
from app.database import Base
from app.services import stocktake, stocktake_closing, stocktake_resolution
from app.services.inventory_conflicts import InventoryConflict
from tests.services.test_stocktake_application import confirm, preview
from tests.services.test_stocktake_close_contract import _close_preview
from tests.services.test_stocktake_counts import setup_round, start_count
from tests.services.test_stocktake_bulk_application import bulk_preview


@pytest.fixture
def file_engine(tmp_path: Path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'recovery.db').as_posix()}", connect_args={"check_same_thread": False, "timeout": 5})

    @event.listens_for(engine, "connect")
    def configure(raw, _record):
        raw.isolation_level = None
        raw.execute("PRAGMA foreign_keys=ON")

    @event.listens_for(engine, "begin")
    def begin(connection):
        connection.exec_driver_sql("BEGIN IMMEDIATE")

    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


def scenario(engine, kind: str) -> tuple:
    """Build synthetic stock and a valid command without the memory-DB pytest fixture."""
    with Session(engine) as db:
        db.add(models.ProcessType(code="TR", prefix="T", suffix="R", stage_order=10))
        db.commit()

        def item(*, name: str, warehouse_qty: int):
            row = models.Item(item_name=name, process_type_code="TR", unit="EA", model_symbol="9", serial_no=1)
            db.add(row)
            db.flush()
            db.add(models.Inventory(item_id=row.item_id, quantity=warehouse_qty, warehouse_qty=warehouse_qty, pending_quantity=0))
            return row

        env = setup_round(db, item, new_policy=kind.startswith("application_bulk_"))
        if kind == "count_save":
            count = start_count(db, env)
            payload = {"count_id": count["count_id"], "expected_version": count["version"], "fence": count["fence"],
                       "quantities": {"normal": 12, "defect": 0, "b_grade": 0, "obsolete": 0}}
        else:
            count = confirm(db, env, normal=12)
            proposal = bulk_preview(db, env, [count]) if kind == "application_bulk_apply" else preview(db, env, count) if kind == "application_apply" else _close_preview(
                db, env, mode="FULL", reason="", selected=[count["confirmation_revision_id"]])
            payload = {"round_id": env[3]["round_id"], "preview_id": proposal["preview_id"], "preview_hash": proposal["preview_hash"]}
        return env[1].employee_id, env[2].item_id, payload


@pytest.mark.parametrize("kind", ["count_save", "application_apply", "application_bulk_apply", "round_close"])
@pytest.mark.parametrize("winner", ["original", "resolve"])
def test_original_retry_and_resolution_have_one_durable_outcome(file_engine, kind, winner, monkeypatch):
    actor_id, item_id, payload = scenario(file_engine, kind)
    key = str(uuid.uuid4())
    claimed, release, contenders = Event(), Event(), Event()
    guard = Lock()
    attempts = 0
    claim = stocktake.claim_receipt

    def pause_first(*args, **kwargs):
        receipt = claim(*args, **kwargs)
        if not claimed.is_set():
            claimed.set()
            assert release.wait(8), "test did not release winning transaction"
        return receipt

    def attempted(_connection):
        nonlocal attempts
        if current_thread().name.startswith("recovery-race"):
            with guard:
                attempts += 1
                if attempts >= 3:
                    contenders.set()

    monkeypatch.setattr(stocktake, "claim_receipt", pause_first)
    # Registered before SQL BEGIN so waiting connections are observed, not inferred.
    event.listen(file_engine, "before_cursor_execute", lambda _c, _cur, sql, _p, _ctx, _many: attempted(_c) if sql == "BEGIN IMMEDIATE" else None)

    def run(action: str):
        with Session(file_engine) as db:
            actor = db.get(models.Employee, actor_id)
            try:
                return stocktake_resolution.resolve(db, actor, kind, key, payload, "Tab closed") if action == "resolve" else stocktake.execute(db, actor, kind, key, payload)
            except InventoryConflict as failure:
                return {"error": failure.code}

    with ThreadPoolExecutor(max_workers=3, thread_name_prefix="recovery-race") as pool:
        first = pool.submit(run, winner)
        try:
            assert claimed.wait(8)
            second = pool.submit(run, "resolve" if winner == "original" else "original")
            third = pool.submit(run, "original")
            assert contenders.wait(8), "both competing connections must attempt the real DB lock"
        finally:
            release.set()
        outcomes = [future.result(timeout=10) for future in (first, second, third)]
    with Session(file_engine) as db:
        receipt = db.query(models.StocktakeReceipt).filter_by(command_kind=kind, idempotency_key=key).one()
        inventory = db.query(models.Inventory).filter_by(item_id=item_id).one()
        if winner == "resolve":
            assert outcomes[0]["resolution"] == "NOT_APPLIED"
            assert outcomes[1:] == [{"error": "COMMAND_NOT_APPLIED"}] * 2
            assert receipt.response["_command_resolution"] == "NOT_APPLIED"
            assert inventory.warehouse_qty == 10
            assert db.query(models.StocktakeApplication).count() == 0
            assert db.query(models.StocktakeCloseCommit).count() == 0
        else:
            assert outcomes[1]["resolution"] == "COMPLETED"
            assert outcomes[0] == outcomes[1]["result"] == outcomes[2] == receipt.response
            assert inventory.warehouse_qty == (10 if kind == "count_save" else 12)
            assert db.query(models.StocktakeApplication).count() == (0 if kind == "count_save" else 1)
        assert db.query(models.TransactionLog).count() == (1 if winner == "original" and kind != "count_save" else 0)
        assert db.query(models.StocktakeEvent).filter_by(kind="ROUND_CLOSED").count() == (1 if winner == "original" and kind == "round_close" else 0)
        assert inventory.pending_quantity == 0
        assert db.query(models.ShippingAllocation).count() == 0
        if kind == "count_save":
            saved = db.get(models.StocktakeCount, uuid.UUID(payload["count_id"]))
            assert saved.version == payload["expected_version"] + int(winner == "original")


def test_close_preview_fenced_during_chunking_never_publishes(file_engine, monkeypatch):
    actor_id, _, payload = scenario(file_engine, "count_save")
    with Session(file_engine) as db:
        actor = db.get(models.Employee, actor_id)
        count = db.get(models.StocktakeCount, uuid.UUID(payload["count_id"]))
        command_payload = {"round_id": str(count.round_id), "mode": "PARTIAL", "reason": "Review", "confirmation_revision_ids": []}
    key = str(uuid.uuid4())
    verify = stocktake_closing._verify_chunks

    def fence_after_chunks(db, row):
        verify(db, row)
        db.rollback()
        with Session(file_engine) as resolver:
            result = stocktake_resolution.resolve(resolver, resolver.get(models.Employee, actor_id), "round_close_preview", key, command_payload, "Stop preview")
            assert result["resolution"] == "NOT_APPLIED"

    monkeypatch.setattr(stocktake_closing, "_verify_chunks", fence_after_chunks)
    with Session(file_engine) as db:
        with pytest.raises(InventoryConflict) as error:
            stocktake.execute(db, db.get(models.Employee, actor_id), "round_close_preview", key, command_payload)
        assert error.value.code == "COMMAND_NOT_APPLIED"
        assert db.query(models.StocktakeCloseChunk).count() > 0
        assert db.query(models.StocktakeCloseSeal).count() == 0
        assert db.query(models.StocktakeCloseCommit).count() == 0


@pytest.mark.parametrize("committed", [False, True])
def test_resolution_commit_failure_keeps_a_recoverable_outcome(file_engine, monkeypatch, committed):
    actor_id, _, payload = scenario(file_engine, "count_save")
    key = str(uuid.uuid4())
    with Session(file_engine) as db:
        actor = db.get(models.Employee, actor_id)
        commit = db.commit

        def lose_ack():
            if committed:
                commit()
            else:
                db.flush()
            raise DBAPIError("COMMIT", {}, OSError("lost commit acknowledgement"))

        with monkeypatch.context() as patch:
            patch.setattr(db, "commit", lose_ack)
            with pytest.raises(InventoryConflict) as error:
                stocktake_resolution.resolve(db, actor, "count_save", key, payload, "Uncertain delivery")
            assert error.value.code == "COMMAND_RESULT_UNKNOWN"
    with Session(file_engine) as db:
        assert db.query(models.StocktakeReceipt).filter_by(idempotency_key=key).count() == int(committed)
        outcome = stocktake_resolution.resolve(db, db.get(models.Employee, actor_id), "count_save", key, payload, "Retry resolution")
        assert outcome["resolution"] == "NOT_APPLIED"
        assert db.query(models.StocktakeReceipt).filter_by(idempotency_key=key).count() == 1
