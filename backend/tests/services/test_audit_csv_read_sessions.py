"""Committed audit rows must not hold SQLite's writer during reads or file I/O."""

from __future__ import annotations

import csv
from collections.abc import Iterator
from datetime import datetime
from types import SimpleNamespace

import pytest
from sqlalchemy import event, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import Pool

from app import database
from app.models import Inventory, Item, ProcessType, TransactionLog, TransactionTypeEnum
from app.services import audit_csv


@pytest.fixture()
def audit_database(tmp_path, monkeypatch) -> Iterator[SimpleNamespace]:
    """All database and CSV artifacts belong to this test's temporary directory."""
    monkeypatch.setenv("AUDIT_CSV_DIR", str(tmp_path / "csv"))
    engine = database._create_database_engine(f"sqlite:///{(tmp_path / 'audit.db').as_posix()}")

    @event.listens_for(engine, "connect")
    def short_wait(connection, _record):
        connection.execute("PRAGMA busy_timeout=50")

    database.Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False)
    with factory() as db:
        db.add(ProcessType(code="TR", prefix="T", suffix="R", stage_order=10))
        db.flush()
        item = Item(item_name="Synthetic audit item", process_type_code="TR", model_symbol="9", serial_no=1, unit="EA")
        db.add(item)
        db.flush()
        db.add(Inventory(item_id=item.item_id, quantity=7, warehouse_qty=7, pending_quantity=0))
        log = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
                             quantity_change=7, quantity_before=0, quantity_after=7,
                             created_at=datetime(2026, 10, 1, 9, 0))
        db.add(log)
        db.flush()
        item_id, log_id = item.item_id, log.log_id
        db.commit()
    sender = factory()
    try:
        yield SimpleNamespace(engine=engine, factory=factory, sender=sender, item_id=item_id,
                              log_id=log_id, csv_file=tmp_path / "csv/inout_2026-10.csv")
    finally:
        audit_csv._pending_log_ids.pop(id(sender), None)
        sender.close()
        engine.dispose()


def _emit(env: SimpleNamespace) -> None:
    """Exercise the real callback with an already committed synthetic transaction."""
    audit_csv._pending_log_ids[id(env.sender)] = [env.log_id]
    audit_csv._emit_after_commit(env.sender)


def test_audit_row_loading_does_not_take_writer_slot(audit_database, monkeypatch):
    env = audit_database
    original = audit_csv.row_from_log
    writes = []

    def row_while_another_connection_writes(*args, **kwargs):
        with env.engine.begin() as connection:
            connection.execute(text("UPDATE inventory SET warehouse_qty = warehouse_qty + 1"))
        writes.append(True)
        return original(*args, **kwargs)

    monkeypatch.setattr(audit_csv, "row_from_log", row_while_another_connection_writes)
    _emit(env)
    assert writes == [True]
    with env.csv_file.open(encoding="utf-8-sig", newline="") as output:
        rows = list(csv.reader(output))
    assert rows[0] == audit_csv.CSV_HEADERS
    assert rows[1][3:7] == ["Synthetic audit item", "7", "0", "7"]


def test_audit_reads_committed_rows_while_another_writer_is_open(audit_database):
    env = audit_database
    with env.engine.connect() as locker:
        transaction = locker.begin()
        locker.execute(text("UPDATE items SET item_name = 'uncommitted'"))
        try:
            _emit(env)
            assert env.csv_file.exists()
            assert "Synthetic audit item" in env.csv_file.read_text(encoding="utf-8-sig")
            assert "uncommitted" not in env.csv_file.read_text(encoding="utf-8-sig")
        finally:
            transaction.rollback()


def test_audit_releases_all_connections_before_any_file_work(audit_database, monkeypatch):
    env = audit_database
    active = set()
    observed = []
    original_dir, original_append = audit_csv.get_csv_dir, audit_csv._append_rows

    def checked_out(connection, _record, _proxy):
        active.add(id(connection))

    def checked_in(connection, _record):
        active.discard(id(connection))

    def get_directory():
        observed.append(("directory", len(active)))
        return original_dir()

    def append(rows):
        observed.append(("append", len(active)))
        with env.engine.begin() as connection:
            connection.execute(text("UPDATE inventory SET warehouse_qty = warehouse_qty + 1"))
        return original_append(rows)

    event.listen(Pool, "checkout", checked_out)
    event.listen(Pool, "checkin", checked_in)
    monkeypatch.setattr(audit_csv, "get_csv_dir", get_directory)
    monkeypatch.setattr(audit_csv, "_append_rows", append)
    try:
        _emit(env)
    finally:
        event.remove(Pool, "checkout", checked_out)
        event.remove(Pool, "checkin", checked_in)
    assert observed == [("directory", 0), ("append", 0)]
    assert not active
    assert env.csv_file.exists()


def test_audit_reuses_the_application_read_engine(audit_database, monkeypatch):
    env = audit_database
    reader = database._create_database_engine(str(env.engine.url), sqlite_read_only=True)
    queries = []

    @event.listens_for(reader, "before_cursor_execute")
    def record(_connection, _cursor, statement, _params, _context, _many):
        queries.append(statement)

    monkeypatch.setattr(database, "engine", env.engine)
    monkeypatch.setattr(database, "read_engine", reader)
    try:
        _emit(env)
        assert any("transaction_logs" in sql for sql in queries)
        assert env.csv_file.exists()
    finally:
        reader.dispose()


def test_audit_file_error_does_not_fail_a_committed_transaction(audit_database, monkeypatch):
    env = audit_database

    def fail_file_write(_rows):
        raise OSError("synthetic disk failure")

    monkeypatch.setattr(audit_csv, "_append_rows", fail_file_write)
    event.listen(env.factory, "after_flush", audit_csv._collect_after_flush)
    event.listen(env.factory, "after_commit", audit_csv._emit_after_commit)
    try:
        with env.factory() as db:
            log = TransactionLog(item_id=env.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
                                 quantity_change=1, created_at=datetime(2026, 10, 1, 10, 0))
            db.add(log)
            db.flush()
            log_id = log.log_id
            db.commit()
        with env.factory() as db:
            assert db.get(TransactionLog, log_id).quantity_change == 1
    finally:
        event.remove(env.factory, "after_flush", audit_csv._collect_after_flush)
        event.remove(env.factory, "after_commit", audit_csv._emit_after_commit)
