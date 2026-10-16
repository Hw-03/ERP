"""Keep exact get semantics while batching the two repeated integrity lookups."""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime
import sqlite3
from typing import Iterator
from types import SimpleNamespace
import uuid

import pytest
from sqlalchemy import Column, String, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session

from app.models import (
    DefectInventoryMovement,
    DefectQuarantineRecord,
    InventoryOperation,
    InventoryOperationKindEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import inventory_integrity as integrity
from app.models.base import UUIDString


def _operation() -> InventoryOperation:
    """Use independent operations so the old weak identity map cannot hide queries."""
    return InventoryOperation(kind=InventoryOperationKindEnum.BUSINESS, domain="inventory",
                              action="receive", display_label="Lookup", actor_name="Tester")


def test_weekly_lookup_batches_before_classification(db_session: Session, make_item) -> None:
    """Every selected operation is inspected without issuing one SELECT per log."""
    item = make_item(process_type_code="PF")
    for _ in range(10):
        operation = _operation()
        db_session.add(operation)
        db_session.flush()
        db_session.add(TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
                                      quantity_change=1, operation_id=operation.operation_id,
                                      inventory_effect=[{"scope": "warehouse", "delta": -1}]))
    db_session.flush()
    db_session.expunge_all()
    statements = []
    connection = db_session.connection()

    def capture(_connection, _cursor, statement, _parameters, _context, _many) -> None:
        if "FROM inventory_operations" in statement:
            statements.append(statement)

    event.listen(connection, "before_cursor_execute", capture)
    try:
        issues = integrity._weekly_unclassified_issues(db_session)
    finally:
        event.remove(connection, "before_cursor_execute", capture)
    assert len(issues) == 10
    assert len(statements) == 1


def test_defect_lookup_batches_without_changing_movement_issues(db_session: Session, make_item) -> None:
    """The full record scan remains and all movement mismatches survive batching."""
    item = make_item()
    operation = _operation()
    db_session.add(operation)
    db_session.flush()
    for _ in range(10):
        record = DefectQuarantineRecord(item_id=item.item_id, department="assembly",
                                        original_quantity=5, remaining_quantity=3)
        db_session.add(record)
        db_session.flush()
        db_session.add(DefectInventoryMovement(operation_id=operation.operation_id, record_id=record.record_id,
                                               item_id=item.item_id, department="assembly", movement_type="quarantine",
                                               quantity_delta=1, role="PRIMARY", actor_name="Tester",
                                               effective_at=datetime(2026, 10, 1)))
    db_session.flush()
    db_session.expunge_all()
    statements = []
    connection = db_session.connection()

    def capture(_connection, _cursor, statement, _parameters, _context, _many) -> None:
        if "FROM defect_quarantine_records" in statement:
            statements.append(statement)

    event.listen(connection, "before_cursor_execute", capture)
    try:
        issues = integrity._defect_stock_issues(db_session)
    finally:
        event.remove(connection, "before_cursor_execute", capture)
    movements = [issue for issue in issues if len(issue.cause_ids) == 1]
    assert len(movements) == 10
    assert all("3 EA" in issue.current_value and "1 EA" in issue.current_value for issue in movements)
    assert len(statements) == 2


class _ProbeBase(DeclarativeBase):
    pass


class _ProbeRow(_ProbeBase):
    __tablename__ = "integrity_lookup_probe"
    row_id = Column(UUIDString, primary_key=True)
    value = Column(String, nullable=True)


@contextmanager
def _probe_session(rows: list[tuple[object, str | None]], affinity: str = "TEXT") -> Iterator[Session]:
    """Use raw legacy storage only in an independent in-memory database."""
    engine = create_engine("sqlite:///:memory:")
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(f"CREATE TABLE integrity_lookup_probe (row_id {affinity} PRIMARY KEY, value TEXT)")
            if rows:
                connection.exec_driver_sql("INSERT INTO integrity_lookup_probe VALUES (?, ?)", rows)
        with Session(engine, autoflush=False) as session:
            yield session
    finally:
        engine.dispose()


