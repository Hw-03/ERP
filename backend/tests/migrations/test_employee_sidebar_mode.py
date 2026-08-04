"""직원별 사이드바 모드 Alembic 마이그레이션 테스트."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREVIOUS_REVISION = "20260728_0011"
MIGRATION_REVISION = "20260804_0012"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def test_sidebar_mode_migration_defaults_existing_employees_to_hover(tmp_path: Path):
    path = tmp_path / "employee-sidebar-mode.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)

    with sqlite3.connect(path) as db:
        db.execute(
            """
            INSERT INTO employees (
                employee_id, employee_code, name, role, department, level,
                display_order, is_active
            ) VALUES (
                '11111111111111111111111111111111', 'SIDEBAR-01',
                'Sidebar Employee', 'worker', 'assembly', 'STAFF', 0, 'true'
            )
            """
        )
        db.commit()

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        columns = {row[1]: row for row in db.execute("PRAGMA table_info(employees)")}
        sidebar_mode = db.execute(
            "SELECT sidebar_mode FROM employees WHERE employee_code='SIDEBAR-01'"
        ).fetchone()[0]
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()[0]

    assert columns["sidebar_mode"][2].upper() == "VARCHAR(10)"
    assert columns["sidebar_mode"][3] == 1
    assert columns["sidebar_mode"][4] == "'hover'"
    assert sidebar_mode == "hover"
    assert revision == MIGRATION_REVISION


def test_sidebar_mode_migration_preserves_a_compatible_existing_column(tmp_path: Path):
    path = tmp_path / "employee-sidebar-mode-existing.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)

    with sqlite3.connect(path) as db:
        db.execute(
            "ALTER TABLE employees ADD COLUMN sidebar_mode "
            "VARCHAR(10) DEFAULT 'hover' NOT NULL"
        )
        db.execute(
            """
            INSERT INTO employees (
                employee_id, employee_code, name, role, department, level,
                display_order, is_active, sidebar_mode
            ) VALUES (
                '22222222222222222222222222222222', 'SIDEBAR-02',
                'Existing Sidebar Employee', 'worker', 'assembly', 'STAFF',
                0, 'true', 'expanded'
            )
            """
        )
        db.commit()

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        sidebar_mode = db.execute(
            "SELECT sidebar_mode FROM employees WHERE employee_code='SIDEBAR-02'"
        ).fetchone()[0]
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()[0]

    assert sidebar_mode == "expanded"
    assert revision == MIGRATION_REVISION
