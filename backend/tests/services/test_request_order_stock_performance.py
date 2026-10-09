"""A target suffix must be identical to the complete request-order calculation."""

from dataclasses import replace
from datetime import datetime, timedelta
from random import Random
from typing import Any
from uuid import NAMESPACE_URL, uuid5

import pytest
from sqlalchemy import case, create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateTable

from app.database import Base
from app.models import Inventory, TransactionLog, TransactionTypeEnum
from app.services.inv_effect import StockTotals
from app.services.request_order_stock import StockHistoryEntry, load_request_order_stock, recalculate_request_order_stock


START = datetime(2026, 9, 1)


def _entries(count: int) -> list[StockHistoryEntry]:
    return [StockHistoryEntry(
        log_id=uuid5(NAMESPACE_URL, f"request-suffix-{index}"),
        created_at=START + timedelta(minutes=index), requested_at=START + timedelta(minutes=index),
        before=StockTotals(index, 0), after=StockTotals(index + 1, 0),
        inventory_effect=[{"scope": "warehouse", "delta": 1}],
    ) for index in range(count)]


def _persist(db_session, make_item, entries: list[StockHistoryEntry], current: int):
    item = make_item(warehouse_qty=current)
    db_session.bulk_insert_mappings(TransactionLog, [{
        "log_id": row.log_id, "item_id": item.item_id, "transaction_type": TransactionTypeEnum.ADJUST,
        "quantity_change": 1, "created_at": row.created_at,
        "warehouse_qty_before": row.before.warehouse if row.before else None,
        "department_qty_before": row.before.department if row.before else None,
        "warehouse_qty_after": row.after.warehouse if row.after else None,
        "department_qty_after": row.after.department if row.after else None,
        "inventory_effect": row.inventory_effect, "cancelled": row.cancelled,
        "cancelled_at": row.cancelled_at, "reverses_log_id": row.reverses_log_id,
    } for row in entries])
    expression = case({row.log_id: row.requested_at for row in entries if row.requested_at != row.created_at},
                      value=TransactionLog.log_id, else_=TransactionLog.created_at) if any(
                          row.requested_at != row.created_at for row in entries) else TransactionLog.created_at
    return item, expression


@pytest.mark.parametrize("boundary", [
    "valid", "same_time", "backdated", "future_request", "missing", "broken_effect", "negative",
    "old_invalid", "old_future_request", "old_legacy_unknown", "old_legacy_later", "old_reversal",
    "reversal_before_original", "request_order_negative",
])
def test_suffix_matches_full_history_at_safety_boundaries(db_session, make_item, boundary):
    entries = _entries(30)
    current = 30
    targets = {entries[25].log_id, entries[-1].log_id}
    if boundary == "same_time":
        entries[24] = replace(entries[24], created_at=entries[25].created_at)
    elif boundary == "backdated":
        entries[-1] = replace(entries[-1], requested_at=entries[3].created_at)
        entries[10] = replace(entries[10], before=None)
    elif boundary == "future_request":
        entries[26] = replace(entries[26], requested_at=entries[28].created_at)
    elif boundary == "missing":
        entries[26] = replace(entries[26], before=None)
    elif boundary == "broken_effect":
        entries[26] = replace(entries[26], inventory_effect=[{"scope": "unknown", "delta": 1}])
    elif boundary == "negative":
        entries[26] = replace(entries[26], before=StockTotals(-1, 0))
    elif boundary == "old_invalid":
        entries[10] = replace(entries[10], inventory_effect=None)
    elif boundary == "old_future_request":
        entries[10] = replace(entries[10], requested_at=START + timedelta(minutes=100))
    elif boundary == "old_legacy_unknown":
        entries[1] = replace(entries[1], cancelled=True)
    elif boundary == "old_legacy_later":
        entries[1] = replace(entries[1], cancelled=True, cancelled_at=entries[27].created_at)
    elif boundary == "old_reversal":
        entries[1] = replace(entries[1], cancelled=True)
        entries[2] = replace(entries[2], reverses_log_id=entries[1].log_id)
    elif boundary == "reversal_before_original":
        entries[25] = replace(entries[25], cancelled=True)
        entries[2] = replace(entries[2], reverses_log_id=entries[25].log_id)
        # Keep the FK valid while retaining the deliberately older reversal timestamp.
        entries = [row for row in entries if row is not entries[2]] + [entries[2]]
    elif boundary == "request_order_negative":
        entries[26] = replace(entries[26], before=StockTotals(26, 0), after=StockTotals(0, 0),
                              requested_at=entries[24].created_at,
                              inventory_effect=[{"scope": "warehouse", "delta": -26}])
        for index in range(27, 30):
            entries[index] = replace(entries[index], before=StockTotals(index - 27, 0), after=StockTotals(index - 26, 0))
        current = 3
    item, expression = _persist(db_session, make_item, entries, current)
    expected = recalculate_request_order_stock(entries, StockTotals(current, 0))
    full = load_request_order_stock(db_session, [item.item_id], request_date_expr=expression)
    assert full == expected
    actual = load_request_order_stock(db_session, [item.item_id], request_date_expr=expression,
                                     target_log_ids=targets)
    assert actual == {key: value for key, value in expected.items() if key in targets}
    if boundary in {"old_invalid", "old_future_request", "old_reversal", "reversal_before_original", "valid"}:
        assert all(value.status == "available" for value in actual.values())
    if boundary == "request_order_negative":
        assert actual[entries[25].log_id].reason == "negative_balance"
        assert actual[entries[-1].log_id].status == "available"


