"""Both independent schema branches must converge without rewriting old values."""
from pathlib import Path
import sqlite3

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory


@pytest.mark.parametrize("starting_revision", ["20261007_0040", "20261007_0043", "20261008_0041"])
def test_merge_preserves_existing_rows_from_either_branch(tmp_path: Path, starting_revision: str) -> None:
    """Compare every old column, plus FK references and nullable snapshot defaults."""
    database = tmp_path / "merged.db"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database.as_posix()}")
    assert ScriptDirectory.from_config(config).get_heads() == ["20261008_0044"]
    command.upgrade(config, starting_revision)
    with sqlite3.connect(database) as db:
        db.execute("INSERT INTO suppliers(supplier_id,name,normalized_name) VALUES ('existing','Acme','acme')")
        db.execute("CREATE TABLE supplier_reference (id TEXT PRIMARY KEY, supplier_id NUMERIC REFERENCES suppliers(supplier_id) ON DELETE RESTRICT, memo TEXT)")
        db.execute("INSERT INTO supplier_reference VALUES ('reference','existing','preserved')")
        db.execute("INSERT INTO departments(name,display_order,is_active,io_enabled) VALUES ('assembly',17,1,1)")
        db.execute("INSERT INTO employees(employee_id,employee_code,name,role,department,display_order,is_active,pin_hash) VALUES (?, 'MERGE-1','Existing','worker','assembly',9,'true','same-pin')", ('a' * 32,))
        before = {}
        for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'alembic_version'"):
            columns = [row[1] for row in db.execute(f'PRAGMA table_info("{table}")')]
            before[table] = (columns, db.execute(f'SELECT * FROM "{table}"').fetchall())
    command.upgrade(config, "head")
    with sqlite3.connect(database) as db:
        for table, (columns, rows) in before.items():
            projection = ', '.join(f'"{column}"' for column in columns)
            assert db.execute(f'SELECT {projection} FROM "{table}"').fetchall() == rows, table
        assert db.execute('SELECT scope FROM suppliers').fetchall() == [('warehouse',)]
        assert db.execute('SELECT display_name FROM departments').fetchall() == [(None,)]
        assert db.execute('SELECT version_num FROM alembic_version').fetchall() == [('20261008_0044',)]
        assert db.execute('PRAGMA foreign_key_check').fetchall() == []
