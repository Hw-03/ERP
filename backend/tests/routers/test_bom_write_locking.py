"""BOM write responses must release SQLite's writer lock before serialization."""

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from threading import Event
from typing import Any
from uuid import UUID

from fastapi import HTTPException, Request
import pytest
from sqlalchemy import event, update
from sqlalchemy.orm import ORMExecuteState, Session, sessionmaker

from app import database
from app.models import AdminAuditLog, BOM, DataRevision, Inventory, Item, ProcessType
from app.routers import bom, items
from app.schemas import BOMCreate, BOMResponse, BOMUpdate, BomCompletionUpdate, ItemResponse
from app.services.realtime import register_session_listeners, unregister_session_listeners


@dataclass(frozen=True)
class BomDatabase:
    """Independent factories and committed IDs for a disposable database."""

    writer: sessionmaker
    reader: sessionmaker
    parent_id: UUID
    child_id: UUID
    extra_child_id: UUID
    other_id: UUID
    completed_parent_id: UUID
    bom_id: UUID


@pytest.fixture
def bom_database(tmp_path: Path) -> Iterator[BomDatabase]:
    """Exercise the real BEGIN IMMEDIATE policy without shared SAVEPOINTs."""
    url = f"sqlite:///{(tmp_path / 'bom-response.db').as_posix()}"
    writer_engine = database._create_database_engine(url)
    reader_engine = database._create_database_engine(url, sqlite_read_only=True)
    database.Base.metadata.create_all(writer_engine)
    writer = sessionmaker(bind=writer_engine, autoflush=False)
    reader = sessionmaker(bind=reader_engine, autoflush=False)
    with writer() as seed:
        seed.add(ProcessType(code="TR", prefix="T", suffix="R", stage_order=10))
        seed.add(DataRevision(id=1, revision=7))
        seed.flush()
        rows = [
            Item(item_name=name, model_symbol="9", process_type_code="TR", serial_no=index)
            for index, name in enumerate(("Parent", "Child", "Extra", "Other", "Completed"), 1)
        ]
        rows[-1].bom_completed_at = datetime(2026, 1, 1)
        seed.add_all(rows)
        seed.flush()
        parent_id, child_id, extra_id, other_id, completed_id = [row.item_id for row in rows]
        entry = BOM(parent_item_id=parent_id, child_item_id=child_id, quantity=1, unit="EA", notes="Keep")
        seed.add(entry)
        seed.add_all([Inventory(item_id=row.item_id, warehouse_qty=4) for row in rows])
        seed.flush()
        bom_id = entry.bom_id
        seed.commit()
    register_session_listeners(writer)
    try:
        yield BomDatabase(writer, reader, parent_id, child_id, extra_id, other_id, completed_id, bom_id)
    finally:
        unregister_session_listeners(writer)
        reader_engine.dispose()
        writer_engine.dispose()


def _request() -> Request:
    """Supply the actor context consumed by the real audit writer."""
    return Request({"type": "http", "method": "PATCH", "path": "/api/bom/test", "headers": []})


def _invoke(operation: str, db: Session, state: BomDatabase) -> Any:
    """Invoke the production route with dependencies already resolved."""
    if operation == "create":
        return bom.create_bom(
            BOMCreate(parent_item_id=state.parent_id, child_item_id=state.extra_child_id, quantity=3, notes="New"),
            _request(), None, db,
        )
    if operation == "update":
        return bom.update_bom(state.bom_id, BOMUpdate(quantity=2, unit="SET"), _request(), None, db)
    if operation == "delete":
        return bom.delete_bom(state.bom_id, _request(), None, db)
    completed = operation == "complete"
    item_id = state.parent_id if completed else state.completed_parent_id
    return items.update_bom_completion(item_id, BomCompletionUpdate(completed=completed), _request(), None, db)