@pytest.mark.parametrize("seed", range(24))
def test_seeded_histories_preserve_each_target_result(db_session, make_item, seed):
    random = Random(seed)
    entries = _entries(40)
    for index in range(1, len(entries)):
        change = random.randrange(18)
        if change == 0:
            entries[index] = replace(entries[index], requested_at=entries[max(0, index - random.randrange(12))].created_at)
        elif change == 1:
            entries[index] = replace(entries[index], before=None)
        elif change == 2:
            entries[index] = replace(entries[index], created_at=entries[index - 1].created_at)
        elif change == 3:
            entries[index] = replace(entries[index], inventory_effect=[{"scope": "warehouse", "delta": True}])
        elif change == 4:
            entries[index] = replace(entries[index], cancelled=True,
                                     cancelled_at=None if random.randrange(2) else entries[min(39, index + 2)].created_at)
        elif change == 5:
            entries[index] = replace(entries[index], reverses_log_id=entries[index - 1].log_id)
    targets = {row.log_id for row in random.sample(entries[20:], 4)}
    item, expression = _persist(db_session, make_item, entries, 40)
    expected = recalculate_request_order_stock(entries, StockTotals(40, 0))
    actual = load_request_order_stock(db_session, [item.item_id], request_date_expr=expression,
                                     target_log_ids=targets)
    assert actual == {key: value for key, value in expected.items() if key in targets}


def test_latest_target_materializes_only_inclusive_suffix(db_session, make_item):
    entries = _entries(1000)
    item, expression = _persist(db_session, make_item, entries, 1000)
    queries = []

    def capture(_connection, _cursor, statement, parameters, _context, _many):
        if "transaction_logs.inventory_effect" in statement:
            queries.append((statement, parameters))

    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", capture)
    try:
        actual = load_request_order_stock(db_session, [item.item_id], request_date_expr=expression,
                                         target_log_ids={entries[-1].log_id})
    finally:
        event.remove(connection, "before_cursor_execute", capture)
    assert actual == {entries[-1].log_id: recalculate_request_order_stock(entries, StockTotals(1000, 0))[entries[-1].log_id]}
    assert len(queries) == 1
    with connection.exec_driver_sql(*queries[0]) as rows:
        assert len(rows.all()) == 1


def test_other_item_reversal_cannot_erase_global_legacy_boundary(db_session, make_item):
    entries = _entries(5)
    entries[0] = replace(entries[0], cancelled=True)
    item, expression = _persist(db_session, make_item, entries, 5)
    other = make_item()
    db_session.add(TransactionLog(item_id=other.item_id, transaction_type=TransactionTypeEnum.ADJUST,
                                  quantity_change=0, reverses_log_id=entries[0].log_id))
    db_session.flush()
    actual = load_request_order_stock(db_session, [item.item_id], request_date_expr=expression,
                                     target_log_ids={entries[-1].log_id})
    assert actual[entries[-1].log_id].reason == "missing_history"


def test_empty_targets_do_not_fall_back_to_all_history(db_session, make_item):
    item, expression = _persist(db_session, make_item, _entries(5), 5)
    assert load_request_order_stock(db_session, [item.item_id], request_date_expr=expression, target_log_ids=set()) == {}


def test_global_legacy_boundary_is_isolated_per_item(db_session, make_item):
    first = _entries(5)
    first[0] = replace(first[0], cancelled=True)
    first_item, _ = _persist(db_session, make_item, first, 5)
    second = [replace(row, log_id=uuid5(NAMESPACE_URL, f"other-item-{index}")) for index, row in enumerate(_entries(5))]
    second_item, _ = _persist(db_session, make_item, second, 5)
    result = load_request_order_stock(db_session, [first_item.item_id, second_item.item_id],
                                     request_date_expr=TransactionLog.created_at,
                                     target_log_ids={first[-1].log_id, second[-1].log_id})
    assert result[first[-1].log_id].reason == "missing_history"
    assert result[second[-1].log_id].status == "available"


