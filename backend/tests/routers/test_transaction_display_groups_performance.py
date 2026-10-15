"""Bound only disconnected solo metadata while preserving complete history pages."""

from __future__ import annotations

import base64
import json
import sqlite3
from datetime import datetime, timedelta
from typing import Any, Callable
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import DateTime, case, event, false, func, literal
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Query, Session

from app.models import InventoryOperation, IoBundle, IoLine, Item, TransactionLog, TransactionTypeEnum
from app.routers.inventory import transactions
from tests.routers.test_transaction_display_groups import _add_batch, _add_log


URL = "/api/inventory/transactions/display-groups"
BASE = datetime(2026, 9, 2, 3, 0, 0, 123456)


@pytest.mark.parametrize("historical_identity", [False, True])
@pytest.mark.parametrize("deleted_item", [False, True])
def test_group_details_read_only_item_identity_columns(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    historical_identity: bool, deleted_item: bool,
) -> None:
    """과거·현재 품목 표시와 삭제 품목 이력을 보존하며 상세 JOIN의 읽기 폭을 제한한다."""
    item = make_item(name="현재 그룹 품목")
    item.purchase_memo = "상세에서 사용하지 않는 구매 메모" * 100
    item.supplier = "상세에서 사용하지 않는 공급처"
    item.deleted_at = BASE if deleted_item else None
    logs = [_add_log(db_session, item, created_at=BASE + timedelta(seconds=index),
                     reference_no="identity-width") for index in range(2)]
    db_session.flush()
    for log in logs:
        log.item_snapshot = {
            "item_name": "거래 당시 그룹 품목", "mes_code": "OLD-GROUP",
            "process_type_code": "PF", "unit": "BOX",
        } if historical_identity else None
    db_session.commit()
    expected_ids, current_code = {str(log.log_id) for log in logs}, item.mes_code
    db_session.expunge_all()
    joined_columns: list[set[str]] = []

    def capture_columns(
        _connection: Any, cursor: Any, statement: str, _parameters: Any,
        _context: Any, _executemany: bool,
    ) -> None:
        """메타데이터가 아닌 실제 상세 JOIN에서 반환된 품목 열을 관찰한다."""
        if "FROM transaction_logs JOIN items" in statement:
            columns = {column[0] for column in cursor.description}
            if "transaction_logs_item_snapshot" in columns:
                joined_columns.append(columns)

    bind = db_session.get_bind()
    event.listen(bind, "after_cursor_execute", capture_columns)
    try:
        response = client.get(URL, params={"limit": 1})
    finally:
        event.remove(bind, "after_cursor_execute", capture_columns)
    assert response.status_code == 200, response.text
    rows = [log for group in response.json()["groups"] for log in group["logs"]]
    assert {log["log_id"] for log in rows} == expected_ids
    for log in rows:
        assert log["item_name"] == ("거래 당시 그룹 품목" if historical_identity else "현재 그룹 품목")
        assert log["mes_code"] == ("OLD-GROUP" if historical_identity else current_code)
        assert log["item_unit"] == ("BOX" if historical_identity else "EA")
        assert log["item_process_type_code"] == ("PF" if historical_identity else "TR")
        assert log["item_snapshot_preserved"] is historical_identity
        assert log["current_item_name"] == "현재 그룹 품목"
        assert log["current_mes_code"] == current_code
    assert len(joined_columns) == 1
    assert {column for column in joined_columns[0] if column.startswith("items_")} == {
        "items_item_id", "items_item_name", "items_mes_code", "items_process_type_code", "items_unit",
    }


@pytest.mark.parametrize("search", [None, "page detail", "absent detail"])
def test_batch_line_details_are_read_only_for_selected_groups(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    monkeypatch: pytest.MonkeyPatch, search: str | None,
) -> None:
    """All batches still group correctly, while off-page adjustment details stay unread."""
    item = make_item(name="page detail")
    expected = {}
    for index in range(6):
        batch = _add_batch(db_session, f"detail-page-{index}")
        batch.submitted_at = BASE + timedelta(seconds=index)
        mode = index % 3
        bundle = IoBundle(batch_id=batch.batch_id, source_kind="manual" if mode == 0 else "bom_parent",
                          source_item_id=item.item_id, title_snapshot=item.item_name, quantity=1)
        db_session.add(bundle)
        db_session.flush()
        db_session.add(IoLine(bundle_id=bundle.bundle_id, item_id=item.item_id,
                              item_name_snapshot=item.item_name, quantity=1, direction="in",
                              from_bucket="none", to_bucket="production", origin="manual" if mode == 0 else "direct",
                              included=mode != 1, exclusion_note="커스텀 BOM 상위 미반영" if mode == 1 else None))
        log = _add_log(db_session, item, created_at=batch.submitted_at, operation_batch_id=batch.batch_id)
        expected[str(log.log_id)] = (batch.batch_id, "ADJUST" if mode != 2 else None, batch.requester_name)
    db_session.commit()
    reads = []
    original = Query.all

    def tracked(query: Query, *args: Any, **kwargs: Any) -> list[Any]:
        """Observe consumed bundle rows without changing the query or its results."""
        rows = original(query, *args, **kwargs)
        names = {column["name"] for column in query.column_descriptions}
        if {"bundle_id", "source_kind", "exclusion_note"} <= names:
            reads.append({row.batch_id for row in rows})
        return rows

    monkeypatch.setattr(Query, "all", tracked)
    params = {"limit": 1, **({"search": search} if search else {})}
    returned = []
    while True:
        reads.clear()
        response = client.get(URL, params=params)
        assert response.status_code == 200, response.text
        body = response.json()
        rows = [log for group in body["groups"] for log in group["logs"]]
        selected_batches = {expected[log["log_id"]][0] for log in rows}
        assert set().union(*reads) == selected_batches
        for log in rows:
            batch_id, display_type, requester = expected[log["log_id"]]
            assert log["operation_batch_id"] == str(batch_id)
            assert log["history_batch"]["display_transaction_type"] == display_type
            assert log["requester_name"] == requester
            returned.append(log["log_id"])
        if not body["has_more"]:
            break
        params["cursor"] = body["next_cursor"]
    assert len(returned) == len(set(returned))
    assert set(returned) == (set() if search == "absent detail" else set(expected))