@pytest.mark.parametrize("operation", ["create", "update", "delete", "complete", "uncomplete"])
def test_response_does_not_reacquire_writer_lock(
    bom_database: BomDatabase, operation: str,
) -> None:
    state = bom_database
    responding, release, other_completed = Event(), Event(), Event()
    post_commit_reads: list[str] = []
    commit_count = 0

    def saved(_db: Session) -> None:
        """Mark the point after which response work may not query the writer."""
        nonlocal commit_count
        commit_count += 1

    def observe_query(execution: ORMExecuteState) -> None:
        """Observe refreshes and lazy expired-attribute reads after commit."""
        if commit_count and execution.is_select:
            post_commit_reads.append(str(execution.statement))

    def save_bom() -> Any:
        """Keep the request session open through the response serialization phase."""
        with state.writer() as db:
            event.listen(db, "after_commit", saved)
            event.listen(db, "do_orm_execute", observe_query)
            response = _invoke(operation, db, state)
            assert not db.in_transaction()
            responding.set()
            assert release.wait(5)
            if response is not None:
                schema = ItemResponse if operation in {"complete", "uncomplete"} else BOMResponse
                return schema.model_validate(response).model_dump(mode="json")
            return None

    def save_other() -> None:
        """An unrelated writer should finish while the response is pending."""
        with state.writer() as db:
            db.execute(update(Item).where(Item.item_id == state.other_id).values(item_name="Other saved"))
            db.commit()
        other_completed.set()

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(save_bom)
        try:
            assert responding.wait(5)
            second = pool.submit(save_other)
            completed_during_response = other_completed.wait(1)
        finally:
            release.set()
        response = first.result(timeout=5)
        second.result(timeout=5)

    assert completed_during_response, "response-only ORM reads reacquired SQLite's writer lock"
    assert post_commit_reads == []
    assert commit_count == 1
    if operation in {"complete", "uncomplete"}:
        assert bool(response["bom_completed_at"]) is (operation == "complete")
        assert response["item_name"] == ("Parent" if operation == "complete" else "Completed")
        assert "warehouse_qty" not in response
    elif operation != "delete":
        assert response["quantity"] == (3 if operation == "create" else 2)
        assert response["notes"] == ("New" if operation == "create" else "Keep")
        assert response["unit"] == ("EA" if operation == "create" else "SET")
    with state.reader() as db:
        assert db.get(Item, state.other_id).item_name == "Other saved"
        assert db.query(AdminAuditLog).count() == 1
        action = f"bom.{operation}" if operation in {"create", "update", "delete"} else "item.bom_completion"
        assert db.query(AdminAuditLog).one().action == action
        assert db.get(DataRevision, 1).revision == 9
        assert db.query(Inventory).filter(Inventory.warehouse_qty != 4).count() == 0
        if operation in {"complete", "uncomplete"}:
            item_id = state.parent_id if operation == "complete" else state.completed_parent_id
            assert response == ItemResponse.model_validate(db.get(Item, item_id)).model_dump(mode="json")
        elif operation != "delete":
            assert response == BOMResponse.model_validate(db.get(BOM, UUID(response["bom_id"]))).model_dump(mode="json")


def test_unchanged_bom_update_keeps_existing_audit_and_revision_semantics(bom_database: BomDatabase) -> None:
    """A no-op update still commits once, without inventing an audit change."""
    state = bom_database
    with state.writer() as db:
        response = bom.update_bom(state.bom_id, BOMUpdate(quantity=1, unit="EA"), _request(), None, db)
        assert not db.in_transaction()
        assert response.quantity == 1
    with state.reader() as db:
        assert db.query(AdminAuditLog).count() == 0
        assert db.get(DataRevision, 1).revision == 8


@pytest.mark.parametrize("operation", ["create", "update", "delete", "complete", "uncomplete"])
def test_failed_commit_rolls_back_bom_audit_and_revision(
    bom_database: BomDatabase, operation: str,
) -> None:
    state = bom_database

    def fail_commit(_db: Session) -> None:
        """Reject after the factory listener flushed data, audit and revision."""
        raise RuntimeError("commit rejected")

    with state.writer() as db:
        event.listen(db, "before_commit", fail_commit)
        with pytest.raises(RuntimeError, match="commit rejected"):
            try:
                _invoke(operation, db, state)
            except RuntimeError:
                # Mirror the request dependency's exception boundary.
                db.rollback()
                raise
    with state.reader() as db:
        entry = db.get(BOM, state.bom_id)
        assert (entry.quantity, entry.unit, entry.notes) == (1, "EA", "Keep")
        assert db.query(BOM).count() == 1
        assert db.get(Item, state.parent_id).bom_completed_at is None
        assert db.get(Item, state.completed_parent_id).bom_completed_at == datetime(2026, 1, 1)
        assert db.query(AdminAuditLog).count() == 0
        assert db.get(DataRevision, 1).revision == 7


@pytest.mark.parametrize("operation", ["create", "update", "delete"])
@pytest.mark.parametrize("completion_first", [True, False])
def test_completion_and_bom_edit_are_serialized(
    bom_database: BomDatabase, operation: str, completion_first: bool,
) -> None:
    state = bom_database
    first_holds_lock, release, second_started = Event(), Event(), Event()

    def first_write() -> None:
        """Hold the real writer lock before the competing request begins."""
        with state.writer() as db:
            db.connection()
            first_holds_lock.set()
            assert release.wait(5)
            if completion_first:
                _invoke("complete", db, state)
            else:
                _invoke(operation, db, state)

    def second_write() -> int:
        """The second route must observe the first route's committed state."""
        second_started.set()
        with state.writer() as db:
            try:
                _invoke(operation if completion_first else "complete", db, state)
            except HTTPException as exc:
                db.rollback()
                return exc.status_code
        return 200

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(first_write)
        try:
            assert first_holds_lock.wait(5)
            second = pool.submit(second_write)
            assert second_started.wait(5)
        finally:
            release.set()
        first.result(timeout=5)
        second_status = second.result(timeout=5)

    assert second_status == (409 if completion_first else 200)
    with state.reader() as db:
        assert db.get(Item, state.parent_id).bom_completed_at is not None
        assert db.get(DataRevision, 1).revision == (8 if completion_first else 9)
        assert db.query(AdminAuditLog).count() == (1 if completion_first else 2)
        entry = db.get(BOM, state.bom_id)
        if operation == "update":
            assert entry.quantity == (1 if completion_first else 2)
        elif operation == "delete":
            assert (entry is not None) is completion_first
        else:
            assert db.query(BOM).count() == (1 if completion_first else 2)
