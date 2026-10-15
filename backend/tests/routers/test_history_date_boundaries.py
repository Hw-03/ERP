"""날짜 원문 표현이 달라도 전체 원장·커서·위치 수량 의미를 보존한다."""

from collections.abc import Callable
from datetime import datetime, timedelta
from dataclasses import replace
import sqlite3
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import String, and_, event, func, literal, or_, select
from sqlalchemy.orm import Session

from app import database
from app.models import DepartmentEnum, IoBatch, Item, LocationStatusEnum, TransactionLog, TransactionTypeEnum
from app.routers.inventory import transactions
from app.services import inventory_effect_history as effect_history
from app.services.request_order_stock import load_request_order_stock
from app.services.sqlite_datetime_contract import canonical_datetime
from tests.routers.test_transaction_display_groups_performance import URL, _full_pages, _pages, _submission_metadata_query
from tests.routers.test_transaction_display_groups import _add_batch
from tests.services.test_request_order_stock_performance import _entries, _persist


BASE = datetime(2026, 9, 2, 3)


@pytest.fixture(autouse=True)
def only_memory(db_session: Session) -> None:
    """Reject an accidental production fixture before any scenario is created."""
    assert database.engine.url.database == ":memory:"
    assert db_session.connection().engine.url.database in (None, "", ":memory:")


def _full_history_rows(db: Session, item_ids: set, _cutoff: datetime) -> list:
    """Use the original full-width history population as the response oracle."""
    c = TransactionLog.__table__.c
    return list(db.execute(select(c.log_id, c.item_id, c.created_at, c.inventory_effect)
                           .where(c.item_id.in_(item_ids))).all())


def _original_stock(db: Session, item_ids: set, *, request_date_expr: Any,
                    target_log_ids: set | None = None) -> dict:
    """The pre-optimization caller requested complete histories for these items."""
    return load_request_order_stock(db, item_ids, request_date_expr=request_date_expr)


def _raw_date(db: Session, log: TransactionLog, style: str) -> None:
    """Change storage spelling, preserving the same valid datetime value."""
    timestamp = log.created_at.isoformat(sep="T" if style == "iso_t" else " ", timespec="seconds")
    db.connection().exec_driver_sql("UPDATE transaction_logs SET created_at=? WHERE log_id=?",
                                   (timestamp, log.log_id.hex))


@pytest.mark.parametrize("style", ["iso_t", "seconds"])
def test_solo_raw_dates_preserve_all_pages(client: TestClient, db_session: Session,
                                         make_item: Callable[..., Item], monkeypatch: pytest.MonkeyPatch,
                                         style: str) -> None:
    """Every page, cursor, and identity must equal the original complete read."""
    item = make_item(warehouse_qty=3)
    logs = [TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
                           quantity_change=1, created_at=BASE + timedelta(seconds=index),
                           warehouse_qty_before=index, warehouse_qty_after=index + 1,
                           department_qty_before=0, department_qty_after=0,
                           inventory_effect=[{"scope": "warehouse", "delta": 1}])
            for index in range(3)]
    db_session.add_all(logs)
    db_session.flush()
    ids = {str(log.log_id) for log in logs}
    for log in logs:
        _raw_date(db_session, log, style)
    db_session.commit()
    with monkeypatch.context() as patch:
        patch.setattr(transactions, "load_request_order_stock", _original_stock)
        patch.setattr(effect_history, "_history_rows", _full_history_rows)
        expected = _full_pages(client, patch, {"limit": 1})
    assert len(expected) == 3
    actual = _pages(client, {"limit": 1})
    assert actual == expected
    assert {log["log_id"] for page in actual for group in page["groups"] for log in group["logs"]} == ids


def _transfer(db: Session, make_item: Callable[..., Item], make_location: Callable[..., Any]) -> TransactionLog:
    """Use different physical cells so totals cannot hide a missing location effect."""
    item = make_item(warehouse_qty=3)
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY,
                  status=LocationStatusEnum.PRODUCTION, quantity=2)
    log = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.TRANSFER_TO_PROD,
                         quantity_change=2, created_at=BASE,
                         warehouse_qty_before=5, warehouse_qty_after=3,
                         department_qty_before=0, department_qty_after=2,
                         inventory_effect=[{"scope": "warehouse", "delta": -2},
                                           {"scope": "location", "department": DepartmentEnum.ASSEMBLY.value,
                                            "status": "PRODUCTION", "delta": 2}])
    db.add(log)
    db.flush()
    _raw_date(db, log, "seconds")
    db.commit()
    return log


