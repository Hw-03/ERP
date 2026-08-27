from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREVIOUS_REVISION = "20260824_0025"
MIGRATION_REVISION = "20260824_0026"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def test_operation_line_link_migration_is_nullable_and_does_not_backfill(tmp_path: Path) -> None:
    path = tmp_path / "transaction-operation-line-link.db"
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
            "(log_id, item_id, transaction_type, quantity_change) "
            "VALUES ('legacy-log', 'legacy-item', 'RECEIVE', 4)"
        )

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        columns = {
            row[1]: row
            for row in db.execute("PRAGMA table_info(transaction_logs)")
        }
        indexes = {row[1] for row in db.execute("PRAGMA index_list(transaction_logs)")}
        foreign_keys = db.execute("PRAGMA foreign_key_list(transaction_logs)").fetchall()
        operation_line_id = db.execute(
            "SELECT operation_line_id FROM transaction_logs WHERE log_id = 'legacy-log'"
        ).fetchone()[0]
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()[0]

    assert columns["operation_line_id"][3] == 0
    assert "ix_transaction_logs_operation_line_id" in indexes
    assert any(
        foreign_key[2] == "io_lines"
        and foreign_key[3] == "operation_line_id"
        and foreign_key[4] == "line_id"
        and foreign_key[6] == "SET NULL"
        for foreign_key in foreign_keys
    )
    assert operation_line_id is None
    assert revision == MIGRATION_REVISION
