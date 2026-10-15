"""Shipping retry metadata must not rewrite existing requests or children."""
from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest


def test_shipping_submission_hash_migration_preserves_existing_rows(tmp_path: Path) -> None:
    path = tmp_path / "shipping-submission.db"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "20261007_0040")
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("INSERT INTO process_types (code, prefix, suffix, stage_order) VALUES ('PF', 'P', 'F', 80)")
        db.execute("INSERT INTO items (item_id, item_name, unit, model_symbol, process_type_code, serial_no) VALUES (?, 'Existing PF', 'EA', '8', 'PF', 1)", ("a" * 32,))
        db.execute("INSERT INTO shipping_requests (request_id, base_pf_item_id, final_pf_item_id, requested_by_name, invoice_number) VALUES (?, ?, ?, 'Original employee', 'Original invoice')", ("b" * 32, "a" * 32, "a" * 32))
        db.execute("INSERT INTO shipping_request_events (event_id, request_id, event_type, message) VALUES (?, ?, 'REQUEST_CREATED', 'Original event')", ("c" * 32, "b" * 32))
        columns = [row[1] for row in db.execute("PRAGMA table_info(shipping_requests)")]
        before = db.execute("SELECT * FROM shipping_requests").fetchall()
        children = db.execute("SELECT * FROM shipping_request_events").fetchall()
    command.upgrade(config, "20261007_0041")
    with sqlite3.connect(path) as db:
        assert db.execute(f"SELECT {', '.join(columns)} FROM shipping_requests").fetchall() == before
        assert db.execute("SELECT submission_payload_hash FROM shipping_requests").fetchall() == [(None,)]
        assert db.execute("SELECT * FROM shipping_request_events").fetchall() == children
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == ("20261007_0041",)


@pytest.mark.parametrize("definition", ["VARCHAR(64)", "TEXT", "VARCHAR(32)", "VARCHAR(64) NOT NULL DEFAULT ''"])
def test_shipping_submission_hash_replay_preserves_only_compatible_column(tmp_path: Path, definition: str) -> None:
    """Onboarding may replay this revision, but cannot bless a drifted column."""
    path = tmp_path / "shipping-replay.db"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "20261007_0040")
    with sqlite3.connect(path) as db:
        db.execute(f"ALTER TABLE shipping_requests ADD COLUMN submission_payload_hash {definition}")
        schema_before = db.execute("SELECT sql FROM sqlite_master WHERE name='shipping_requests'").fetchone()
    if definition == "VARCHAR(64)":
        command.upgrade(config, "20261007_0041")
    else:
        with pytest.raises(RuntimeError, match="submission_payload_hash is incompatible"):
            command.upgrade(config, "20261007_0041")
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT sql FROM sqlite_master WHERE name='shipping_requests'").fetchone() == schema_before
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == (
            "20261007_0041" if definition == "VARCHAR(64)" else "20261007_0040",
        )