@pytest.mark.parametrize("noncanonical,unknown", [(False, False), (True, True), (True, False)])
def test_legacy_numeric_uuid_column_uses_reversal_index_without_changing_cancellation_state(
    noncanonical: bool, unknown: bool,
) -> None:
    """NUMERIC 열의 정규 UUID는 인덱스를 유지하고 비정규 PK는 전체 조회 의미를 보존한다."""
    engine = create_engine("sqlite://")
    item_id = uuid5(NAMESPACE_URL, "legacy-affinity-item")
    entries = _entries(100)
    captured = []
    try:
        Base.metadata.create_all(engine)
        with engine.begin() as connection:
            connection.exec_driver_sql("DROP TABLE transaction_logs")
            ddl = str(CreateTable(TransactionLog.__table__).compile(dialect=engine.dialect))
            assert "log_id VARCHAR(32)" in ddl
            connection.exec_driver_sql(ddl.replace("log_id VARCHAR(32)", "log_id NUMERIC", 1))
            connection.exec_driver_sql("CREATE INDEX ix_transaction_logs_reverses_log_id ON transaction_logs(reverses_log_id)")
        with Session(engine) as session:
            session.add(Inventory(item_id=item_id, warehouse_qty=100))
            session.bulk_insert_mappings(TransactionLog, [{
                "log_id": row.log_id, "item_id": item_id, "transaction_type": TransactionTypeEnum.ADJUST,
                "quantity_change": 1, "created_at": row.created_at,
                "warehouse_qty_before": row.before.warehouse, "warehouse_qty_after": row.after.warehouse,
                "department_qty_before": 0, "department_qty_after": 0,
                "inventory_effect": row.inventory_effect,
                "cancelled": index == 1 or (not noncanonical and index == 3),
                "reverses_log_id": entries[1].log_id if index == 2 else None,
            } for index, row in enumerate(entries)])
            # NUMERIC PK와 동등한 다른 숫자 표기도 기존 취소 판정을 보존한다.
            legacy_ids = [(123, "00123"), (125, "1.25e2")] + ([(127, None)] if unknown else [])
            for original, reversal in legacy_ids if noncanonical else ():
                session.connection().exec_driver_sql(
                    "INSERT INTO transaction_logs(log_id,item_id,transaction_type,quantity_change,created_at,cancelled) VALUES(?,?,'ADJUST',0,?,1)",
                    (original, item_id.hex, START.isoformat(sep=" ") + ".000000"),
                )
                if reversal is not None:
                    session.connection().exec_driver_sql(
                        "INSERT INTO transaction_logs(log_id,item_id,transaction_type,quantity_change,created_at,cancelled,reverses_log_id) VALUES(?,?,'ADJUST',0,?,0,?)",
                        ("reversal-" + str(original), item_id.hex, START.isoformat(sep=" ") + ".000000", reversal),
                    )
            session.flush()
            connection = session.connection()

            def capture(_connection: Any, _cursor: Any, statement: str, parameters: Any,
                        _context: Any, _many: bool) -> None:
                """비교용 취소 집계 SQL만 보존하고 전체 원장 조회는 계측에서 제외한다."""
                if "max(transaction_logs.cancelled_at)" in statement:
                    captured.append((statement, parameters))

            event.listen(connection, "before_cursor_execute", capture)
            try:
                actual = load_request_order_stock(session, [item_id], request_date_expr=TransactionLog.created_at,
                                                  target_log_ids={entries[-1].log_id})
            finally:
                event.remove(connection, "before_cursor_execute", capture)
            assert actual[entries[-1].log_id].reason == "missing_history"
            if noncanonical:
                full = load_request_order_stock(session, [item_id], request_date_expr=TransactionLog.created_at)
                assert actual == {entries[-1].log_id: full[entries[-1].log_id]}
                assert captured == []
                return
            assert len(captured) == 1
            statement, parameters = captured[0]
            observed = connection.exec_driver_sql(statement, parameters).all()
            expected = connection.exec_driver_sql(
                "SELECT item_id,max(cancelled_at),count(CASE WHEN cancelled_at IS NULL THEN 1 END) FROM transaction_logs a "
                "WHERE item_id=? AND cancelled IS 1 AND NOT EXISTS(SELECT 1 FROM transaction_logs b WHERE b.item_id=a.item_id AND b.reverses_log_id=a.log_id) GROUP BY item_id",
                (item_id.hex,),
            ).all()
            assert observed == expected
            assert observed[0][2] == 1
            plan = connection.exec_driver_sql("EXPLAIN QUERY PLAN " + statement, parameters).all()
            assert any("SEARCH" in row[3] and "reverses_log_id=?" in row[3] for row in plan), plan
    finally:
        engine.dispose()
