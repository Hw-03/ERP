"""PostgreSQL evidence for the inventory cutover writer-exclusion contract."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool


ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ops.inventory_cutover import _acquire_cutover_write_lock  # noqa: E402


TEST_POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL")


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 없어 cutover PostgreSQL 잠금 검증을 건너뜁니다.",
)
def test_postgres_cutover_lock_blocks_shipping_writer_until_rollback() -> None:
    """The runtime cutover lock blocks RowExclusive writers on every evidence table."""
    assert os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK") == "ALLOW_TEST_DB_MUTATION"
    database_name = make_url(TEST_POSTGRES_URL).database
    assert database_name and (database_name.startswith("test_") or database_name.endswith("_test"))
    engine = create_engine(TEST_POSTGRES_URL, poolclass=NullPool)
    cutover_session = Session(engine)
    writer_session = Session(engine)
    try:
        assert cutover_session.execute(text("SELECT pg_backend_pid()"),).scalar_one() != writer_session.execute(
            text("SELECT pg_backend_pid()")
        ).scalar_one()
        cutover_session.rollback()
        writer_session.rollback()

        _acquire_cutover_write_lock(cutover_session)
        for table_name in ("shipping_requests", "shipping_allocations", "transaction_logs"):
            writer_session.execute(text("SET LOCAL lock_timeout = '100ms'"))
            with pytest.raises(OperationalError):
                writer_session.execute(text(f"LOCK TABLE {table_name} IN ROW EXCLUSIVE MODE"))
            writer_session.rollback()

        cutover_session.rollback()
        writer_session.execute(text("SET LOCAL lock_timeout = '1s'"))
        writer_session.execute(
            text(
                "LOCK TABLE shipping_requests, shipping_allocations, transaction_logs "
                "IN ROW EXCLUSIVE MODE"
            )
        )
        writer_session.rollback()
    finally:
        writer_session.rollback()
        cutover_session.rollback()
        writer_session.close()
        cutover_session.close()
        engine.dispose()
