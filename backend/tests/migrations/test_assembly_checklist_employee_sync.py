"""Employee assembly-checklist content synchronization migration tests."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sqlite3
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config


ROOT = Path(__file__).resolve().parents[3]
BACKEND_DIR = ROOT / "backend"
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
MIGRATION_PATH = (
    BACKEND_DIR
    / "alembic"
    / "versions"
    / "20260812_0017_sync_assembly_checklist_content.py"
)
PREFLIGHT_SCRIPT = ROOT / "scripts" / "ops" / "employee_schema_preflight.py"
PREVIOUS_REVISION = "20260807_0016"
MIGRATION_REVISION = "20260812_0017"
HEAD_REVISION = "20260831_0033"
EXPECTED_COUNTS = (4, 6, 50)
EXPECTED_SHA256 = "02ecc3fc0549e0ac60e035b14d87533bdfa58fe651daf302570a202fc58d96ba"

SNAPSHOT_COLUMNS = {
    "assembly_checklists": (
        "checklist_id",
        "model_slot",
        "created_at",
        "updated_at",
    ),
    "assembly_checklist_sections": (
        "section_id",
        "checklist_id",
        "title",
        "sort_order",
        "created_at",
    ),
    "assembly_checklist_items": (
        "item_id",
        "section_id",
        "content",
        "sort_order",
        "created_at",
    ),
}


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def _snapshot_digest(connection: sqlite3.Connection) -> str:
    payload: dict[str, list[list[object]]] = {}
    for table, columns in SNAPSHOT_COLUMNS.items():
        selected = ",".join(columns)
        rows = connection.execute(
            f"SELECT {selected} FROM {table} ORDER BY {selected}"
        ).fetchall()
        payload[table] = [list(row) for row in rows]
    raw = json.dumps(
        payload,
        ensure_ascii=True,
        separators=(",", ":"),
    ).encode()
    return hashlib.sha256(raw).hexdigest()


def _load_preflight_module():
    spec = importlib.util.spec_from_file_location(
        "employee_schema_preflight_for_checklists",
        PREFLIGHT_SCRIPT,
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_migration_replaces_only_checklist_tables_with_development_snapshot(
    tmp_path: Path,
) -> None:
    path = tmp_path / "employee-checklists.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)

    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO system_settings (setting_key, setting_value) "
            "VALUES ('employee-sentinel', 'preserve-me')"
        )
        db.executemany(
            "INSERT INTO product_symbols "
            "(slot, symbol, model_name, is_finished_good, is_reserved, display_order) "
            "VALUES (?, ?, ?, 1, 0, ?)",
            [
                (1, "3", "DX3000", 0),
                (2, "7", "COCOON", 1),
                (3, "8", "SOLO", 4),
                (5, "6", "ADX6000FB", 3),
            ],
        )
        db.executemany(
            "INSERT INTO assembly_checklists "
            "(checklist_id, model_slot, created_at, updated_at) "
            "VALUES (?, ?, ?, ?)",
            [
                ("employee-solo", 3, "2026-08-12 02:54:07", "2026-08-12 02:54:07"),
                ("employee-adx", 5, "2026-08-12 02:54:49", "2026-08-12 02:54:49"),
            ],
        )

    command.upgrade(config, "head")

    with sqlite3.connect(path) as db:
        counts = tuple(
            db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in SNAPSHOT_COLUMNS
        )
        digest = _snapshot_digest(db)
        sentinel = db.execute(
            "SELECT setting_value FROM system_settings "
            "WHERE setting_key = 'employee-sentinel'"
        ).fetchone()
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()

    preflight = _load_preflight_module()
    policy = preflight._policy_from_migration(MIGRATION_PATH)
    preflight.assert_policy_validators(path, (policy,))

    assert counts == EXPECTED_COUNTS
    assert digest == EXPECTED_SHA256
    assert sentinel == ("preserve-me",)
    assert revision == (HEAD_REVISION,)
    assert policy.kind == "data-change"
    assert policy.allowed_tables == frozenset(SNAPSHOT_COLUMNS)


def test_migration_skips_snapshot_when_target_models_are_missing(
    tmp_path: Path,
) -> None:
    path = tmp_path / "missing-checklist-models.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)

    with sqlite3.connect(path) as db:
        db.execute("DELETE FROM product_symbols WHERE slot IN (1, 2, 3, 5)")

    command.upgrade(config, "head")

    with sqlite3.connect(path) as db:
        checklist_count = db.execute(
            "SELECT COUNT(*) FROM assembly_checklists"
        ).fetchone()
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()

    assert checklist_count == (0,)
    assert revision == (HEAD_REVISION,)
