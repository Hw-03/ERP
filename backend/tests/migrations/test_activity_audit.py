from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREVIOUS_REVISION = "20260812_0019"
MIGRATION_REVISION = "20260813_0020"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def test_activity_audit_migration_creates_snapshot_tables_and_indexes(tmp_path: Path):
    path = tmp_path / "activity-audit.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)
    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        tables = {
            row[0]
            for row in db.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        columns = {
            row[1]
            for row in db.execute("PRAGMA table_info(activity_audit_logs)")
        }
        indexes = {
            row[1]
            for row in db.execute("PRAGMA index_list(activity_audit_logs)")
        }
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()[0]

    assert {"audit_terminals", "activity_audit_logs"} <= tables
    assert {
        "occurred_at",
        "actor_employee_name",
        "actor_employee_code",
        "terminal_id",
        "terminal_name",
        "source",
        "session_id",
        "screen_key",
        "screen_label",
        "action_key",
        "action_label",
        "outcome",
        "target_summary",
        "request_id",
        "related_id",
    } <= columns
    assert {
        "ix_activity_audit_logs_occurred_at",
        "ix_activity_audit_logs_actor_employee_code",
        "ix_activity_audit_logs_terminal_id",
        "ix_activity_audit_logs_session_id",
        "ix_activity_audit_logs_outcome",
    } <= indexes
    assert revision == MIGRATION_REVISION