def _pages(client, params: dict) -> list[dict]:
    """Read every page and reject repeated cursors/groups instead of timing out."""
    pages, cursors, keys = [], set(), set()
    while True:
        response = client.get(URL, params=params)
        assert response.status_code == 200, response.text
        body = response.json()
        page_keys = [group["key"] for group in body["groups"]]
        assert len(page_keys) == len(set(page_keys))
        assert keys.isdisjoint(page_keys)
        keys.update(page_keys)
        pages.append(body)
        if not body["has_more"]:
            assert body["next_cursor"] is None
            return pages
        assert body["next_cursor"] not in cursors
        cursors.add(body["next_cursor"])
        params = {**params, "cursor": body["next_cursor"]}


def _full_pages(client, monkeypatch, params: dict) -> list[dict]:
    """Force the existing complete connected path as a response oracle."""
    with monkeypatch.context() as patch:
        patch.setattr(transactions, "_pure_solo_display_filter", lambda: false(), raising=False)
        patch.setattr(transactions, "_bounded_submission_metadata", lambda query, *_args: query.statement, raising=False)
        return _pages(client, params)


def _metadata_reads(monkeypatch) -> list[int]:
    """Count returned metadata rows, excluding detail and stock reconstruction reads."""
    counts = []
    original = Query.all

    def counted(query, *args, **kwargs):
        rows = original(query, *args, **kwargs)
        names = {column["name"] for column in query.column_descriptions}
        if {"request_order_at", "reason_category", "log_id"} <= names:
            counts.append(len(rows))
        return rows

    monkeypatch.setattr(Query, "all", counted)
    return counts


def _solos(db_session, item, count: int, *, tied: bool = False) -> list[TransactionLog]:
    """Include null and exact-empty references, stable UUID ties and a legacy cancellation."""
    rows = [TransactionLog(
        log_id=UUID(int=(0xABCDEF << 32) + index + 1), item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE, quantity_change=1,
        quantity_before=index, quantity_after=index + 1,
        reference_no=None if index % 2 else "", notes="needle solo",
        cancelled=index == 1, cancelled_at=BASE if index == 1 else None,
        created_at=BASE if tied else BASE + timedelta(seconds=index * 2),
    ) for index in range(count)]
    db_session.add_all(rows)
    db_session.flush()
    return rows


def test_connected_and_solo_metadata_share_one_sql_snapshot(client, db_session, make_item):
    """A solo can gain an operation between statements under READ COMMITTED."""
    item = make_item(name="single metadata snapshot")
    logs = _solos(db_session, item, 52)
    linked = [
        _add_log(db_session, item, created_at=BASE + timedelta(seconds=seconds), reference_no="linked")
        for seconds in (201, 200)
    ]
    db_session.commit()
    statements = []
    connection = db_session.connection()

    def capture_metadata(_connection, _cursor, statement, _parameters, context, _executemany):
        if " AS request_order_at" in statement and "reason_category" in statement:
            statements.append(context.compiled.statement)

    event.listen(connection, "before_cursor_execute", capture_metadata)
    try:
        response = client.get(URL, params={"limit": 50})
    finally:
        event.remove(connection, "before_cursor_execute", capture_metadata)

    assert response.status_code == 200, response.text
    assert len(statements) == 1, "Connected and solo metadata must use one database snapshot"
    postgres_sql = str(statements[0].compile(dialect=postgresql.dialect()))
    assert "UNION ALL" in postgres_sql
    assert "LIMIT" in postgres_sql
    groups = response.json()["groups"]
    assert response.json()["has_more"] is True
    assert groups[0]["key"] == "linked::"
    assert [row["log_id"] for row in groups[0]["logs"]] == [str(row.log_id) for row in linked]
    assert [group["key"] for group in groups[1:]] == [f"solo:{row.log_id}" for row in reversed(logs[3:])]


@pytest.mark.parametrize("count", [0, 49, 50, 51, 160])
@pytest.mark.parametrize("tied", [False, True])
def test_solo_metadata_is_bounded_and_every_page_equals_full_history(client, db_session, make_item, monkeypatch, count, tied):
    item = make_item(name="bounded solo")
    logs = _solos(db_session, item, count, tied=tied)
    db_session.commit()
    expected = _full_pages(client, monkeypatch, {"limit": 50})
    reads = _metadata_reads(monkeypatch)

    actual = _pages(client, {"limit": 50})

    assert actual == expected
    ids = [row["log_id"] for page in actual for group in page["groups"] for row in group["logs"]]
    assert ids == [str(log.log_id) for log in reversed(logs)]
    assert actual[0]["has_more"] is (count > 50)
    assert max(reads, default=0) <= 51


