"""Bound history reads while preserving exact cell reconstruction semantics."""

from datetime import datetime, timedelta
from decimal import Decimal
from collections.abc import Callable
from collections import defaultdict
import json
import sqlite3
from uuid import UUID, uuid4

import pytest
from sqlalchemy import event, select
from sqlalchemy.exc import DataError, OperationalError
from sqlalchemy.orm import Session

from app.models import Item, TransactionLog, TransactionTypeEnum
from app.services.inventory_effect_history import (
    EffectHistoryEntry,
    load_inventory_effect_quantities,
    reconstruct_effect_quantities,
)


@pytest.mark.parametrize("boundary", ["valid", "tie", "missing", "negative", "stored"])
def test_latest_history_reads_only_required_suffix(db_session, make_item, boundary):
    """Old rows cannot affect a newer target; ties and newer barriers still can."""
    now = datetime(2026, 10, 1, 9)
    item = make_item(warehouse_qty=Decimal(10000))
    rows = [
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=1,
            created_at=now - timedelta(seconds=2000 - index),
            inventory_effect=[{"scope": "warehouse", "delta": 1}],
        )
        for index in range(1000)
    ]
    target = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=1,
        created_at=now,
        inventory_effect=[{"scope": "warehouse", "delta": 1}],
    )
    if boundary == "stored":
        target.inventory_effect = [{"scope": "warehouse", "delta": 1,
                                    "quantity_before": 41, "quantity_after": 42}]
    rows.append(target)
    if boundary in {"tie", "missing", "negative"}:
        rows.append(TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=1,
            created_at=now if boundary == "tie" else now + timedelta(seconds=1),
            inventory_effect=None if boundary == "missing" else [
                {"scope": "warehouse", "delta": 20000 if boundary == "negative" else 1}
            ],
        ))
    db_session.add_all(rows)
    db_session.flush()
    expected = reconstruct_effect_quantities(
        [EffectHistoryEntry(row.log_id, row.item_id, row.created_at, row.inventory_effect)
         for row in rows],
        {("warehouse", None, None): 10000},
        {target.log_id},
    )
    captured = []

    def record_query(_connection, _cursor, statement, parameters, _context, _many):
        if "FROM transaction_logs" in statement:
            captured.append((statement, parameters))

    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", record_query)
    try:
        actual = load_inventory_effect_quantities(db_session, [target])
    finally:
        event.remove(connection, "before_cursor_execute", record_query)

    assert actual == expected
    fetched = sum(len(connection.exec_driver_sql(sql, params).all()) for sql, params in captured)
    assert len(captured) == 1
    assert fetched == 1


def test_suffix_keeps_warehouse_and_department_amounts(db_session, make_item, make_location):
    """A later location transfer must remain in the inverse calculation."""
    from app.models import DepartmentEnum, LocationStatusEnum

    item = make_item(warehouse_qty=Decimal(7))
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY,
                  status=LocationStatusEnum.PRODUCTION, quantity=Decimal(3))
    now = datetime(2026, 10, 1, 9)
    target = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
                            quantity_change=10, created_at=now,
                            inventory_effect=[{"scope": "warehouse", "delta": 10}])
    moved = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.TRANSFER_TO_PROD,
                           quantity_change=0, created_at=now + timedelta(seconds=1),
                           inventory_effect=[{"scope": "warehouse", "delta": -3},
                                             {"scope": "location", "department": "조립",
                                              "status": "PRODUCTION", "delta": 3}])
    db_session.add_all([target, moved])
    db_session.flush()
    result = load_inventory_effect_quantities(db_session, [target, moved])
    assert result[target.log_id] == [{"scope": "warehouse", "delta": 10,
                                      "quantity_before": 0, "quantity_after": 10}]
    assert [(cell["quantity_before"], cell["quantity_after"])
            for cell in result[moved.log_id]] == [(10, 7), (0, 3)]


def _captured_history_read(
    db: Session, targets: list[TransactionLog],
) -> tuple[dict[UUID, list[dict]], list[tuple[str, tuple]]]:
    """Capture the public loader's transaction SELECT without consuming its cursor."""
    captured: list[tuple[str, tuple]] = []

    def record(
        _connection: object, _cursor: object, statement: str, parameters: tuple,
        _context: object, _many: bool,
    ) -> None:
        if "FROM transaction_logs" in statement:
            captured.append((statement, parameters))

    connection = db.connection()
    event.listen(connection, "before_cursor_execute", record)
    try:
        return load_inventory_effect_quantities(db, targets), captured
    finally:
        event.remove(connection, "before_cursor_execute", record)