def test_second_precision_target_keeps_stock_and_cell_maps(db_session: Session,
                                                         make_item: Callable[..., Item],
                                                         make_location: Callable[..., Any],
                                                         monkeypatch: pytest.MonkeyPatch) -> None:
    """Compare both projections against full histories and exact cell quantities."""
    log = _transfer(db_session, make_item, make_location)
    expected_stock = load_request_order_stock(db_session, {log.item_id}, request_date_expr=TransactionLog.created_at)
    with monkeypatch.context() as patch:
        patch.setattr(effect_history, "_history_rows", _full_history_rows)
        expected_effect = effect_history.load_inventory_effect_quantities(db_session, [log])
    assert expected_stock[log.log_id].status == "available"
    assert [(cell["quantity_before"], cell["quantity_after"]) for cell in expected_effect[log.log_id]] == [(5, 3), (0, 2)]
    actual_stock = load_request_order_stock(db_session, {log.item_id}, request_date_expr=TransactionLog.created_at,
                                           target_log_ids={log.log_id})
    actual_effect = effect_history.load_inventory_effect_quantities(db_session, [log])
    assert {"stock": actual_stock, "effects": actual_effect} == {"stock": expected_stock, "effects": expected_effect}


def test_second_precision_target_http_keeps_location_quantities(client: TestClient, db_session: Session,
                                                               make_item: Callable[..., Item],
                                                               make_location: Callable[..., Any]) -> None:
    """The public group response must not index a dropped request-order entry."""
    log = _transfer(db_session, make_item, make_location)
    # Return the real HTTP error response instead of re-raising its application exception.
    client._transport.raise_server_exceptions = False
    response = client.get(URL, params={"limit": 1})
    assert response.status_code == 200, response.text
    entry = response.json()["groups"][0]["logs"][0]
    assert entry["log_id"] == str(log.log_id)
    assert entry["request_order_stock"]["status"] == "available"
    assert [(cell["quantity_before"], cell["quantity_after"]) for cell in entry["inventory_effect"]] == [(5, 3), (0, 2)]


@pytest.mark.parametrize("boundary", ["created_min", "requested_min", "cancelled_max"])
def test_mixed_storage_keeps_python_minimum_and_cancellation_boundary(
    db_session: Session, make_item: Callable[..., Item], boundary: str,
) -> None:
    """Text MIN/MAX must not move the cutoff or erase a later cancellation barrier."""
    entries = _entries(5)
    if boundary == "requested_min":
        entries[1] = replace(entries[1], before=None)
        entries[3] = replace(entries[3], requested_at=entries[2].created_at)
        entries[4] = replace(entries[4], requested_at=entries[1].created_at)
    elif boundary == "cancelled_max":
        entries[0] = replace(entries[0], cancelled=True, cancelled_at=entries[3].created_at)
        entries[1] = replace(entries[1], cancelled=True, cancelled_at=entries[2].created_at)
    item, _expression = _persist(db_session, make_item, entries, 5)
    expression = TransactionLog.created_at
    if boundary == "created_min":
        db_session.connection().exec_driver_sql("UPDATE transaction_logs SET created_at=? WHERE log_id=?",
            (entries[2].created_at.isoformat(), entries[2].log_id.hex))
        targets = {entries[2].log_id, entries[4].log_id}
    elif boundary == "requested_min":
        for index in (3, 4):
            batch = _add_batch(db_session, f"date-boundary-{index}")
            batch.submitted_at = entries[index].requested_at
            db_session.flush()
            db_session.get(TransactionLog, entries[index].log_id).operation_batch_id = batch.batch_id
            db_session.flush()
            if index == 4:
                db_session.connection().exec_driver_sql("UPDATE io_batches SET submitted_at=? WHERE batch_id=?",
                    (entries[index].requested_at.isoformat(), batch.batch_id.hex))
        expression = func.coalesce(IoBatch.submitted_at, TransactionLog.created_at)
        targets = {entries[3].log_id, entries[4].log_id}
    else:
        db_session.connection().exec_driver_sql("UPDATE transaction_logs SET cancelled_at=? WHERE log_id=?",
            (entries[1].cancelled_at.isoformat(), entries[1].log_id.hex))
        targets = {entries[3].log_id, entries[4].log_id}
    db_session.flush()
    full = load_request_order_stock(db_session, {item.item_id}, request_date_expr=expression)
    actual = load_request_order_stock(db_session, {item.item_id}, request_date_expr=expression,
                                     target_log_ids=targets)
    assert actual == {key: value for key, value in full.items() if key in targets}
    if boundary == "requested_min":
        assert actual[entries[4].log_id].reason == "missing_history"
    elif boundary == "cancelled_max":
        assert actual[entries[3].log_id].reason == "missing_history"
        assert actual[entries[4].log_id].status == "available"