@pytest.mark.parametrize("search", [None, "needle", "absent-search"])
def test_bounded_solos_preserve_mixed_groups_search_and_all_cursor_pages(client, db_session, make_item, monkeypatch, search):
    wanted = make_item(name="needle component")
    sibling = make_item(name="unmatched sibling")
    solos = _solos(db_session, wanted, 180)
    connected = []

    def log(item, seconds: int, **fields):
        row = _add_log(db_session, item, created_at=BASE + timedelta(seconds=seconds))
        for key, value in fields.items():
            setattr(row, key, value)
        connected.append(row)
        return row

    def operation(kind: str = "BUSINESS", **fields):
        row = InventoryOperation(kind=kind, domain="inventory", action="receive", display_label="입고",
                                 actor_name="Tester", effective_at=BASE + timedelta(seconds=600), **fields)
        db_session.add(row)
        db_session.flush()
        return row

    submission = uuid4()
    first, second = operation(), operation()
    original = log(wanted, 500, operation_id=first.operation_id, submission_id=submission)
    log(sibling, 400, operation_id=second.operation_id, submission_id=submission)
    cancellation = operation("CANCELLATION", reverses_operation_id=first.operation_id)
    log(sibling, 600, operation_id=cancellation.operation_id, submission_id=submission,
        reverses_log_id=original.log_id, quantity_change=-1)
    standalone = operation()
    log(wanted, 580, operation_id=standalone.operation_id)
    log(sibling, 100, operation_id=standalone.operation_id)
    batch = _add_batch(db_session, "bounded-legacy")
    batch.submitted_at = BASE + timedelta(seconds=350)
    log(wanted, 350, operation_batch_id=batch.batch_id)
    log(sibling, 200, operation_batch_id=batch.batch_id)
    for phase, seconds in [("COMPONENT_CHANGE", 300), ("PICKUP", 290)]:
        log(wanted, seconds, reference_no="shared-reference", shipping_phase=phase)
        log(sibling, seconds - 1, reference_no="shared-reference", shipping_phase=phase)
    log(wanted, 270, reference_no=" ")
    log(sibling, 269, reference_no=" ")
    # Excluding both lifecycle sides from the solo path preserves the inclusive 60-second pair.
    lifecycle_fields = dict(produced_by="operator", department="조립", reason_category="damage", reason_memo="same")
    parent = log(wanted, 220, transaction_type=TransactionTypeEnum.MARK_DEFECTIVE, **lifecycle_fields)
    child = log(wanted, 280, transaction_type=TransactionTypeEnum.DEFECT_SCRAP, **lifecycle_fields)
    detached_reverse = log(wanted, 260, reverses_log_id=solos[0].log_id, quantity_change=-1)
    db_session.commit()
    params = {"limit": 50, **({"search": search} if search else {})}
    expected = _full_pages(client, monkeypatch, params)
    reads = _metadata_reads(monkeypatch)

    actual = _pages(client, params)

    assert actual == expected
    groups = [group for page in actual for group in page["groups"]]
    if search == "absent-search":
        assert groups == []
    else:
        by_key = {group["key"]: group for group in groups}
        submission_group = by_key[f"submission:{submission}"]
        assert len(submission_group["logs"]) == len(submission_group["work_groups"]) == 2
        assert {row["operation_effective_status"] for row in submission_group["logs"]} == {"active", "cancelled"}
        assert len(by_key[str(standalone.operation_id)]["logs"]) == 2
        assert len(by_key[str(batch.batch_id)]["logs"]) == 2
        assert len(by_key["shared-reference::COMPONENT_CHANGE"]["logs"]) == 2
        assert len(by_key["shared-reference::PICKUP"]["logs"]) == 2
        assert len(by_key[" ::"]["logs"]) == 2
        lifecycle = by_key[f"defect-lifecycle:{parent.log_id}:{child.log_id}"]
        assert [row["log_id"] for row in lifecycle["logs"]] == [str(parent.log_id), str(child.log_id)]
        assert f"solo:{detached_reverse.log_id}" in by_key
        if search:
            assert str(cancellation.operation_id) not in by_key
            assert len(submission_group["matched_log_ids"]) == 1
            assert groups[0]["key"] == str(standalone.operation_id)
        else:
            assert [group["key"] for group in groups[:3]] == [str(cancellation.operation_id), str(standalone.operation_id), f"submission:{submission}"]
            ids = [row["log_id"] for group in groups for row in group["logs"]]
            assert len(ids) == len(set(ids)) == len(solos) + len(connected)
    assert max(reads, default=0) <= 51 + len(connected)