_ID = uuid.UUID("12345678-abcd-4321-abcd-123456789abc")


@pytest.mark.parametrize(("stored", "lookup", "affinity"), [
    (_ID.hex, _ID, "TEXT"),
    (_ID.hex, str(_ID), "TEXT"),
    (_ID.hex, _ID.hex, "TEXT"),
    (_ID.hex, _ID.hex.upper(), "TEXT"),
    (_ID.hex.upper(), str(_ID), "TEXT"),
    (str(_ID), str(_ID), "TEXT"),
    ("bad-value", "bad-value", "TEXT"),
    ("badvalue", "bad-value", "TEXT"),
    (_ID.hex, str(uuid.UUID(int=7)), "TEXT"),
    (123, "00123", "NUMERIC"),
    (1000, "1e3", "NUMERIC"),
    ("12345678901234567890123456789012", uuid.UUID("12345678901234567890123456789012"), "NUMERIC"),
])
@pytest.mark.parametrize("preloaded", [False, True])
def test_lookup_matches_original_get_for_raw_uuid_aliases_and_numeric_affinity(
    stored: object, lookup: object, affinity: str, preloaded: bool,
) -> None:
    """Use a separate old session so a scalar preload cannot hide cache pollution."""
    with _probe_session([(stored, "value")], affinity) as oracle:
        held = oracle.query(_ProbeRow).all() if preloaded else []
        old = oracle.get(_ProbeRow, lookup)
        expected = (old is not None, old.value if old is not None else None)
        assert len(held) == int(preloaded)
    with _probe_session([(stored, "value")], affinity) as actual:
        held = actual.query(_ProbeRow).all() if preloaded else []
        before = set(actual.identity_map)
        values = integrity._bulk_integrity_values(actual, _ProbeRow.value, [lookup])
        assert set(actual.identity_map) == before
        assert integrity._integrity_value(actual, _ProbeRow, "value", lookup, values) == expected
        assert len(held) == int(preloaded)


@pytest.mark.parametrize("lookup", [_ID, str(_ID)])
@pytest.mark.parametrize("state", ["clean", "dirty", "expired", "field_expired"])
def test_lookup_preserves_held_dirty_and_expired_objects(lookup: object, state: str) -> None:
    """Projection must honor the ORM value that the original get would return."""
    observed = []
    for optimized in (False, True):
        with _probe_session([(_ID.hex, "stored")]) as session:
            held = session.query(_ProbeRow).one()
            if state == "dirty":
                held.value = "unflushed"
            elif state == "expired":
                session.expire(held)
            elif state == "field_expired":
                session.expire(held, ["value"])
            if optimized:
                values = integrity._bulk_integrity_values(session, _ProbeRow.value, [lookup])
                observed.append(integrity._integrity_value(session, _ProbeRow, "value", lookup, values))
            else:
                old = session.get(_ProbeRow, lookup)
                observed.append((old is not None, old.value if old is not None else None))
    assert observed[0] == observed[1]


def test_lookup_keeps_preloaded_alias_collision_value_after_raw_bind_match() -> None:
    """A matching SQL row can still resolve to an already held alias ORM object."""
    for optimized in (False, True):
        with _probe_session([(_ID.hex.upper(), "first_alias"), (_ID.hex, "canonical")]) as session:
            held = session.query(_ProbeRow).all()
            assert len(held) == 1 and held[0].value == "first_alias"
            if optimized:
                values = integrity._bulk_integrity_values(session, _ProbeRow.value, [str(_ID)])
                assert integrity._integrity_value(session, _ProbeRow, "value", str(_ID), values) == (True, "first_alias")
            else:
                assert session.get(_ProbeRow, str(_ID)).value == "first_alias"