def test_lowered_function_limit_keeps_original_history_reads(db_session: Session,
                                                            make_item: Callable[..., Item],
                                                            make_location: Callable[..., Any]) -> None:
    """Guard and packing functions may not reject a valid original two-argument read."""
    log = _transfer(db_session, make_item, make_location)
    driver = db_session.connection().connection.driver_connection
    previous = driver.setlimit(sqlite3.SQLITE_LIMIT_FUNCTION_ARG, 2)
    try:
        stock = load_request_order_stock(db_session, {log.item_id}, request_date_expr=TransactionLog.created_at,
                                        target_log_ids={log.log_id})
        effects = effect_history.load_inventory_effect_quantities(db_session, [log])
    finally:
        driver.setlimit(sqlite3.SQLITE_LIMIT_FUNCTION_ARG, previous)
    assert stock[log.log_id].status == "available"
    assert [(cell["quantity_before"], cell["quantity_after"]) for cell in effects[log.log_id]] == [(5, 3), (0, 2)]


def test_non_sqlite_history_keeps_original_select(db_session: Session, make_item: Callable[..., Item],
                                                monkeypatch: pytest.MonkeyPatch) -> None:
    """Compare compiled SQL and real typed rows; this is not a PostgreSQL execution claim."""
    from sqlalchemy.dialects import postgresql

    item = make_item(warehouse_qty=1)
    log = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
                         quantity_change=1, created_at=BASE, inventory_effect=[{"scope": "warehouse", "delta": 1}])
    db_session.add(log)
    db_session.flush()
    c = TransactionLog.__table__.c
    expected = select(c.log_id, c.item_id, c.created_at, c.inventory_effect).where(
        c.item_id.in_({item.item_id}), c.created_at >= BASE)
    captured = []

    def observe(connection: Any, statement: Any, multiparams: Any, params: Any, options: Any) -> None:
        """Capture the untouched non-SQLite statement before execution."""
        captured.append(statement)

    connection = db_session.connection()
    event.listen(connection, "before_execute", observe)
    try:
        with monkeypatch.context() as patch:
            patch.setattr(db_session.get_bind().dialect, "name", "postgresql")
            actual = effect_history._history_rows(db_session, {item.item_id}, BASE)
    finally:
        event.remove(connection, "before_execute", observe)
    assert len(captured) == 1
    assert str(captured[0].compile(dialect=postgresql.dialect())) == str(expected.compile(dialect=postgresql.dialect()))
    assert actual == list(db_session.execute(expected).all())


@pytest.mark.parametrize("boundary", [sqlite3.SQLITE_LIMIT_FUNCTION_ARG, sqlite3.SQLITE_LIMIT_COLUMN,
                                     sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER])
def test_solo_guard_preserves_sqlite_limits(db_session: Session, make_item: Callable[..., Item],
                                           boundary: int) -> None:
    """A valid original metadata projection stays readable under lowered limits."""
    item = make_item(warehouse_qty=1)
    db_session.add(TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
                                   quantity_change=1, created_at=BASE))
    db_session.flush()
    query = _submission_metadata_query(db_session).filter(TransactionLog.quantity_change >= 1)
    expected = db_session.execute(query.statement).all()
    driver = db_session.connection().connection.driver_connection
    value = {sqlite3.SQLITE_LIMIT_FUNCTION_ARG: 2, sqlite3.SQLITE_LIMIT_COLUMN: 16,
             sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER: 1}[boundary]
    previous = driver.setlimit(boundary, value)
    try:
        actual = db_session.execute(transactions._bounded_solo_metadata(query, db_session, 1, None)).all()
    finally:
        driver.setlimit(boundary, previous)
    assert actual == expected


