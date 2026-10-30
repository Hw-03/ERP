"""Cost schema upgrades preserve the memo-era database's existing column values."""

from datetime import date
from pathlib import Path
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from app.models import DailyWorkReport, Employee, Inventory, PersonalMemo, SystemSetting, TransactionLog
from bootstrap.legacy_profiles import sqlite_schema_fingerprint
from bootstrap.schema import check_schema, ensure_schema


PREVIOUS = "20261029_0051"
HEAD = "20261029_0054"
COST_REVISIONS = ("20261029_0052", "20261029_0053", HEAD)
HOURLY_RATE_KEY = "cost.standard_hourly_labor_rate"


def _config(path: Path) -> Config:
    """Bind migrations to the disposable fixture rather than the application DB."""
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def _existing_columns(connection: sa.Connection) -> dict[str, tuple[str, ...]]:
    """Capture generated columns too, while allowing schema bookkeeping to advance."""
    inspector = sa.inspect(connection)
    return {
        table: tuple(column["name"] for column in inspector.get_columns(table))
        for table in inspector.get_table_names()
        if table not in {"alembic_version", "alembic_schema_state"}
    }


def _project_rows(
    connection: sa.Connection, columns: dict[str, tuple[str, ...]],
) -> dict[str, list[tuple]]:
    """Compare the old projection so additive columns cannot hide a changed old value."""
    quote = connection.dialect.identifier_preparer.quote
    return {
        table: sorted(
            (tuple(row) for row in connection.exec_driver_sql(
                f"SELECT {', '.join(quote(column) for column in names)} FROM {quote(table)}"
            )),
            key=repr,
        )
        for table, names in columns.items()
    }


@pytest.mark.parametrize("profile", ["canonical", "employee_legacy_20260720"])
def test_memo_head_to_cost_head_preserves_all_existing_values(tmp_path: Path, profile: str) -> None:
    config = _config(tmp_path / "main-integration.db")
    scripts = ScriptDirectory.from_config(config)
    assert scripts.get_heads() == [HEAD]
    assert tuple(revision.revision for revision in scripts.iterate_revisions(HEAD, PREVIOUS)) == tuple(reversed(COST_REVISIONS))
    for revision in COST_REVISIONS:
        assert scripts.get_revision(revision).module.EMPLOYEE_AUTO_DEPLOY_POLICY == {"kind": "schema-only"}

    command.upgrade(config, PREVIOUS)
    engine = sa.create_engine(config.get_main_option("sqlalchemy.url"))
    try:
        with engine.begin() as connection:
            employee_id, item_id = uuid4(), uuid4()
            connection.execute(sa.insert(Employee), {
                "employee_id": employee_id, "employee_code": "KEEP", "name": "Existing",
                "role": "staff", "department": "Assembly", "is_active": True,
                "pin_hash": "existing-private-hash", "pin_version": 7,
                "warehouse_role": "deputy", "department_role": "primary",
            })
            connection.exec_driver_sql("INSERT INTO process_types (code,prefix,suffix,stage_order) VALUES ('TR','T','R',10)")
            connection.exec_driver_sql(
                "INSERT INTO items (item_id,item_name,unit,model_symbol,process_type_code,serial_no,standard_purchase_price,purchase_price_effective_date) VALUES (?, 'Existing', 'EA', '4', 'TR', 1, 123.45, '2026-10-01')",
                (item_id.hex,),
            )
            connection.execute(sa.insert(Inventory), {"inventory_id": uuid4(), "item_id": item_id, "quantity": 9, "warehouse_qty": 9})
            connection.execute(sa.insert(TransactionLog), {"log_id": uuid4(), "item_id": item_id, "transaction_type": "RECEIVE", "quantity_change": 9, "quantity_before": 0, "quantity_after": 9})
            connection.execute(sa.insert(PersonalMemo), {"employee_id": employee_id, "content": "Keep private memo"})
            connection.execute(sa.insert(DailyWorkReport), {"work_date": date(2026, 10, 1), "employee_id": employee_id, "employee_name": "Existing", "department": "Assembly", "content": "Keep historical work"})
            connection.execute(sa.insert(SystemSetting), {"setting_key": "existing.setting", "setting_value": "keep"})
            connection.exec_driver_sql(
                "INSERT INTO alembic_schema_state (id,profile_id,revision,schema_fingerprint) VALUES (1,?,?,?)",
                (profile, PREVIOUS, sqlite_schema_fingerprint(connection)),
            )
            columns = _existing_columns(connection)
            before = _project_rows(connection, columns)
            rootpage = connection.exec_driver_sql("SELECT rootpage FROM sqlite_master WHERE name='items'").scalar_one()

        result = ensure_schema(engine=engine)
        assert result.revision == HEAD and result.profile_id == profile
        assert check_schema(engine=engine).ready
        with engine.connect() as connection:
            assert _project_rows(connection, columns) == before
            assert _existing_columns(connection).keys() == columns.keys()
            assert connection.exec_driver_sql("SELECT rootpage FROM sqlite_master WHERE name='items'").scalar_one() == rootpage
            assert connection.exec_driver_sql("SELECT standard_work_minutes,standard_yield_percent,purchase_currency,foreign_purchase_price,purchase_exchange_rate FROM items").one() == (None, None, "KRW", None, None)
            assert connection.exec_driver_sql("SELECT COUNT(*) FROM system_settings WHERE setting_key=?", (HOURLY_RATE_KEY,)).scalar_one() == 0
            assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
        assert ensure_schema(engine=engine).changed is False
        with engine.connect() as connection:
            assert _project_rows(connection, columns) == before
    finally:
        engine.dispose()
