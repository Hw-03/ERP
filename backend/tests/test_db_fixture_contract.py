"""DB test fixture transaction-isolation contracts."""

from __future__ import annotations

from contextlib import AbstractContextManager
from typing import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Item, ProcessType, ProductSymbol


def test_direct_commit_keeps_fixture_outer_transaction_active(db_session: Session) -> None:
    """Application commits must release only a SAVEPOINT, not the test boundary."""
    connection = db_session.connection()
    assert connection.in_transaction()
    assert connection.in_nested_transaction()

    item = Item(
        item_name="fixture direct commit",
        unit="EA",
        model_symbol="9",
        process_type_code="TR",
        serial_no=9101,
    )
    db_session.add(item)
    db_session.commit()

    assert connection.in_transaction()
    assert not connection.in_nested_transaction()
    assert db_session.query(Item).filter_by(item_name="fixture direct commit").one()
    assert connection.in_nested_transaction()


def test_direct_rollback_preserves_outer_transaction_and_session_use(
    db_session: Session,
) -> None:
    """Application rollback must discard its SAVEPOINT while leaving the test usable."""
    connection = db_session.connection()
    rolled_back = Item(
        item_name="fixture direct rollback",
        unit="EA",
        model_symbol="9",
        process_type_code="TR",
        serial_no=9102,
    )
    db_session.add(rolled_back)
    db_session.flush()

    db_session.rollback()

    assert connection.in_transaction()
    assert db_session.query(Item).filter_by(item_name="fixture direct rollback").count() == 0

    survivor = Item(
        item_name="fixture usable after rollback",
        unit="EA",
        model_symbol="9",
        process_type_code="TR",
        serial_no=9103,
    )
    db_session.add(survivor)
    db_session.commit()
    assert db_session.query(Item).filter_by(item_name=survivor.item_name).one()


def test_foreign_keys_are_enforced_inside_fixture(db_session: Session) -> None:
    """The worker connection must retain SQLite FK enforcement."""
    invalid_item = Item(
        item_name="fixture invalid FK",
        unit="EA",
        model_symbol="9",
        process_type_code="ZZ",
        serial_no=9104,
    )
    db_session.add(invalid_item)

    with pytest.raises(IntegrityError):
        db_session.flush()

    db_session.rollback()
    assert db_session.connection().in_transaction()


def test_sqlite_stored_column_generates_mes_code(db_session: Session) -> None:
    """Fixture schema must use the real Item generated-column expression."""
    item = Item(
        item_name="fixture generated MES code",
        unit="EA",
        model_symbol="9",
        process_type_code="TR",
        serial_no=42,
    )
    db_session.add(item)
    db_session.flush()
    db_session.refresh(item)

    assert item.mes_code == "9-TR-0042"


def test_fastapi_request_commit_remains_visible_inside_test(
    client: TestClient,
    db_session: Session,
) -> None:
    """The real item-create endpoint may commit without escaping the test boundary."""
    symbol = ProductSymbol(
        slot=1,
        symbol="9",
        model_name="fixture model",
        is_finished_good=False,
        is_reserved=False,
    )
    db_session.add(symbol)
    db_session.commit()
    from app.utils.mes_code import refresh_symbol_cache

    refresh_symbol_cache(db_session)
    connection = db_session.connection()

    response = client.post(
        "/api/items",
        headers={"X-Admin-Pin": "0000"},
        json={
            "item_name": "fixture API commit",
            "process_type_code": "TR",
            "model_slots": [1],
            "initial_quantity": 0,
        },
    )

    assert response.status_code == 201, response.text
    assert connection.in_transaction()
    assert db_session.query(Item).filter_by(item_name="fixture API commit").one()


def test_outer_rollback_prevents_committed_data_leaking_to_next_session(
    _isolated_db_session_factory: Callable[[], AbstractContextManager[Session]],
) -> None:
    """Two scopes on one worker engine prove rollback without test-order dependence."""
    with _isolated_db_session_factory() as first_session:
        worker_engine = first_session.get_bind().engine
        leaked_candidate = Item(
            item_name="fixture leak sentinel",
            unit="EA",
            model_symbol="9",
            process_type_code="TR",
            serial_no=9105,
        )
        first_session.add(leaked_candidate)
        first_session.commit()
        assert first_session.query(Item).filter_by(item_name=leaked_candidate.item_name).one()

    with _isolated_db_session_factory() as second_session:
        assert second_session.get_bind().engine is worker_engine
        assert second_session.query(ProcessType).count() == 18
        assert second_session.query(Item).filter_by(item_name="fixture leak sentinel").count() == 0


def test_cleanup_failure_does_not_leak_the_worker_connection(
    _isolated_db_session_factory: Callable[[], AbstractContextManager[Session]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Later cleanup steps still run when Session.close itself raises."""
    original_close = Session.close

    def close_then_fail(session: Session) -> None:
        original_close(session)
        raise RuntimeError("injected close failure")

    with monkeypatch.context() as cleanup_patch:
        cleanup_patch.setattr(Session, "close", close_then_fail)
        with pytest.raises(RuntimeError, match="injected close failure"):
            with _isolated_db_session_factory():
                pass

    with _isolated_db_session_factory() as recovered_session:
        assert recovered_session.query(ProcessType).count() == 18
