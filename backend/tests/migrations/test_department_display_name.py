"""Display labels must never rewrite the department's durable location key."""
from __future__ import annotations

import io
import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config


def _config(database: Path) -> Config:
    """Use an isolated migration database for every case."""
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database.as_posix()}")
    return config


def test_department_display_name_preserves_all_existing_values(tmp_path: Path) -> None:
    database = tmp_path / "department-display.db"
    config = _config(database)
    command.upgrade(config, "20261007_0041")
    with sqlite3.connect(database) as db:
        db.execute("INSERT INTO departments (name, display_order, is_active, io_enabled) VALUES ('assembly', 17, 1, 1)")
        db.execute("INSERT INTO employees (employee_id, employee_code, name, role, department, display_order, is_active, pin_hash) VALUES (?, 'LABEL-1', 'Existing employee', 'worker', 'assembly', 9, 'true', 'unchanged-pin')", ("a" * 32,))
        before = {}
        for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'alembic_version'"):
            columns = [row[1] for row in db.execute(f'PRAGMA table_info("{table}")')]
            before[table] = (columns, db.execute(f'SELECT * FROM "{table}"').fetchall())
        rootpage = db.execute("SELECT rootpage FROM sqlite_master WHERE name='departments'").fetchone()
    command.upgrade(config, "20261007_0042")
    with sqlite3.connect(database) as db:
        for table, (columns, rows) in before.items():
            projection = ", ".join(f'"{column}"' for column in columns)
            assert db.execute(f'SELECT {projection} FROM "{table}"').fetchall() == rows, table
        assert db.execute("SELECT name, display_name FROM departments").fetchall() == [("assembly", None)]
        assert db.execute("SELECT rootpage FROM sqlite_master WHERE name='departments'").fetchone() == rootpage
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == ("20261007_0042",)
    with pytest.raises(RuntimeError, match="backup"):
        command.downgrade(config, "20261007_0041")


@pytest.mark.parametrize("definition", ["VARCHAR(50)", "TEXT", "VARCHAR(30)", "VARCHAR(50) NOT NULL DEFAULT ''"])
def test_department_display_name_replay_rejects_schema_drift(tmp_path: Path, definition: str) -> None:
    database = tmp_path / "department-replay.db"
    config = _config(database)
    command.upgrade(config, "20261007_0041")
    with sqlite3.connect(database) as db:
        db.execute(f"ALTER TABLE departments ADD COLUMN display_name {definition}")
        before = db.execute("SELECT sql FROM sqlite_master WHERE name='departments'").fetchone()
    if definition == "VARCHAR(50)":
        command.upgrade(config, "20261007_0042")
    else:
        with pytest.raises(RuntimeError, match="display_name is incompatible"):
            command.upgrade(config, "20261007_0042")
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT sql FROM sqlite_master WHERE name='departments'").fetchone() == before
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == (
            "20261007_0042" if definition == "VARCHAR(50)" else "20261007_0041",
        )


def test_department_display_name_postgres_uses_nullable_native_add() -> None:
    output = io.StringIO()
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"), output_buffer=output)
    config.set_main_option("sqlalchemy.url", "postgresql://migration:unused@localhost/isolated")
    command.upgrade(config, "20261007_0041:20261007_0042", sql=True)
    sql = output.getvalue()
    assert "ALTER TABLE departments ADD COLUMN display_name VARCHAR(50)" in sql
    assert "UPDATE departments" not in sql
    assert "CREATE TABLE" not in sql
