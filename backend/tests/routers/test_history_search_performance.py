"""Optional history evidence must not normalize absent values on every old row."""

from collections.abc import Generator

import pytest
from sqlalchemy import create_engine, null
from sqlalchemy.orm import Session

from app.models import Base, InventoryOperation, InventoryOperationKindEnum, IoBatch, Item, TransactionLog, TransactionTypeEnum
from app.routers.inventory._tx_filters import _history_search_filter


@pytest.fixture
def search_session() -> Generator[Session, None, None]:
    """Own the connection so replacing SQLite's function cannot leak to other tests."""
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as session:
            yield session
    finally:
        engine.dispose()


def _matching(session: Session, search: str) -> list[TransactionLog]:
    """Use the same joins and search predicate as the paginated history route."""
    return (session.query(TransactionLog).join(Item, TransactionLog.item_id == Item.item_id)
            .outerjoin(IoBatch, TransactionLog.operation_batch_id == IoBatch.batch_id)
            .filter(_history_search_filter(search)).all())


def _log(session: Session, snapshot: dict | None = None, operation: InventoryOperation | None = None) -> TransactionLog:
    item = Item(item_name="Current Master", unit="EA", model_symbol="9", serial_no=1, process_type_code="TR")
    session.add(item)
    session.flush()
    log = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
                         quantity_change=1, quantity_before=0, quantity_after=1,
                         item_snapshot=snapshot, operation_id=operation.operation_id if operation else None)
    session.add(log)
    session.flush()
    return log


def test_absent_optional_evidence_skips_its_normalization(search_session: Session) -> None:
    """A nonmatch must evaluate only the eight original searchable fields."""
    log = _log(search_session)
    search_session.query(TransactionLog).filter_by(log_id=log.log_id).update({"item_snapshot": null()})
    calls = []

    def counted_replace(value: str, old: str, new: str) -> str:
        calls.append(value)
        return value.replace(old, new)

    connection = search_session.connection().connection.driver_connection
    connection.create_function("replace", 3, counted_replace)
    assert _matching(search_session, "absent-match") == []
    assert len(calls) <= 8 * 9


@pytest.mark.parametrize("search", ["old-name", "O.L/D 007", "Current.Master", "Operation/Label"])
def test_guard_preserves_snapshot_current_master_and_operation_search(search_session: Session, search: str) -> None:
    operation = InventoryOperation(kind=InventoryOperationKindEnum.BUSINESS, domain="inventory",
                                   action="receive", display_label="Operation Label", actor_name="Tester")
    search_session.add(operation)
    search_session.flush()
    log = _log(search_session, {"item_name": "Old Name", "mes_code": "OLD-007"}, operation)
    assert [row.log_id for row in _matching(search_session, search)] == [log.log_id]


def test_separator_only_search_remains_unfiltered() -> None:
    assert _history_search_filter(" /-.\t ") is None