@pytest.mark.parametrize("with_cursor", [False, True])
def test_non_sqlite_solo_preserves_original_cursor_sql(db_session: Session,
                                                       monkeypatch: pytest.MonkeyPatch,
                                                       with_cursor: bool) -> None:
    """PostgreSQL keeps the previous typed cursor and limit without SQLite guard SQL."""
    from uuid import UUID
    from sqlalchemy.dialects import postgresql

    query = _submission_metadata_query(db_session).order_by(
        TransactionLog.created_at.desc(), TransactionLog.log_id.desc())
    cursor = (BASE, BASE, UUID(int=1)) if with_cursor else None
    expected = query
    if cursor:
        sort_at, created_at, log_id = cursor
        expected = expected.filter(or_(
            TransactionLog.created_at < sort_at,
            and_(TransactionLog.created_at == sort_at, TransactionLog.created_at < created_at),
            and_(TransactionLog.created_at == sort_at, TransactionLog.created_at == created_at,
                 TransactionLog.log_id < log_id),
        ))
    with monkeypatch.context() as patch:
        patch.setattr(db_session.get_bind().dialect, "name", "postgresql")
        actual = transactions._bounded_solo_metadata(query, db_session, 1, cursor)
    assert str(actual.compile(dialect=postgresql.dialect())) == str(expected.limit(2).statement.compile(dialect=postgresql.dialect()))


@pytest.mark.parametrize("raw", [
    "2026-02-30 09:00:00.000000", "2026-04-31 09:00:00.000000", "2026-01-01 24:00:00.000000",
])
def test_guard_rejects_invalid_calendar_and_full_history_keeps_decode_error(
    db_session: Session, make_item: Callable[..., Item], raw: str,
) -> None:
    """An old invalid datetime must not disappear outside the target's suffix."""
    item = make_item(warehouse_qty=2)
    old, target = [TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
                                  quantity_change=1, created_at=BASE + timedelta(seconds=index),
                                  inventory_effect=[{"scope": "warehouse", "delta": 1}])
                   for index in range(2)]
    db_session.add_all([old, target])
    db_session.flush()
    db_session.connection().exec_driver_sql("UPDATE transaction_logs SET created_at=? WHERE log_id=?",
                                           (raw, old.log_id.hex))
    with pytest.raises(ValueError):
        _full_history_rows(db_session, {item.item_id}, target.created_at)
    # Evaluate both before asserting so a RED also captures whether the decoder ran.
    canonical = db_session.scalar(select(canonical_datetime(literal(raw, type_=String))))
    caught = None
    try:
        effect_history.load_inventory_effect_quantities(db_session, [target])
    except ValueError as error:
        caught = error
    assert {"canonical": canonical, "raised_value_error": caught is not None} == {
        "canonical": False, "raised_value_error": True,
    }


@pytest.mark.parametrize("raw", [
    "0001-01-01 00:00:00.000000", "9999-12-31 23:59:59.999999",
    "2000-02-29 00:00:00.000001", "2024-02-29 23:59:59.123456", "2026-04-30 09:00:00.000000",
])
def test_guard_keeps_valid_calendar_extremes_under_three_argument_limit(db_session: Session, raw: str) -> None:
    """Strict calendar checks keep Python's valid dates and the original argument budget."""
    assert datetime.fromisoformat(raw).isoformat(sep=" ", timespec="microseconds") == raw
    driver = db_session.connection().connection.driver_connection
    previous = driver.setlimit(sqlite3.SQLITE_LIMIT_FUNCTION_ARG, 3)
    try:
        assert db_session.scalar(select(canonical_datetime(literal(raw, type_=String)))) is True
    finally:
        driver.setlimit(sqlite3.SQLITE_LIMIT_FUNCTION_ARG, previous)