def test_lookup_preserves_null_value_and_missing_record() -> None:
    with _probe_session([(_ID.hex, None)]) as session:
        missing = uuid.UUID(int=99)
        values = integrity._bulk_integrity_values(session, _ProbeRow.value, [_ID, missing])
        assert integrity._integrity_value(session, _ProbeRow, "value", _ID, values) == (True, None)
        assert integrity._integrity_value(session, _ProbeRow, "value", missing, values) == (False, None)


def test_lookup_respects_sqlite_variable_limit_one() -> None:
    identifiers = [uuid.UUID(int=index) for index in range(1, 4)]
    with _probe_session([(identifier.hex, str(index)) for index, identifier in enumerate(identifiers)]) as session:
        raw = session.connection().connection.driver_connection
        previous = raw.setlimit(sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER, 1)
        try:
            values = integrity._bulk_integrity_values(session, _ProbeRow.value, identifiers)
            assert [integrity._integrity_value(session, _ProbeRow, "value", identifier, values)
                    for identifier in identifiers] == [(True, str(index)) for index in range(3)]
        finally:
            raw.setlimit(sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER, previous)


def test_lookup_without_driver_getlimit_keeps_original_get(monkeypatch) -> None:
    with _probe_session([(_ID.hex, "value")]) as session:
        with monkeypatch.context() as patch:
            patch.setattr(session, "connection", lambda: SimpleNamespace(connection=SimpleNamespace(driver_connection=object())))
            values = integrity._bulk_integrity_values(session, _ProbeRow.value, [_ID])
        assert values == {}
        assert integrity._integrity_value(session, _ProbeRow, "value", _ID, values) == (True, "value")


def test_lookup_non_sqlite_keeps_original_get(monkeypatch) -> None:
    with _probe_session([(_ID.hex, "value")]) as session:
        with monkeypatch.context() as patch:
            patch.setattr(session, "get_bind", lambda: SimpleNamespace(dialect=SimpleNamespace(name="postgresql")))
            values = integrity._bulk_integrity_values(session, _ProbeRow.value, [_ID])
        assert values == {}
        assert integrity._integrity_value(session, _ProbeRow, "value", _ID, values) == (True, "value")


def test_full_response_preserves_archived_cancelled_deleted_and_null_scope(db_session: Session, make_item, monkeypatch) -> None:
    """Independent get fallback must produce every same issue and complete check sample."""
    cutoff = datetime(2026, 9, 1)
    monkeypatch.setattr(integrity, "cutover_at", lambda _db: cutoff)
    item = make_item(process_type_code="PF")
    item.deleted_at = cutoff
    business, cancellation = _operation(), _operation()
    cancellation.kind = InventoryOperationKindEnum.CANCELLATION
    db_session.add_all([business, cancellation])
    db_session.flush()
    for operation_id in (None, business.operation_id, cancellation.operation_id):
        db_session.add(TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
                                      operation_id=operation_id, quantity_change=1,
                                      inventory_effect=[{"scope": "warehouse", "delta": -1}],
                                      cancelled=True, archived_at=cutoff, created_at=cutoff))
    record = DefectQuarantineRecord(item_id=item.item_id, department="assembly", original_quantity=5, remaining_quantity=3)
    db_session.add(record)
    db_session.flush()
    db_session.add(DefectInventoryMovement(operation_id=business.operation_id, record_id=record.record_id,
                                           item_id=item.item_id, department="assembly", movement_type="quarantine",
                                           quantity_delta=1, role="PRIMARY", actor_name="Tester", effective_at=cutoff))
    db_session.flush()
    db_session.expunge_all()
    actual = integrity.diagnose_inventory_integrity(db_session, sample_limit=None).model_dump(exclude={"generated_at"})
    db_session.expunge_all()
    monkeypatch.setattr(integrity, "_bulk_integrity_values", lambda *_args: {})
    expected = integrity.diagnose_inventory_integrity(db_session, sample_limit=None).model_dump(exclude={"generated_at"})
    assert actual == expected
    assert actual["category_counts"]["WEEKLY_UNCLASSIFIED_EFFECT"] == 2
    assert actual["category_counts"]["DEFECT_STOCK_MISMATCH"] == 2
