"""Full integrity keeps every transaction while avoiding unused ORM payloads."""

from dataclasses import asdict
from datetime import datetime
from decimal import Decimal

import pytest
from sqlalchemy import event, literal, select
from sqlalchemy.orm import Query, Session

from app.models import DepartmentEnum, InventoryOperation, InventoryOperationKindEnum, Item, LocationStatusEnum, TransactionLog, TransactionTypeEnum
from app.services import inventory_integrity as integrity
from app.services.inventory_integrity import _collect_integrity_snapshot, diagnose_inventory_integrity


def test_full_snapshot_projects_required_evidence_without_filtering(db_session: Session, make_item, make_location, monkeypatch) -> None:
    item = make_item()
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY,
                  status=LocationStatusEnum.DEFECTIVE, quantity=Decimal(3))
    operation = InventoryOperation(kind=InventoryOperationKindEnum.BUSINESS, domain="inventory",
                                   action="receive", display_label="Snapshot", actor_name="Tester")
    db_session.add(operation)
    db_session.flush()
    logs = [
        TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
                       quantity_change=3, operation_id=operation.operation_id,
                       reference_no="evidence", notes="preserve all evidence",
                       inventory_effect=[{"scope": "warehouse", "delta": 3}]),
        TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.ADJUST,
                       quantity_change=-1, inventory_effect=None, cancelled=True,
                       archived_at=datetime(2026, 10, 1)),
    ]
    db_session.add_all(logs)
    db_session.flush()
    expected = {str(log.log_id): {
        "log_id": str(log.log_id), "item_id": str(log.item_id),
        "operation_id": str(log.operation_id) if log.operation_id else None,
        "created_at": log.created_at, "transaction_type": log.transaction_type.value,
        "operation_role": log.operation_role.value if log.operation_role else None,
        "quantity_change": Decimal(str(log.quantity_change)), "reference_no": log.reference_no,
        "notes": log.notes, "inventory_effect": log.inventory_effect,
    } for log in logs}
    queries = []

    def capture(_connection, _cursor, statement, parameters, _context, _many) -> None:
        if "FROM transaction_logs" in statement:
            queries.append((statement, parameters))

    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", capture)
    try:
        snapshot = _collect_integrity_snapshot(db_session)
    finally:
        event.remove(connection, "before_cursor_execute", capture)
    assert {row.log_id: asdict(row) for row in snapshot.transactions} == expected
    assert len(queries) == 1
    with connection.exec_driver_sql(*queries[0]) as result:
        width = len(result.keys())
        count = len(result.all())
    assert width == 10
    assert count == len(logs)
    projected = diagnose_inventory_integrity(db_session, sample_limit=None).model_dump(exclude={"generated_at"})
    execute = db_session.execute
    full_orm_scans = []

    def full_orm_execute(statement, *args, **kwargs):
        columns = list(statement.selected_columns)
        if len(columns) == 10 and columns[0] is TransactionLog.__table__.c.log_id:
            full_orm_scans.append(True)
            return execute(select(TransactionLog), *args, **kwargs).scalars()
        return execute(statement, *args, **kwargs)

    monkeypatch.setattr(db_session, "execute", full_orm_execute)
    original = diagnose_inventory_integrity(db_session, sample_limit=None).model_dump(exclude={"generated_at"})
    assert projected == original
    assert full_orm_scans == [True]
    assert projected["issue_count"] > 0


@pytest.mark.parametrize("has_cutover", [False, True])
def test_weekly_scope_filters_before_hydration_and_preserves_full_findings(db_session: Session, make_item, monkeypatch, has_cutover: bool) -> None:
    """Non-finished logs remain in full integrity, but never enter the weekly ORM scan."""
    cutoff = datetime(2026, 9, 1)
    monkeypatch.setattr(integrity, "cutover_at", lambda _db: cutoff if has_cutover else None)
    business = InventoryOperation(kind=InventoryOperationKindEnum.BUSINESS, domain="inventory",
                                  action="receive", display_label="Scope", actor_name="Tester")
    cancellation = InventoryOperation(kind=InventoryOperationKindEnum.CANCELLATION, domain="inventory",
                                      action="cancel", display_label="Scope", actor_name="Tester")
    db_session.add_all([business, cancellation])
    db_session.flush()
    cancellation.reverses_operation_id = business.operation_id
    eligible_ids, expected_issue_ids, all_ids = set(), set(), set()
    for code in [*integrity.FINISHED_CODES, "TR", "VA", "HA"]:
        item = make_item(process_type_code=code)
        for case in ["invalid", "valid", "missing", "cancellation", "before_cutover"]:
            log = TransactionLog(
                item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE, quantity_change=1,
                operation_id=None if case == "missing" else cancellation.operation_id if case == "cancellation" else business.operation_id,
                inventory_effect=[{"scope": "warehouse", "delta": 1 if case == "valid" else -1}],
                created_at=datetime(2026, 8, 31) if case == "before_cutover" else cutoff,
                archived_at=cutoff if case == "invalid" else None,
                cancelled=case == "invalid",
            )
            db_session.add(log)
            db_session.flush()
            all_ids.add(str(log.log_id))
            if code in integrity.FINISHED_CODES and (not has_cutover or case != "before_cutover"):
                eligible_ids.add(str(log.log_id))
                if case in {"invalid", "before_cutover"} or (case == "missing" and has_cutover):
                    expected_issue_ids.add(str(log.log_id))
    db_session.expunge_all()
    loaded = set()

    def capture(log, _context) -> None:
        loaded.add(str(log.log_id))

    event.listen(TransactionLog, "load", capture)
    try:
        issues = integrity._weekly_unclassified_issues(db_session)
    finally:
        event.remove(TransactionLog, "load", capture)
    assert {issue.cause_ids[-1] for issue in issues} == expected_issue_ids
    assert loaded == eligible_ids
    assert {row.log_id for row in _collect_integrity_snapshot(db_session).transactions} == all_ids
    optimized = diagnose_inventory_integrity(db_session, sample_limit=None).model_dump(exclude={"generated_at"})
    original_filter = Query.filter
    original_all = Query.all
    legacy_scan_counts = []

    def unfiltered_weekly_scope(query, *criteria):
        retained = [criterion for criterion in criteria
                    if not (getattr(criterion, "left", None) is not None
                            and criterion.left.compare(Item.__table__.c.process_type_code))]
        return original_filter(query, *retained)

    def legacy_weekly_rows(query):
        rows = original_all(query)
        entities = [column["expr"] for column in query.column_descriptions]
        if len(entities) == 2 and entities[0] is TransactionLog and entities[1] is Item:
            legacy_scan_counts.append(len(rows))
            return [(log, item) for log, item in rows if item.process_type_code in integrity.FINISHED_CODES]
        return rows

    monkeypatch.setattr(Query, "filter", unfiltered_weekly_scope)
    monkeypatch.setattr(Query, "all", legacy_weekly_rows)
    legacy = diagnose_inventory_integrity(db_session, sample_limit=None).model_dump(exclude={"generated_at"})
    assert optimized == legacy
    assert legacy_scan_counts == [36 if has_cutover else 45]


@pytest.mark.parametrize("code", [None, "", "TR", "VA", "HA", "ZZ", "TF", "HF", "VF", "NF", "AF", "PF"])
def test_weekly_sql_scope_preserves_null_and_other_process_exclusion(db_session: Session, code: str | None) -> None:
    """SQL NULL is excluded like the legacy Python membership test."""
    included = db_session.scalar(select(literal(code).in_(integrity.FINISHED_CODES)))
    assert bool(included) == (code in integrity.FINISHED_CODES)