@pytest.mark.parametrize("followup", [TransactionTypeEnum.DEFECT_SCRAP, TransactionTypeEnum.SUPPLIER_RETURN, TransactionTypeEnum.DISASSEMBLE])
@pytest.mark.parametrize("elapsed", [0, 60, 61])
def test_solo_limit_keeps_every_lifecycle_type_and_time_boundary(client, db_session, make_item, monkeypatch, followup, elapsed):
    item = make_item(name="lifecycle bounds")
    _solos(db_session, item, 80)
    fields = dict(produced_by="actor", department="조립", reason_category="damage", reason_memo="same")
    parent = _add_log(db_session, item, created_at=BASE + timedelta(seconds=300), transaction_type=TransactionTypeEnum.MARK_DEFECTIVE, **fields)
    child = _add_log(db_session, item, created_at=parent.created_at + timedelta(seconds=elapsed), transaction_type=followup, **fields)
    # The chronological stable order at a tie must put the parent first for this pairing fixture.
    if elapsed == 0:
        parent.log_id, child.log_id = UUID(int=(1 << 120) + 2), UUID(int=(1 << 120) + 1)
    db_session.commit()

    actual = _pages(client, {"limit": 50})

    assert actual == _full_pages(client, monkeypatch, {"limit": 50})
    if elapsed <= 60:
        assert actual[0]["groups"][0]["key"] == f"defect-lifecycle:{parent.log_id}:{child.log_id}"
        assert [row["log_id"] for row in actual[0]["groups"][0]["logs"]] == [str(parent.log_id), str(child.log_id)]
    else:
        assert actual[0]["groups"][0]["key"] == f"solo:{child.log_id}"
        assert actual[0]["groups"][1]["key"] == f"solo:{parent.log_id}"


def test_solo_search_is_applied_before_limit_and_retains_unmatched_group_siblings(client, db_session, make_item, monkeypatch):
    item = make_item(name="sparse search")
    logs = _solos(db_session, item, 160)
    for index in (0, 3):
        logs[index].notes = "old-match-only"
    matched = _add_log(db_session, item, created_at=BASE + timedelta(seconds=500), reference_no="sparse-group")
    matched.notes = "old-match-only"
    sibling = _add_log(db_session, item, created_at=BASE + timedelta(seconds=499), reference_no="sparse-group")
    db_session.commit()
    params = {"limit": 1, "search": "oldmatchonly"}
    expected = _full_pages(client, monkeypatch, params)
    reads = _metadata_reads(monkeypatch)

    actual = _pages(client, params)

    assert actual == expected
    assert [page["groups"][0]["key"] for page in actual] == ["sparse-group::", f"solo:{logs[3].log_id}", f"solo:{logs[0].log_id}"]
    assert [row["log_id"] for row in actual[0]["groups"][0]["logs"]] == [str(matched.log_id), str(sibling.log_id)]
    assert actual[0]["groups"][0]["matched_log_ids"] == [str(matched.log_id)]
    assert max(reads) == 4  # Two connected siblings plus at most limit+1 matching solos.


@pytest.mark.parametrize("field,value", [
    ("sort_at", "not-a-date"), ("sort_at", "2026-09-02T03:00:00.123456+00:00"),
    ("created_at", "2026-09-02T03:00:00.123456000"),
    ("log_id", "00000000-0000-0000-00AB-CDEF00000020"),
    ("log_id", "000000000000000000abcdef00000020"),
])
def test_noncanonical_cursor_preserves_full_path_string_semantics(client, db_session, make_item, monkeypatch, field, value):
    _solos(db_session, make_item(name="cursor fallback"), 70, tied=True)
    db_session.commit()
    first = client.get(URL, params={"limit": 50}).json()
    cursor = first["next_cursor"]
    payload = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))
    payload[field] = value
    changed = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    params = {"limit": 50, "cursor": changed}
    expected = _full_pages(client, monkeypatch, params)
    reads = _metadata_reads(monkeypatch)

    assert _pages(client, params) == expected
    assert reads[0] == 70


@pytest.mark.parametrize("cursor", ["!", "e30", "W10"])
def test_invalid_cursor_keeps_existing_bad_request(client, cursor):
    assert client.get(URL, params={"cursor": cursor}).status_code == 400


@pytest.mark.parametrize("work_count", [1, 2])
@pytest.mark.parametrize("tied", [False, True])
def test_submission_candidates_read_complete_envelopes_and_preserve_all_pages(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    monkeypatch: pytest.MonkeyPatch, work_count: int, tied: bool,
) -> None:
    """Page groups, not rows: old siblings must follow their newest submission anchor."""
    item = make_item(name="submission candidates")
    for index in range(12):
        submission = uuid4()
        for work in range(work_count):
            operation = InventoryOperation(kind="BUSINESS", domain="inventory", action="receive",
                                           display_label="receive", actor_name="actor", effective_at=BASE)
            db_session.add(operation)
            db_session.flush()
            for sibling in range(2):
                log = _add_log(db_session, item, created_at=BASE if tied else BASE + timedelta(seconds=index * 10 - sibling * 200))
                log.log_id = UUID(int=(0xAA << 64) + index * 10 + work * 2 + sibling + 1)
                log.submission_id, log.operation_id = submission, operation.operation_id
    db_session.commit()
    expected = _full_pages(client, monkeypatch, {"limit": 2})
    reads = _metadata_reads(monkeypatch)

    assert _pages(client, {"limit": 2}) == expected
    assert max(reads) <= 3 * 2 * work_count


