"""제출 후보의 NULL·취소 의미를 유지하며 동일 kind 조회를 중복 평가하지 않는다."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models import InventoryOperation, Item, TransactionLog, TransactionTypeEnum
from app.routers.inventory import transactions
from tests.routers.test_transaction_display_groups_performance import _submission_metadata_query


def test_submission_kind_avoids_duplicate_evaluations_with_all_typed_metadata_preserved(
    db_session: Session, make_item: Callable[..., Item],
) -> None:
    """같은 시각의 1,306행·NULL 작업·취소 작업도 원래 16개 값과 순서를 보존한다."""
    item = make_item(name="kind evaluation")
    at = datetime(2026, 9, 2, 3, 0, 0, 123456)
    business, cancellation = [
        InventoryOperation(
            kind=kind, domain="inventory", action="receive", display_label="receive",
            actor_name="actor", effective_at=at,
        )
        for kind in ("BUSINESS", "CANCELLATION")
    ]
    db_session.add_all([business, cancellation])
    db_session.flush()
    logs = [
        TransactionLog(
            log_id=UUID(int=(0xABCD << 64) + index + 1), item_id=item.item_id,
            transaction_type=TransactionTypeEnum.RECEIVE, quantity_change=index + 1,
            operation_id=None if index % 3 == 0 else
            business.operation_id if index % 3 == 1 else cancellation.operation_id,
            submission_id=UUID(int=(0xBCDE << 64) + index % 4 + 1),
            created_at=at + timedelta(seconds=index // 2),
            reference_no=f"kind-{index}", produced_by="actor", department="조립",
            reason_category="metadata", reason_memo=f"memo-{index}",
        )
        for index in range(1306)
    ]
    db_session.add_all(logs)
    db_session.commit()
    query = _submission_metadata_query(db_session)
    expected = db_session.execute(query.statement).all()
    calls = 0

    def count_kind(value: str) -> str:
        """유효 작업 행의 원래 kind 값을 바꾸지 않고 실제 SQLite 평가를 센다."""
        nonlocal calls
        calls += 1
        return value

    def counted_sql(
        _connection: Any, _cursor: Any, statement: str, parameters: Any,
        _context: Any, _executemany: bool,
    ) -> tuple[str, Any]:
        """실제 원장의 kind scalar 읽기에 관측 함수만 감싼다."""
        return statement.replace(
            "SELECT inventory_operations.kind", "SELECT count_kind(inventory_operations.kind)",
        ), parameters

    connection = db_session.connection()
    raw = connection.connection.driver_connection
    raw.create_function("count_kind", 1, count_kind)
    event.listen(connection, "before_cursor_execute", counted_sql, retval=True)
    try:
        actual = db_session.execute(
            transactions._bounded_submission_metadata(query, db_session, 50, None),
        ).all()
    finally:
        event.remove(connection, "before_cursor_execute", counted_sql)
        raw.create_function("count_kind", 1, None)
    assert len(actual) == len(expected) == 1306
    assert [tuple(row) for row in actual] == [tuple(row) for row in expected]
    assert [[type(value) for value in row] for row in actual] == [
        [type(value) for value in row] for row in expected
    ]
    nonnull_operation_rows = sum(index % 3 != 0 for index in range(1306))
    # 기존 CTE 소비 단계의 재평가는 허용하되, NULL/비취소 조건의 이중 조회는 제한한다.
    assert calls <= 4 * nonnull_operation_rows, (
        f"동일 kind 중복 조회: {calls}회 / {nonnull_operation_rows}행"
    )
