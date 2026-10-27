"""A saved item's response must not hold a writer lock while reading stock."""

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event
from typing import Any
from uuid import UUID

from fastapi import Request
import pytest
from sqlalchemy import event, update
from sqlalchemy.orm import Session, sessionmaker

from app import database
from app.models import AdminAuditLog, DataRevision, Inventory, Item, ProcessType
from app.routers import items
from app.schemas import ItemUpdate
from app.services.realtime import register_session_listeners, unregister_session_listeners


@pytest.fixture
def item_database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[sessionmaker, sessionmaker, UUID, UUID]]:
    """Use real independent SQLite connections without the shared SAVEPOINT fixture."""
    url = f"sqlite:///{(tmp_path / 'item-response.db').as_posix()}"
    writer_engine = database._create_database_engine(url)
    reader_engine = database._create_database_engine(url, sqlite_read_only=True)
    database.Base.metadata.create_all(writer_engine)
    writer = sessionmaker(bind=writer_engine, autoflush=False)
    reader = sessionmaker(bind=reader_engine, autoflush=False)
    with writer() as seed:
        seed.add(ProcessType(code="TR", prefix="T", suffix="R", stage_order=10))
        seed.add(DataRevision(id=1, revision=7))
        seed.flush()
        first = Item(item_name="Before", model_symbol="9", process_type_code="TR", serial_no=1)
        second = Item(item_name="Other", model_symbol="9", process_type_code="TR", serial_no=2)
        seed.add_all([first, second])
        seed.flush()
        first_id, second_id = first.item_id, second.item_id
        seed.add_all([Inventory(item_id=first_id, warehouse_qty=4), Inventory(item_id=second_id, warehouse_qty=2)])
        seed.commit()
    monkeypatch.setattr(database, "engine", writer_engine)
    monkeypatch.setattr(database, "read_engine", reader_engine)
    register_session_listeners(writer)
    try:
        yield writer, reader, first_id, second_id
    finally:
        unregister_session_listeners(writer)
        reader_engine.dispose()
        writer_engine.dispose()


def _request() -> Request:
    """The router's audit writer only needs request-local actor state."""
    return Request({"type": "http", "method": "PUT", "path": "/api/items/test", "headers": []})


def test_response_projection_does_not_block_another_writer(
    item_database: tuple[sessionmaker, sessionmaker, UUID, UUID], monkeypatch: pytest.MonkeyPatch,
) -> None:
    writer, reader, item_id, other_id = item_database
    projecting, release, other_completed = Event(), Event(), Event()
    original = items._to_item_with_inventory
    projection_sessions = []

    def project(db: Session, item: Item, inventory: Inventory | None, **kwargs: Any) -> Any:
        """Pause after the response query began, when the old route holds a write lock."""
        projection_sessions.append(db)
        projecting.set()
        assert release.wait(5)
        return original(db, item, inventory, **kwargs)

    monkeypatch.setattr(items, "_to_item_with_inventory", project)
    writer_sessions = []

    def save_item() -> Any:
        """Mirror the write dependency's request-scoped transaction lifetime."""
        with writer() as db:
            writer_sessions.append(db)
            return items.update_item(item_id, ItemUpdate(item_name="Saved"), _request(), None, db)

    def save_other() -> None:
        """An unrelated write should finish before the first response is released."""
        with writer() as db:
            db.execute(update(Item).where(Item.item_id == other_id).values(item_name="Other saved"))
            db.commit()
        other_completed.set()

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(save_item)
        try:
            assert projecting.wait(5)
            other = pool.submit(save_other)
            completed_during_projection = other_completed.wait(1)
        finally:
            release.set()
        response = first.result(timeout=5)
        other.result(timeout=5)

    assert completed_during_projection, "response-only reads reacquired SQLite's writer lock"
    assert projection_sessions[0] is not writer_sessions[0]
    assert response.item_name == "Saved"
    assert response.warehouse_qty == 4
    with reader() as db:
        assert db.get(Item, item_id).item_name == "Saved"
        assert db.get(Item, other_id).item_name == "Other saved"
        assert db.query(AdminAuditLog).filter(AdminAuditLog.action == "item.update").count() == 1
        assert db.get(DataRevision, 1).revision == 9


def test_failed_commit_rolls_back_item_audit_and_revision(
    item_database: tuple[sessionmaker, sessionmaker, UUID, UUID],
) -> None:
    writer, reader, item_id, _ = item_database

    def fail_commit(_db: Session) -> None:
        """Fail after the real factory listener flushed item, audit and revision."""
        raise RuntimeError("commit rejected")

    with writer() as db:
        event.listen(db, "before_commit", fail_commit)
        with pytest.raises(RuntimeError, match="commit rejected"):
            try:
                items.update_item(item_id, ItemUpdate(item_name="Not saved"), _request(), None, db)
            except RuntimeError:
                db.rollback()
                raise
    with reader() as db:
        assert db.get(Item, item_id).item_name == "Before"
        assert db.query(AdminAuditLog).count() == 0
        assert db.get(DataRevision, 1).revision == 7