def test_solo_nul_datetime_suffix_keeps_same_time_cursor_page(client: TestClient, db_session: Session,
                                                            make_item: Callable[..., Item],
                                                            monkeypatch: pytest.MonkeyPatch) -> None:
    """The DateTime decoder accepts a NUL tail while SQL equality still sees extra bytes."""
    item = make_item(warehouse_qty=2)
    logs = [TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
                           quantity_change=1, created_at=BASE,
                           warehouse_qty_before=index, warehouse_qty_after=index + 1,
                           department_qty_before=0, department_qty_after=0,
                           inventory_effect=[{"scope": "warehouse", "delta": 1}])
            for index in range(2)]
    db_session.add_all(logs)
    db_session.flush()
    ids = {str(log.log_id) for log in logs}
    for log in logs:
        db_session.connection().exec_driver_sql("UPDATE transaction_logs SET created_at=? WHERE log_id=?",
            (BASE.isoformat(sep=" ", timespec="microseconds") + "\0tail", log.log_id.hex))
    db_session.commit()
    expected = _full_pages(client, monkeypatch, {"limit": 1})
    assert len(expected) == 2
    actual = _pages(client, {"limit": 1})
    assert actual == expected
    assert {log["log_id"] for page in actual for group in page["groups"] for log in group["logs"]} == ids


@pytest.mark.parametrize("style", ["uppercase", "hyphen"])
@pytest.mark.parametrize("scope", ["single", "mixed", "alias"])
def test_targeted_stock_keeps_uuid_storage_aliases(db_session: Session, make_item: Callable[..., Item],
                                                  style: str, scope: str) -> None:
    """SQL targets must preserve complete typed history, including duplicate UUID spellings."""
    entries = _entries(3)
    item, expression = _persist(db_session, make_item, entries, 3)
    target = entries[1].log_id if scope == "mixed" else entries[-1].log_id
    raw_id = target.hex.upper() if style == "uppercase" else str(target)
    changed_id = entries[0].log_id if scope == "alias" else target
    db_session.connection().exec_driver_sql("UPDATE transaction_logs SET log_id=? WHERE log_id=?",
                                           (raw_id, changed_id.hex))
    targets = {target, entries[-1].log_id} if scope == "mixed" else {target}
    full = load_request_order_stock(db_session, {item.item_id}, request_date_expr=expression)
    assert full[target].status == "available"
    actual = load_request_order_stock(db_session, {item.item_id}, request_date_expr=expression,
                                     target_log_ids=targets)
    assert actual == {key: value for key, value in full.items() if key in targets}


@pytest.mark.parametrize("boundary,value", [
    (sqlite3.SQLITE_LIMIT_FUNCTION_ARG, 3),
    (sqlite3.SQLITE_LIMIT_COLUMN, 12),
    (sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER, 3),
])
def test_stock_identity_guard_keeps_query_count_suffix_and_sqlite_limits(
    db_session: Session, make_item: Callable[..., Item], boundary: int, value: int,
) -> None:
    """Canonical identity checks reuse the date query and retain the inclusive one-row suffix."""
    entries = _entries(30)
    item, expression = _persist(db_session, make_item, entries, 30)
    full = load_request_order_stock(db_session, {item.item_id}, request_date_expr=expression)
    statements = []

    def observe(_connection: Any, _cursor: Any, statement: str, parameters: Any,
                _context: Any, _many: bool) -> None:
        statements.append((statement, parameters))

    connection = db_session.connection()
    driver = connection.connection.driver_connection
    previous = driver.setlimit(boundary, value)
    event.listen(connection, "before_cursor_execute", observe)
    try:
        actual = load_request_order_stock(db_session, {item.item_id}, request_date_expr=expression,
                                         target_log_ids={entries[-1].log_id})
    finally:
        event.remove(connection, "before_cursor_execute", observe)
        driver.setlimit(boundary, previous)
    assert actual == {entries[-1].log_id: full[entries[-1].log_id]}
    assert len(statements) == 5
    history = [(statement, parameters) for statement, parameters in statements
               if "transaction_logs.inventory_effect" in statement]
    assert len(history) == 1
    assert len(connection.exec_driver_sql(*history[0]).all()) == 1
