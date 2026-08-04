"""AF sales-review-required data migration tests."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREVIOUS_HEAD = "20260727_0007"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def test_head_upgrade_enables_sales_review_for_all_af_items(tmp_path: Path) -> None:
    path = tmp_path / "af-sales-review.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_HEAD)

    with sqlite3.connect(path) as db:
        db.executemany(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) VALUES (?, ?, ?, ?)",
            [
                ("AF", "A", "F", 70),
                ("TR", "T", "R", 10),
            ],
        )
        db.executemany(
            """
            INSERT INTO items (
                item_id, item_name, unit, model_symbol, process_type_code,
                serial_no, sales_review_required, deleted_at
            ) VALUES (?, ?, 'EA', '3', ?, ?, ?, ?)
            """,
            [
                ("af-active", "AF active", "AF", 1, False, None),
                ("af-deleted", "AF deleted", "AF", 2, False, "2026-07-27 00:00:00"),
                ("tr-item", "TR item", "TR", 1, False, None),
            ],
        )

    command.upgrade(config, "head")

    with sqlite3.connect(path) as db:
        flags = dict(db.execute("SELECT item_id, sales_review_required FROM items"))

    assert flags == {
        "af-active": 1,
        "af-deleted": 1,
        "tr-item": 0,
    }