def test_history_transport_bounds_chunks_without_extra_sql_parameters(
    db_session: Session, make_item: Callable[..., Item],
) -> None:
    """A legal two-bind read must still fit SQLite's limit and fetch three chunks."""
    now = datetime(2026, 10, 1)
    item = make_item(warehouse_qty=Decimal(10000))
    rows = [TransactionLog(
        item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=1, created_at=now + timedelta(seconds=index // 2),
        inventory_effect=[{"scope": "warehouse", "delta": 1,
                           "extra": {"nested": [index]}}],
    ) for index in range(130)]
    db_session.add_all(rows)
    db_session.flush()
    expected = reconstruct_effect_quantities(
        [EffectHistoryEntry(row.log_id, row.item_id, row.created_at, row.inventory_effect)
         for row in rows], {("warehouse", None, None): 10000}, {row.log_id for row in rows},
    )
    driver = db_session.connection().connection.driver_connection
    previous = driver.setlimit(sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER, 2)
    try:
        actual, captured = _captured_history_read(db_session, rows)
        assert actual == expected
        assert len(captured) == 1
        statement, parameters = captured[0]
        assert len(parameters) == 2
        transported = db_session.connection().exec_driver_sql(statement, parameters).all()
        assert len(transported) == 3
        chunks = [json.loads(row[4]) for row in transported]
        assert sorted(map(len, chunks)) == [2, 64, 64]
        assert max(len(row[4].encode("utf-8")) for row in transported) < 400000
        actual[rows[0].log_id][0]["extra"]["nested"].append(999)
        assert actual[rows[1].log_id][0]["extra"]["nested"] == [1]
    finally:
        driver.setlimit(sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER, previous)


def test_history_keeps_legacy_uuid_alias_order_across_raw_and_packed_rows(
    db_session: Session, make_item: Callable[..., Item],
) -> None:
    """Transport cannot change tie behavior when raw PKs normalize to the same UUID."""
    now = datetime(2026, 10, 1)
    item = make_item(warehouse_qty=Decimal(10000))
    collision = uuid4()
    small = [{"scope": "warehouse", "delta": 1,
              "quantity_before": 1, "quantity_after": 2}]
    large = [{"scope": "warehouse", "delta": 1,
              "quantity_before": 41, "quantity_after": 42, "note": "x" * 2500}]
    connection = db_session.connection()
    for raw_id, effect in ((collision.hex, small), (str(collision), large)):
        connection.exec_driver_sql(
            "INSERT INTO transaction_logs (log_id,item_id,transaction_type,quantity_change,created_at,inventory_effect) VALUES (?,?,?,?,?,?)",
            (raw_id, item.item_id.hex, "RECEIVE", 1,
             now.isoformat(sep=" ", timespec="microseconds"), json.dumps(effect)),
        )
    target = TransactionLog(log_id=collision, item_id=item.item_id, created_at=now)
    c = TransactionLog.__table__.c
    baseline = db_session.execute(select(c.log_id, c.item_id, c.created_at, c.inventory_effect)
        .where(c.item_id.in_({item.item_id}), c.created_at >= now)).all()
    expected = reconstruct_effect_quantities(
        [EffectHistoryEntry(*row) for row in baseline],
        {("warehouse", None, None): 10000}, {collision},
    )
    actual, captured = _captured_history_read(db_session, [target])
    assert actual == expected
    assert len(captured) == 1
    statement, parameters = captured[0]
    assert "json_group_array" in statement
    transported = connection.exec_driver_sql(statement, parameters).all()
    assert len(transported) == 2
    assert any(row[4] is not None for row in transported)


@pytest.mark.parametrize("mode", ["custom_decoder", "old_sqlite", "low_length", "postgresql"])
def test_history_preserves_core_fallback(
    db_session: Session, make_item: Callable[..., Item], monkeypatch: pytest.MonkeyPatch,
    mode: str,
) -> None:
    """Unsupported engines and limits keep the original one-SELECT read."""
    now = datetime(2026, 10, 1)
    item = make_item(warehouse_qty=Decimal(5))
    target = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=1, created_at=now, inventory_effect=[{"scope": "warehouse", "delta": 1}])
    db_session.add(target)
    db_session.flush()
    dialect = db_session.get_bind().dialect
    driver = db_session.connection().connection.driver_connection
    previous = None
    if mode == "custom_decoder":
        monkeypatch.setattr(dialect, "_json_deserializer", json.loads)
    elif mode == "old_sqlite":
        monkeypatch.setattr(dialect.dbapi, "sqlite_version_info", (3, 24, 0))
    elif mode == "postgresql":
        monkeypatch.setattr(dialect, "name", "postgresql")
    else:
        previous = driver.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 8192)
    try:
        actual, captured = _captured_history_read(db_session, [target])
        assert actual[target.log_id][0]["quantity_before"] == 4
        assert actual[target.log_id][0]["quantity_after"] == 5
        assert len(captured) == 1
        assert "json_group_array" not in captured[0][0]
    finally:
        if previous is not None:
            driver.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, previous)


