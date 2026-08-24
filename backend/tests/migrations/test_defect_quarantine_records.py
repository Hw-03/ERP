"""Defect quarantine record migration regression tests."""

from __future__ import annotations

import sqlite3
import importlib.util
from pathlib import Path

from alembic import command
from alembic.config import Config


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREVIOUS_REVISION = "20260820_0023"
MIGRATION_REVISION = "20260824_0027"
MIGRATION_FILE = (
    BACKEND_DIR / "alembic" / "versions" / "20260824_0027_defect_quarantine_records.py"
)


def _validator_sql() -> str:
    spec = importlib.util.spec_from_file_location("defect_records_migration", MIGRATION_FILE)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.EMPLOYEE_AUTO_DEPLOY_POLICY["validator_sql"]


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def test_migration_backfills_one_legacy_record_per_active_location_idempotently(
    tmp_path: Path,
) -> None:
    path = tmp_path / "defect-quarantine-records.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)

    item_id = "11111111111111111111111111111111"
    location_id = "22222222222222222222222222222222"
    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) "
            "VALUES ('HR', 'H', 'R', 1)"
        )
        db.execute(
            """
            INSERT INTO items (
                item_id, item_name, unit, model_symbol, process_type_code,
                serial_no, sales_review_required, deleted_at
            ) VALUES (?, 'Legacy defect item', 'EA', '346', 'HR', 23, 0, NULL)
            """,
            (item_id,),
        )
        db.execute(
            """
            INSERT INTO inventory_locations (
                location_id, item_id, department, status, quantity,
                pending_quantity, defective_at
            ) VALUES (?, ?, 'ASSEMBLY', 'DEFECTIVE', 7, 0, '2026-07-01 03:04:00')
            """,
            (location_id, item_id),
        )
        db.execute(
            """
            INSERT INTO transaction_logs (
                log_id, item_id, transaction_type, quantity_change,
                produced_by, reason_category, reason_memo, department,
                cancelled, created_at
            ) VALUES (
                '33333333333333333333333333333333', ?, 'MARK_DEFECTIVE', 7,
                'Legacy Actor', 'appearance', 'legacy memo', 'ASSEMBLY',
                0, '2026-07-01 03:04:00'
            )
            """,
            (item_id,),
        )

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        rows = db.execute(
            """
            SELECT item_id, department, original_quantity, remaining_quantity,
                   quarantined_at, quarantined_by_name, reason_category,
                   current_memo, is_legacy, legacy_location_id
            FROM defect_quarantine_records
            """
        ).fetchall()
        revision_rows = db.execute(
            """
            SELECT previous_memo, next_memo, edited_by_name, is_initial
            FROM defect_quarantine_memo_revisions
            """
        ).fetchall()
        tx_columns = {
            row[1] for row in db.execute("PRAGMA table_info(transaction_logs)")
        }
        line_columns = {
            row[1] for row in db.execute("PRAGMA table_info(stock_request_lines)")
        }
        validator_result = db.execute(_validator_sql()).fetchone()[0]

    assert rows == [
        (
            item_id,
            "ASSEMBLY",
            7,
            7,
            "2026-07-01 03:04:00",
            "Legacy Actor",
            "appearance",
            "legacy memo",
            1,
            location_id,
        )
    ]
    assert revision_rows == [(None, "legacy memo", "Legacy Actor", 1)]
    assert "defect_quarantine_record_id" in tx_columns
    assert "defect_quarantine_record_id" in line_columns
    assert validator_result == 0

    with sqlite3.connect(path) as db:
        db.execute(
            "UPDATE alembic_version SET version_num = ?", (PREVIOUS_REVISION,)
        )
    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        record_count = db.execute(
            "SELECT COUNT(*) FROM defect_quarantine_records"
        ).fetchone()[0]
        revision_count = db.execute(
            "SELECT COUNT(*) FROM defect_quarantine_memo_revisions"
        ).fetchone()[0]
        migrated_sum = db.execute(
            "SELECT SUM(remaining_quantity) FROM defect_quarantine_records"
        ).fetchone()[0]
        inventory_sum = db.execute(
            "SELECT SUM(quantity) FROM inventory_locations "
            "WHERE status = 'DEFECTIVE' AND quantity > 0"
        ).fetchone()[0]

    assert record_count == 1
    assert revision_count == 1
    assert migrated_sum == inventory_sum == 7
