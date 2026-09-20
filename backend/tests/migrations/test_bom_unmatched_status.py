"""BOM 미매칭 상태 필드 마이그레이션 회귀 테스트."""

from __future__ import annotations

import sqlite3
import uuid
from pathlib import Path

from alembic import command
from alembic.config import Config
import sqlalchemy as sa

from bootstrap import migrate as migrate_module


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREVIOUS_REVISION = "20260915_0034"
MIGRATION_REVISION = "20260917_0035"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def _create_raw_rebuild_database(
    path: Path,
    *,
    code_column: str,
    include_symbol_slot: bool,
) -> None:
    symbol_slot_column = ", symbol_slot INTEGER" if include_symbol_slot else ""
    symbol_slot_value = ", 1" if include_symbol_slot else ""
    with sqlite3.connect(path) as db:
        db.executescript(
            f"""
            CREATE TABLE process_types (code VARCHAR(2) PRIMARY KEY);
            INSERT INTO process_types (code) VALUES ('HR');
            CREATE TABLE items (
                item_id UUID PRIMARY KEY,
                item_name VARCHAR(200) NOT NULL,
                sort_order INTEGER,
                unit VARCHAR(20) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                legacy_part VARCHAR(50),
                legacy_item_type VARCHAR(50),
                bom_unmatched_status VARCHAR(20),
                pre_disused_legacy_item_type VARCHAR(50),
                supplier VARCHAR(200),
                min_stock INTEGER,
                sales_review_required BOOLEAN NOT NULL DEFAULT 0,
                bom_stock_exempt BOOLEAN NOT NULL DEFAULT 0,
                model_symbol VARCHAR(20),
                process_type_code VARCHAR(2),
                serial_no INTEGER,
                bom_completed_at DATETIME,
                {code_column} VARCHAR(40),
                deleted_at DATETIME
                {symbol_slot_column},
                FOREIGN KEY(process_type_code) REFERENCES process_types(code)
            );
            INSERT INTO items (
                item_id, item_name, unit, legacy_item_type,
                bom_unmatched_status, pre_disused_legacy_item_type,
                model_symbol, process_type_code, serial_no, {code_column}
                {', symbol_slot' if include_symbol_slot else ''}
            ) VALUES (
                '11111111111111111111111111111111', '기존 불용 품목', 'EA', '불용',
                'DISUSED', '원자재', '3', 'HR', 1, '3-HR-0001'
                {symbol_slot_value}
            );
            """
        )


def test_migration_adds_nullable_bom_unmatched_fields_and_preserves_items(
    tmp_path: Path,
) -> None:
    path = tmp_path / "bom-unmatched-status.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)
    item_id = uuid.uuid4().hex

    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) "
            "VALUES ('HR', 'H', 'R', 1)"
        )
        db.execute(
            "INSERT INTO items "
            "(item_id, item_name, unit, legacy_item_type, model_symbol, "
            "process_type_code, serial_no) "
            "VALUES (?, '기존 품목', 'EA', '원자재', '3', 'HR', 1)",
            (item_id,),
        )

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        columns = {row[1] for row in db.execute("PRAGMA table_info(items)")}
        row = db.execute(
            "SELECT legacy_item_type, bom_unmatched_status, "
            "pre_disused_legacy_item_type FROM items WHERE item_id = ?",
            (item_id,),
        ).fetchone()
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()[0]

    assert {"bom_unmatched_status", "pre_disused_legacy_item_type"} <= columns
    assert row == ("원자재", None, None)
    assert revision == MIGRATION_REVISION


def test_migration_accepts_compatible_existing_fields_and_preserves_values(
    tmp_path: Path,
) -> None:
    path = tmp_path / "bom-unmatched-status-compatible.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)
    item_id = uuid.uuid4().hex

    with sqlite3.connect(path) as db:
        db.execute("ALTER TABLE items ADD COLUMN bom_unmatched_status VARCHAR(20)")
        db.execute(
            "ALTER TABLE items ADD COLUMN pre_disused_legacy_item_type VARCHAR(50)"
        )
        db.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) "
            "VALUES ('HR', 'H', 'R', 1)"
        )
        db.execute(
            "INSERT INTO items "
            "(item_id, item_name, unit, legacy_item_type, bom_unmatched_status, "
            "pre_disused_legacy_item_type, model_symbol, process_type_code, serial_no) "
            "VALUES (?, '기존 불용 품목', 'EA', '불용', 'DISUSED', "
            "'부자재', '3', 'HR', 1)",
            (item_id,),
        )

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        row = db.execute(
            "SELECT legacy_item_type, bom_unmatched_status, "
            "pre_disused_legacy_item_type FROM items WHERE item_id = ?",
            (item_id,),
        ).fetchone()
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()[0]

    assert row == ("불용", "DISUSED", "부자재")
    assert revision == MIGRATION_REVISION


def test_raw_m1_rebuild_preserves_bom_unmatched_values(
    tmp_path: Path,
    monkeypatch,
) -> None:
    path = tmp_path / "raw-m1-rebuild.db"
    _create_raw_rebuild_database(
        path,
        code_column="item_code",
        include_symbol_slot=True,
    )
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    monkeypatch.setattr(migrate_module, "engine", engine)
    try:
        migrate_module._drop_dead_m1_objects()
    finally:
        engine.dispose()

    with sqlite3.connect(path) as db:
        columns = {row[1] for row in db.execute("PRAGMA table_info(items)")}
        row = db.execute(
            "SELECT bom_unmatched_status, pre_disused_legacy_item_type FROM items"
        ).fetchone()

    assert "symbol_slot" not in columns
    assert row == ("DISUSED", "원자재")


def test_raw_generated_mes_code_rebuild_preserves_bom_unmatched_values(
    tmp_path: Path,
    monkeypatch,
) -> None:
    path = tmp_path / "raw-generated-code-rebuild.db"
    _create_raw_rebuild_database(
        path,
        code_column="mes_code",
        include_symbol_slot=False,
    )
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    monkeypatch.setattr(migrate_module, "engine", engine)
    try:
        migrate_module._recreate_items_with_generated_mes_code()
    finally:
        engine.dispose()

    with sqlite3.connect(path) as db:
        row = db.execute(
            "SELECT mes_code, bom_unmatched_status, pre_disused_legacy_item_type "
            "FROM items"
        ).fetchone()

    assert row == ("3-HR-0001", "DISUSED", "원자재")