@pytest.mark.parametrize("kind", ["blob_effect", "large_effect", "null_effect", "blob_log"])
def test_history_preserves_raw_values_in_same_statement(
    db_session: Session, make_item: Callable[..., Item], kind: str,
) -> None:
    """A row outside the text-size contract remains present beside packed rows."""
    now = datetime(2026, 10, 1)
    item = make_item(warehouse_qty=Decimal(100))
    first_id, second_id = uuid4(), uuid4()
    raw_effect = json.dumps([{"scope": "warehouse", "delta": 1}])
    effect: object = raw_effect
    raw_id: object = second_id.hex
    if kind == "blob_effect":
        effect = raw_effect.encode("utf-8")
    elif kind == "large_effect":
        effect = json.dumps([{"scope": "warehouse", "delta": 1, "note": "\0" + "x" * 2500}])
    elif kind == "null_effect":
        effect = None
    else:
        raw_id = b"raw-uuid-blob"
    connection = db_session.connection()
    for identity, timestamp, stored in ((first_id.hex, now, raw_effect),
        (raw_id, now + timedelta(seconds=1), effect)):
        connection.exec_driver_sql(
            "INSERT INTO transaction_logs (log_id,item_id,transaction_type,quantity_change,created_at,inventory_effect) VALUES (?,?,?,?,?,?)",
            (identity, item.item_id.hex, "RECEIVE", 1,
             timestamp.isoformat(sep=" ", timespec="microseconds"), stored),
        )
    c = TransactionLog.__table__.c
    baseline = db_session.execute(select(c.log_id, c.item_id, c.created_at, c.inventory_effect)
        .where(c.item_id.in_({item.item_id}), c.created_at >= now)).all()
    target = TransactionLog(log_id=first_id, item_id=item.item_id, created_at=now)
    expected = reconstruct_effect_quantities([EffectHistoryEntry(*row) for row in baseline],
        {("warehouse", None, None): 100}, {first_id})
    actual, captured = _captured_history_read(db_session, [target])
    assert actual == expected
    assert len(captured) == 1
    statement, parameters = captured[0]
    transported = connection.exec_driver_sql(statement, parameters).all()
    assert len(transported) == 2
    assert any(row[4] is None for row in transported)
    assert any(row[4] is not None for row in transported)


def test_history_preserves_first_decode_error_in_original_scan_order(
    db_session: Session, make_item: Callable[..., Item],
) -> None:
    """Packed malformed JSON must still fail before a later raw BLOB date."""
    now = datetime(2026, 10, 1)
    item = make_item(warehouse_qty=Decimal(10))
    identity = uuid4()
    connection = db_session.connection()
    for log_id, timestamp, effect in ((identity.hex, now.isoformat(sep=" ", timespec="microseconds"), "{"),
        (uuid4().hex, b"invalid-date", None)):
        connection.exec_driver_sql(
            "INSERT INTO transaction_logs (log_id,item_id,transaction_type,quantity_change,created_at,inventory_effect) VALUES (?,?,?,?,?,?)",
            (log_id, item.item_id.hex, "RECEIVE", 1, timestamp, effect),
        )
    c = TransactionLog.__table__.c
    query = select(c.log_id, c.item_id, c.created_at, c.inventory_effect)\
        .where(c.item_id.in_({item.item_id}), c.created_at >= now)
    with pytest.raises(json.JSONDecodeError) as original:
        db_session.execute(query).all()
    target = TransactionLog(log_id=identity, item_id=item.item_id, created_at=now)
    with pytest.raises(json.JSONDecodeError) as packed:
        load_inventory_effect_quantities(db_session, [target])
    assert str(packed.value) == str(original.value)


