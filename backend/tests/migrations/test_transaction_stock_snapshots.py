from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREVIOUS_REVISION = "20260824_0024"
MIGRATION_REVISION = "20260824_0025"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def test_transaction_stock_snapshot_migration_is_nullable_and_does_not_backfill(
    tmp_path: Path,
) -> None:
    path = tmp_path / "transaction-stock-snapshots.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)

    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) "
            "VALUES ('TR', 'T', 'R', 1)"
        )
        db.execute(
            "INSERT INTO items "
            "(item_id, item_name, unit, model_symbol, process_type_code, serial_no) "
            "VALUES ('legacy-item', '기존 품목', 'EA', '9', 'TR', 1)"
        )
        db.execute(
            "INSERT INTO transaction_logs "
            "(log_id, item_id, transaction_type, quantity_change, "
            "warehouse_qty_before, warehouse_qty_after) "
            "VALUES ('legacy-log', 'legacy-item', 'RECEIVE', 4, 6, 10)"
        )

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        columns = {
            row[1]: row
            for row in db.execute("PRAGMA table_info(transaction_logs)")
        }
        row = db.execute(
            "SELECT quantity_change, warehouse_qty_before, warehouse_qty_after, "
            "department_qty_before, department_qty_after "
            "FROM transaction_logs WHERE log_id = 'legacy-log'"
        ).fetchone()
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()[0]

    assert columns["department_qty_before"][3] == 0
    assert columns["department_qty_after"][3] == 0
    assert row == (4, 6, 10, None, None)
    assert revision == MIGRATION_REVISION
