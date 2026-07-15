"""Alembic schema diagnostics must fail closed and remain idempotent."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
import sqlalchemy as sa

import bootstrap
from app.models import StockRequestTypeEnum, TransactionTypeEnum
from bootstrap import migrate as migrate_module
from bootstrap.schema import SchemaMismatchError, SchemaState, ensure_schema


def test_postgresql_transaction_enum_baseline_matches_model():
    model_values = {member.value for member in TransactionTypeEnum}
    assert set(migrate_module._PG_TRANSACTION_TYPE_ENUM_VALUES) == model_values
    assert set(migrate_module._PG_TRANSACTION_TYPE_ENUM_ADDITIONS) == {
        "UNMARK_DEFECTIVE",
        "DEFECT_SCRAP",
        "INTERNAL_USE",
    }


def test_postgresql_stock_request_enum_baseline_includes_internal_use():
    assert set(migrate_module._PG_STOCK_REQUEST_TYPE_ENUM_ADDITIONS) == {
        StockRequestTypeEnum.INTERNAL_USE.name,
    }


def test_public_run_migrations_name_delegates_to_alembic(
    monkeypatch: pytest.MonkeyPatch,
):
    calls: list[str] = []
    expected = object()
    monkeypatch.setattr(
        bootstrap,
        "ensure_schema",
        lambda: calls.append("ensure") or expected,
    )

    assert bootstrap.run_migrations() is expected
    assert calls == ["ensure"]


def test_alembic_rerun_is_idempotent(tmp_path: Path):
    path = tmp_path / "rerun.db"
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        first = ensure_schema(engine=engine)
        second = ensure_schema(engine=engine)
    finally:
        engine.dispose()

    assert first.previous_state is SchemaState.EMPTY
    assert first.changed is True
    assert second.previous_state is SchemaState.VERSIONED
    assert second.changed is False
    assert first.revision == second.revision


def test_unversioned_schema_drift_is_not_silently_skipped(tmp_path: Path):
    path = tmp_path / "drift.db"
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        ensure_schema(engine=engine)
        with sqlite3.connect(path) as db:
            db.execute("DROP TABLE alembic_version")
            db.execute("DROP INDEX ix_items_sort_order")

        with pytest.raises(SchemaMismatchError, match="ix_items_sort_order"):
            ensure_schema(engine=engine)
    finally:
        engine.dispose()