def test_history_falls_back_only_for_missing_packing_functions(
    db_session: Session, make_item: Callable[..., Item],
) -> None:
    """An unavailable optional JSON function retries the unchanged Core statement."""
    now = datetime(2026, 10, 1)
    item = make_item(warehouse_qty=Decimal(5))
    target = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=1, created_at=now, inventory_effect=[{"scope": "warehouse", "delta": 1}])
    db_session.add(target)
    db_session.flush()
    connection = db_session.connection()

    def missing_function(
        _connection: object, _cursor: object, statement: str, parameters: tuple,
        _context: object, _many: bool,
    ) -> None:
        if "json_group_array" in statement:
            raise OperationalError(statement, parameters,
                                   sqlite3.OperationalError("no such function: json_group_array"))

    event.listen(connection, "before_cursor_execute", missing_function)
    try:
        actual = load_inventory_effect_quantities(db_session, [target])
        assert actual[target.log_id][0]["quantity_before"] == 4
    finally:
        event.remove(connection, "before_cursor_execute", missing_function)


def test_history_preserves_multi_item_scan_and_uuid_alias_results(
    db_session: Session, make_item: Callable[..., Item],
) -> None:
    """Indexed reads across items and times preserve existing normalized-key ties."""
    now = datetime(2026, 10, 1)
    items = [make_item(warehouse_qty=Decimal(quantity)) for quantity in (100, 200, 300)]
    quantities = {item.item_id: quantity for item, quantity in zip(items, (100, 200, 300), strict=True)}
    collision = uuid4()
    small = [{"scope": "warehouse", "delta": 1}]
    large = [{"scope": "warehouse", "delta": 1, "note": "x" * 2500}]
    specs = [(items[1], 4, collision.hex, small), (items[0], 1, str(collision), large),
             (items[2], 2, uuid4().hex, small), (items[1], 7, uuid4().hex, small),
             (items[0], 3, uuid4().hex, small)]
    targets = []
    connection = db_session.connection()
    for item, offset, identity, effect in specs:
        timestamp = now + timedelta(seconds=offset)
        connection.exec_driver_sql(
            "INSERT INTO transaction_logs (log_id,item_id,transaction_type,quantity_change,created_at,inventory_effect) VALUES (?,?,?,?,?,?)",
            (identity, item.item_id.hex, "RECEIVE", 1,
             timestamp.isoformat(sep=" ", timespec="microseconds"), json.dumps(effect)),
        )
        targets.append(TransactionLog(log_id=UUID(identity), item_id=item.item_id, created_at=timestamp))
    c = TransactionLog.__table__.c
    baseline = db_session.execute(select(c.log_id, c.item_id, c.created_at, c.inventory_effect)
        .where(c.item_id.in_(quantities), c.created_at >= min(row.created_at for row in targets))).all()
    histories = defaultdict(list)
    for row in baseline:
        histories[row.item_id].append(EffectHistoryEntry(*row))
    expected = {}
    for item_id, entries in histories.items():
        expected.update(reconstruct_effect_quantities(entries,
            {("warehouse", None, None): quantities[item_id]},
            {target.log_id for target in targets if target.item_id == item_id}))
    actual, captured = _captured_history_read(db_session, targets)
    assert actual == expected
    assert len(captured) == 1
    assert len(captured[0][1]) == len(items) + 1


def test_history_propagates_unrelated_sql_errors(
    db_session: Session, make_item: Callable[..., Item],
) -> None:
    """Optional-function fallback must not swallow a real database failure."""
    now = datetime(2026, 10, 1)
    item = make_item(warehouse_qty=Decimal(5))
    target = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=1, created_at=now, inventory_effect=[{"scope": "warehouse", "delta": 1}])
    db_session.add(target)
    db_session.flush()
    connection = db_session.connection()

    def database_failure(
        _connection: object, _cursor: object, statement: str, parameters: tuple,
        _context: object, _many: bool,
    ) -> None:
        if "json_group_array" in statement:
            raise OperationalError(statement, parameters, sqlite3.OperationalError("database is locked"))

    event.listen(connection, "before_cursor_execute", database_failure)
    try:
        with pytest.raises(OperationalError, match="database is locked"):
            load_inventory_effect_quantities(db_session, [target])
    finally:
        event.remove(connection, "before_cursor_execute", database_failure)