def test_submission_search_preserves_a_pair_parent_hidden_by_operation_precedence(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A matching submission row can disappear from its sole work group; keep old search."""
    item = make_item(name="pair search")
    submission = uuid4()
    fields = dict(produced_by="actor", department="조립", reason_category="damage", reason_memo="same")
    parent = _add_log(db_session, item, created_at=BASE, transaction_type=TransactionTypeEnum.MARK_DEFECTIVE, **fields)
    parent.submission_id, parent.notes = submission, "hidden-only-match"
    operation = InventoryOperation(kind="BUSINESS", domain="defect", action="scrap",
                                   display_label="scrap", actor_name="actor", effective_at=BASE)
    db_session.add(operation)
    db_session.flush()
    child = _add_log(db_session, item, created_at=BASE + timedelta(seconds=10),
                     transaction_type=TransactionTypeEnum.DEFECT_SCRAP, **fields)
    child.submission_id, child.operation_id = submission, operation.operation_id
    db_session.commit()
    params = {"limit": 1, "search": "hiddenonlymatch"}
    expected = _full_pages(client, monkeypatch, params)
    assert expected[0]["groups"] == []
    assert _pages(client, params) == expected


@pytest.mark.parametrize("filtered", [False, True])
def test_io_submission_candidates_preserve_filters_reference_precedence_and_deleted_items(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    monkeypatch: pytest.MonkeyPatch, filtered: bool,
) -> None:
    """Batch envelopes contain the original filtered population, including deleted items."""
    item, sibling = make_item(name="batch candidate"), make_item(name="deleted sibling")
    sibling.deleted_at = BASE
    for index in range(8):
        batch = _add_batch(db_session, f"candidate-batch-{index}")
        batch.submitted_at = BASE + timedelta(seconds=index)
        for target in (item, sibling):
            _add_log(db_session, target, created_at=BASE - timedelta(days=index),
                     operation_batch_id=batch.batch_id, reference_no="shared-ref")
    db_session.commit()
    params = {"limit": 1, **({"item_id": str(item.item_id)} if filtered else {})}
    expected = _full_pages(client, monkeypatch, params)
    reads = _metadata_reads(monkeypatch)
    assert _pages(client, params) == expected
    assert max(reads) <= (2 if filtered else 4)


@pytest.mark.parametrize("raw_style", ["hyphen", "uppercase"])
def test_noncanonical_submission_identity_keeps_full_connected_fallback(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    monkeypatch: pytest.MonkeyPatch, raw_style: str,
) -> None:
    """Equivalent UUID spellings must still form one Python bucket, including raw aliases."""
    item = make_item(name="raw submission identity")
    submission = UUID("abcdef12-3456-7890-abcd-ef1234567890")
    logs = [_add_log(db_session, item, created_at=BASE + timedelta(seconds=index)) for index in range(6)]
    for log in logs:
        log.submission_id = submission
    db_session.flush()
    raw_id = str(submission) if raw_style == "hyphen" else submission.hex.upper()
    db_session.connection().exec_driver_sql(
        "UPDATE transaction_logs SET submission_id=? WHERE log_id=?", (raw_id, logs[0].log_id.hex),
    )
    db_session.commit()
    expected = _full_pages(client, monkeypatch, {"limit": 1})
    reads = _metadata_reads(monkeypatch)
    assert _pages(client, {"limit": 1}) == expected
    assert reads[0] == len(logs)


def test_operation_reversal_or_query_alias_disables_submission_limiting(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The old OR lookup can hydrate a noncanonical PK through its reverse relationship."""
    item = make_item(name="operation alias")
    original = InventoryOperation(kind="BUSINESS", domain="inventory", action="receive",
                                  display_label="receive", actor_name="actor", effective_at=BASE)
    db_session.add(original)
    db_session.flush()
    for index in range(8):
        log = _add_log(db_session, item, created_at=BASE + timedelta(seconds=index))
        log.submission_id = uuid4()
        if index == 0:
            log.operation_id = original.operation_id
    db_session.flush()
    db_session.connection().exec_driver_sql(
        "INSERT INTO inventory_operations (operation_id,kind,domain,action,display_label,actor_name,effective_at,reverses_operation_id) "
        "VALUES (?,'CANCELLATION','inventory','cancel','alias','actor',?,?)",
        (str(original.operation_id), BASE.isoformat(" "), original.operation_id.hex),
    )
    db_session.commit()
    expected = _full_pages(client, monkeypatch, {"limit": 1})
    reads = _metadata_reads(monkeypatch)
    assert _pages(client, {"limit": 1}) == expected
    assert reads[0] == 8


def test_submission_limiting_keeps_one_metadata_select(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
) -> None:
    """Candidate anchors, expansion, unsafe fallback and independent rows share one statement."""
    item = make_item(name="submission snapshot")
    for index in range(8):
        submission = uuid4()
        for sibling in range(2):
            log = _add_log(db_session, item, created_at=BASE + timedelta(seconds=index - sibling))
            log.submission_id = submission
    db_session.commit()
    statements: list[str] = []

    def capture(_connection: Any, _cursor: Any, statement: str, _parameters: Any,
                _context: Any, _executemany: bool) -> None:
        if " AS request_order_at" in statement and "reason_category" in statement:
            statements.append(statement)

    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", capture)
    try:
        response = client.get(URL, params={"limit": 1})
    finally:
        event.remove(connection, "before_cursor_execute", capture)
    assert response.status_code == 200, response.text
    assert len(statements) == 1
    assert "UNION ALL" in statements[0] and "LIMIT" in statements[0]


def _submission_metadata_query(db_session: Session) -> Query:
    """The public loader's exact typed metadata columns, without unrelated detail queries."""
    return db_session.query(
        TransactionLog.log_id, TransactionLog.item_id, TransactionLog.transaction_type,
        TransactionLog.quantity_change, TransactionLog.created_at, TransactionLog.operation_id,
        TransactionLog.operation_batch_id, TransactionLog.submission_id, TransactionLog.reverses_log_id,
        TransactionLog.reference_no, TransactionLog.shipping_phase, TransactionLog.produced_by,
        TransactionLog.department, TransactionLog.reason_category, TransactionLog.reason_memo,
        TransactionLog.created_at.label("request_order_at"),
    )


def test_submission_lifecycle_keeps_all_cursor_pages_without_search(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """제출 안의 불량 짝은 전부 읽으면서 앞뒤의 정상 제출 후보만 제한한다."""
    item = make_item(name="submission lifecycle boundary")
    for seconds in (0, 1, 2, 5, 6, 7):
        log = _add_log(db_session, item, created_at=BASE + timedelta(seconds=seconds))
        log.submission_id = uuid4()
    lifecycle_submission = uuid4()
    fields = dict(produced_by="actor", department="조립", reason_category="damage", reason_memo="same")
    parent = _add_log(db_session, item, created_at=BASE + timedelta(seconds=3),
                      transaction_type=TransactionTypeEnum.MARK_DEFECTIVE, **fields)
    child = _add_log(db_session, item, created_at=BASE + timedelta(seconds=4),
                     transaction_type=TransactionTypeEnum.DEFECT_SCRAP, **fields)
    parent.submission_id = child.submission_id = lifecycle_submission
    db_session.commit()
    expected = _full_pages(client, monkeypatch, {"limit": 1})
    reads = _metadata_reads(monkeypatch)
    actual = _pages(client, {"limit": 1})
    assert actual == expected
    groups = [group for page in actual for group in page["groups"]]
    assert len(groups) == 7
    lifecycle = next(group for group in groups if group["type"] == "defect_lifecycle")
    assert [log["log_id"] for log in lifecycle["logs"]] == [str(parent.log_id), str(child.log_id)]
    assert all(page["has_more"] for page in actual[:-1])
    assert actual[-1]["has_more"] is False
    assert max(reads) <= 4  # Full lifecycle pair plus limit+1 complete normal submissions.


@pytest.mark.parametrize("boundary", [sqlite3.SQLITE_LIMIT_COLUMN, sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER])
def test_submission_transport_preserves_original_sqlite_connection_limits(
    db_session: Session, make_item: Callable[..., Item], boundary: int,
) -> None:
    """A valid 16-column / one-bind old query must not gain a new SQLite limit error."""
    item = make_item(name="metadata limits")
    log = _add_log(db_session, item, created_at=BASE)
    log.submission_id = uuid4()
    db_session.flush()
    query = _submission_metadata_query(db_session).filter(TransactionLog.quantity_change >= 1)
    raw = db_session.connection().connection.driver_connection
    original_limit = raw.getlimit(boundary)
    try:
        raw.setlimit(boundary, 16 if boundary == sqlite3.SQLITE_LIMIT_COLUMN else 1)
        expected = db_session.execute(query.statement).all()
        assert db_session.execute(transactions._bounded_submission_metadata(query, db_session, 1, None)).all() == expected
    finally:
        raw.setlimit(boundary, original_limit)


def test_submission_cursor_preserves_datetime_result_normalization(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """ISO-T raw dates are readable by the old processor but unsafe for SQL cursor literals."""
    item = make_item(name="date alias envelope")
    logs = [_add_log(db_session, item, created_at=BASE + timedelta(seconds=index)) for index in range(8)]
    for log in logs:
        log.submission_id = uuid4()
    db_session.commit()
    cursor = client.get(URL, params={"limit": 1}).json()["next_cursor"]
    db_session.connection().exec_driver_sql(
        "UPDATE transaction_logs SET created_at=? WHERE log_id=?", (BASE.isoformat(), logs[0].log_id.hex),
    )
    params = {"limit": 1, "cursor": cursor}
    expected = _full_pages(client, monkeypatch, params)
    assert _pages(client, params) == expected


@pytest.mark.parametrize("dialect_name,version", [
    ("postgresql", (16, 0)), ("sqlite", (3, 24, 0)), ("sqlite", (3, 34, 0)),
])
def test_submission_candidates_preserve_non_supported_dialect_statement(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, dialect_name: str, version: tuple[int, ...],
) -> None:
    """PG and pre-materialization SQLite retain the query; compilation is not PG execution."""
    query = _submission_metadata_query(db_session)
    dialect = db_session.get_bind().dialect
    with monkeypatch.context() as patch:
        patch.setattr(dialect, "name", dialect_name)
        patch.setattr(dialect, "server_version_info", version)
        statement = transactions._bounded_submission_metadata(query, db_session, 1, None)
    postgres_sql = str(statement.compile(dialect=postgresql.dialect()))
    assert "display_envelopes" not in postgres_sql
    assert "GLOB" not in postgres_sql and "typeof" not in postgres_sql and "OVER" not in postgres_sql
    assert postgres_sql == str(query.statement.compile(dialect=postgresql.dialect()))


def test_submission_materialization_length_limit_keeps_original_page(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An off-page old row that fits SQLite's old record must survive added CTE fields."""
    item = make_item(name="materialization limit")
    old = _add_log(db_session, item, created_at=BASE, reason_memo="x" * 399790)
    newest = _add_log(db_session, item, created_at=BASE + timedelta(seconds=10))
    old.submission_id, newest.submission_id = uuid4(), uuid4()
    db_session.commit()
    raw = db_session.connection().connection.driver_connection
    previous_limit = raw.getlimit(sqlite3.SQLITE_LIMIT_LENGTH)
    try:
        raw.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 400000)
        with monkeypatch.context() as patch:
            patch.setattr(transactions, "_bounded_submission_metadata", lambda query, *_args: query.statement)
            oracle = client.get(URL, params={"limit": 1})
        assert oracle.status_code == 200, oracle.text
        actual = client.get(URL, params={"limit": 1})
        assert actual.status_code == 200, actual.text
        assert actual.json() == oracle.json()
    finally:
        raw.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, previous_limit)


def test_submission_request_date_is_evaluated_once_per_source_row(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Guard and candidate selection must reuse derived dates without changing the full page."""
    item = make_item(name="derived request date")
    source_count = 30
    for index in range(source_count):
        log = _add_log(db_session, item, created_at=BASE + timedelta(seconds=index))
        log.submission_id = UUID(int=(0xABCDEF << 64) + index // 5 + 1)
    db_session.commit()
    expected = _full_pages(client, monkeypatch, {"limit": 2})[0]
    calls = 0

    def count_request_date(value: str | None) -> str | None:
        """Observe SQL work while returning precisely the original stored date value."""
        nonlocal calls
        calls += 1
        return value

    original = transactions._history_request_date_expr
    raw = db_session.connection().connection.driver_connection
    raw.create_function("count_request_date", 1, count_request_date)
    monkeypatch.setattr(transactions, "_history_request_date_expr", lambda: func.count_request_date(original(), type_=DateTime()))
    try:
        response = client.get(URL, params={"limit": 2})
    finally:
        raw.create_function("count_request_date", 1, None)
    assert response.status_code == 200, response.text
    assert response.json() == expected
    assert source_count <= calls <= 2 * source_count, f"Derived source dates were evaluated {calls} times for {source_count} rows"


def test_submission_guard_preserves_lowered_function_argument_limit(
    db_session: Session, make_item: Callable[..., Item],
) -> None:
    """An old projection needing no functions must survive limits below canonical date checks."""
    item = make_item(name="metadata function limit")
    log = _add_log(db_session, item, created_at=BASE)
    log.submission_id = uuid4()
    db_session.flush()
    query = _submission_metadata_query(db_session)
    raw = db_session.connection().connection.driver_connection
    previous_limit = raw.getlimit(sqlite3.SQLITE_LIMIT_FUNCTION_ARG)
    try:
        raw.setlimit(sqlite3.SQLITE_LIMIT_FUNCTION_ARG, 2)
        expected = db_session.execute(query.statement).all()
        actual = db_session.execute(transactions._bounded_submission_metadata(query, db_session, 1, None)).all()
        assert actual == expected
    finally:
        raw.setlimit(sqlite3.SQLITE_LIMIT_FUNCTION_ARG, previous_limit)


@pytest.mark.parametrize("with_cursor", [False, True])
def test_submission_candidates_fit_supported_column_and_variable_limits(
    db_session: Session, make_item: Callable[..., Item], with_cursor: bool,
) -> None:
    """Candidate summaries and typed cursor literals must fit the old one-bind budget."""
    item = make_item(name="supported metadata limits")
    for index in range(6):
        log = _add_log(db_session, item, created_at=BASE + timedelta(seconds=index))
        log.submission_id = uuid4()
    db_session.flush()
    query = _submission_metadata_query(db_session).filter(TransactionLog.quantity_change >= 1)
    cursor = (BASE + timedelta(seconds=4), BASE + timedelta(seconds=4), UUID(int=(1 << 128) - 1)) if with_cursor else None
    expected = db_session.execute(query.statement).all()
    expected = [row for row in expected if cursor is None or (row.request_order_at, row.created_at, row.log_id) < cursor]
    expected.sort(key=lambda row: (row.request_order_at, row.created_at, row.log_id), reverse=True)
    raw = db_session.connection().connection.driver_connection
    limits = {boundary: raw.getlimit(boundary) for boundary in
              (sqlite3.SQLITE_LIMIT_COLUMN, sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER, sqlite3.SQLITE_LIMIT_FUNCTION_ARG)}
    try:
        raw.setlimit(sqlite3.SQLITE_LIMIT_COLUMN, 19)
        raw.setlimit(sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER, 1)
        raw.setlimit(sqlite3.SQLITE_LIMIT_FUNCTION_ARG, 3)
        actual = db_session.execute(transactions._bounded_submission_metadata(query, db_session, 1, cursor)).all()
        actual.sort(key=lambda row: (row.request_order_at, row.created_at, row.log_id), reverse=True)
        assert [tuple(row) for row in actual] == [tuple(row) for row in expected[:2]]
    finally:
        for boundary, previous_limit in limits.items():
            raw.setlimit(boundary, previous_limit)


@pytest.mark.parametrize("cursor", [
    None, (datetime.min, datetime.min, UUID(int=0)),
    (datetime.max, datetime.max, UUID(int=(1 << 128) - 1)),
    (BASE, BASE, UUID(int=0)), (BASE, BASE, UUID(int=(1 << 128) - 1)),
])
def test_submission_anchor_matches_typed_tuple_at_cursor_extremes(
    db_session: Session, make_item: Callable[..., Item],
    cursor: tuple[datetime, datetime, UUID] | None,
) -> None:
    """Compare original typed tuples, retaining whole siblings and identical sixteen fields."""
    item = make_item(name="anchor extremes")
    for index in range(6):
        for sibling in range(2):
            log = _add_log(db_session, item, created_at=BASE + timedelta(seconds=index % 3))
            log.log_id = UUID(int=(0xABCDEF << 64) + index * 2 + sibling + 1)
            log.submission_id = UUID(int=(0xFEDCBA << 64) + index + 1)
            log.reference_no = ("minimum", "maximum", "middle")[index % 3]
    db_session.flush()
    query = _submission_metadata_query(db_session)
    date_expression = case(
        (TransactionLog.reference_no == "minimum", literal(datetime.min, type_=DateTime())),
        (TransactionLog.reference_no == "maximum", literal(datetime.max, type_=DateTime())),
        else_=TransactionLog.created_at,
    )
    columns = [description["expr"] for description in query.column_descriptions]
    query = query.with_entities(*columns[:-1], date_expression.label("request_order_at"))
    expected = db_session.execute(query.statement).all()
    buckets: dict[UUID, list[Any]] = {}
    for row in expected:
        buckets.setdefault(row.submission_id, []).append(row)
    anchors = {key: max((row.request_order_at, row.created_at, row.log_id) for row in rows)
               for key, rows in buckets.items()}
    candidates = sorted((key for key in buckets if cursor is None or anchors[key] < cursor),
                        key=lambda key: anchors[key], reverse=True)[:3]
    expected = [row for row in expected if row.submission_id in candidates]
    statement = transactions._bounded_submission_metadata(query, db_session, 2, cursor)
    metadata = statement.subquery()
    order = (metadata.c.request_order_at.desc(), metadata.c.created_at.desc(), metadata.c.log_id.desc())
    actual = db_session.query(*metadata.c).order_by(*order).all()
    expected.sort(key=lambda row: (row.request_order_at, row.created_at, row.log_id), reverse=True)
    assert [tuple(row) for row in actual] == [tuple(row) for row in expected]
    assert [[type(value) for value in row] for row in actual] == [[type(value) for value in row] for row in expected]


@pytest.mark.parametrize("unsafe_alias", [False, True])
def test_submission_public_metadata_order_preserves_tied_lifecycle_and_aliases(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    monkeypatch: pytest.MonkeyPatch, unsafe_alias: bool,
) -> None:
    """The public UNION's explicit order, not CTE iteration order, feeds greedy grouping."""
    item = make_item(name="metadata order")
    logs = []
    for index in range(6):
        log = _add_log(db_session, item, created_at=BASE)
        log.log_id = UUID(int=(0xABCD << 64) + index + 1)
        log.submission_id = UUID(int=(0xFEDCBA << 64) + index // 2 + 1)
        logs.append(log)
    fields = dict(produced_by="actor", department="assembly", reason_category="damage", reason_memo="same")
    parent = _add_log(db_session, item, created_at=BASE, transaction_type=TransactionTypeEnum.MARK_DEFECTIVE, **fields)
    child = _add_log(db_session, item, created_at=BASE, transaction_type=TransactionTypeEnum.DEFECT_SCRAP, **fields)
    parent.log_id, child.log_id = UUID(int=(0xFFFF << 64) + 2), UUID(int=(0xFFFF << 64) + 1)
    db_session.flush()
    if unsafe_alias:
        db_session.connection().exec_driver_sql(
            "UPDATE transaction_logs SET submission_id=? WHERE log_id=?",
            (logs[0].submission_id.hex.upper(), logs[0].log_id.hex),
        )
    db_session.commit()
    captured: list[list[Any]] = []
    original = Query.all

    def capture(query: Query) -> list[Any]:
        """Observe all processed metadata values in their actual public consumer order."""
        rows = original(query)
        names = {description["name"] for description in query.column_descriptions}
        if {"request_order_at", "reason_category", "log_id"} <= names:
            captured.append([(tuple(row), tuple(type(value) for value in row)) for row in rows])
        return rows

    monkeypatch.setattr(Query, "all", capture)
    with monkeypatch.context() as patch:
        patch.setattr(transactions, "_bounded_submission_metadata", lambda query, *_args: query.statement)
        expected = client.get(URL, params={"limit": 50})
    actual = client.get(URL, params={"limit": 50})
    assert expected.status_code == actual.status_code == 200
    assert actual.json() == expected.json()
    assert len(captured) == 2
    assert captured[0] == captured[1]