def test_history_preserves_core_read_near_sqlite_record_length_limit(
    db_session: Session, make_item: Callable[..., Item],
) -> None:
    """CTE bookkeeping must not reject a large row accepted by the original read."""
    now = datetime(2026, 10, 1)
    item = make_item(warehouse_qty=Decimal(5))
    identity = uuid4()
    effect = json.dumps([{"scope": "warehouse", "delta": 1, "note": ""}])
    effect = effect.replace('"note": ""', '"note": "' + "x" * (399902 - len(effect)) + '"')
    connection = db_session.connection()
    connection.exec_driver_sql(
        "INSERT INTO transaction_logs (log_id,item_id,transaction_type,quantity_change,created_at,inventory_effect) VALUES (?,?,?,?,?,?)",
        (identity.hex, item.item_id.hex, "RECEIVE", 1,
         now.isoformat(sep=" ", timespec="microseconds"), effect),
    )
    driver = connection.connection.driver_connection
    previous = driver.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 400000)
    try:
        c = TransactionLog.__table__.c
        baseline = db_session.execute(select(c.log_id, c.item_id, c.created_at, c.inventory_effect)
            .where(c.item_id.in_({item.item_id}), c.created_at >= now)).all()
        expected = reconstruct_effect_quantities([EffectHistoryEntry(*row) for row in baseline],
            {("warehouse", None, None): 5}, {identity})
        target = TransactionLog(log_id=identity, item_id=item.item_id, created_at=now)
        actual, captured = _captured_history_read(db_session, [target])
        assert actual == expected
        assert len(captured) == 2
        assert "json_group_array" in captured[0][0]
        assert "json_group_array" not in captured[1][0]
    finally:
        driver.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, previous)


def test_history_propagates_unrelated_data_errors(
    db_session: Session, make_item: Callable[..., Item],
) -> None:
    """Only SQLite's exact size error may retry the Core statement."""
    now = datetime(2026, 10, 1)
    item = make_item(warehouse_qty=Decimal(5))
    target = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=1, created_at=now, inventory_effect=[{"scope": "warehouse", "delta": 1}])
    db_session.add(target)
    db_session.flush()
    connection = db_session.connection()

    def data_failure(
        _connection: object, _cursor: object, statement: str, parameters: tuple,
        _context: object, _many: bool,
    ) -> None:
        if "json_group_array" in statement:
            raise DataError(statement, parameters, sqlite3.DataError("unrelated data error"))

    event.listen(connection, "before_cursor_execute", data_failure)
    try:
        with pytest.raises(DataError, match="unrelated data error"):
            load_inventory_effect_quantities(db_session, [target])
    finally:
        event.remove(connection, "before_cursor_execute", data_failure)


def test_history_preserves_core_size_failure_after_packing_fallback(
    db_session: Session, make_item: Callable[..., Item],
) -> None:
    """An original oversized row still fails after the optional transport retry."""
    now = datetime(2026, 10, 1)
    item = make_item(warehouse_qty=Decimal(5))
    identity = uuid4()
    effect = json.dumps([{"scope": "warehouse", "delta": 1, "note": "x" * 400050}])
    connection = db_session.connection()
    connection.exec_driver_sql(
        "INSERT INTO transaction_logs (log_id,item_id,transaction_type,quantity_change,created_at,inventory_effect) VALUES (?,?,?,?,?,?)",
        (identity.hex, item.item_id.hex, "RECEIVE", 1,
         now.isoformat(sep=" ", timespec="microseconds"), effect),
    )
    driver = connection.connection.driver_connection
    previous = driver.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 400000)
    try:
        c = TransactionLog.__table__.c
        with pytest.raises(DataError) as original:
            db_session.execute(select(c.log_id, c.item_id, c.created_at, c.inventory_effect)
                .where(c.item_id.in_({item.item_id}), c.created_at >= now)).all()
        target = TransactionLog(log_id=identity, item_id=item.item_id, created_at=now)
        with pytest.raises(DataError) as retried:
            load_inventory_effect_quantities(db_session, [target])
        assert retried.value.orig.sqlite_errorcode == original.value.orig.sqlite_errorcode == sqlite3.SQLITE_TOOBIG
        assert str(retried.value.orig) == str(original.value.orig)
    finally:
        driver.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, previous)
