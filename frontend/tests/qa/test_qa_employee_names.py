"""Real temporary SQLite contracts for the E2E-only identity replacement."""
from __future__ import annotations

import hashlib
import importlib.util
import os
from contextlib import closing
from pathlib import Path
import sqlite3
from types import ModuleType

import pytest

HELPER = Path(__file__).resolve().parents[1] / "e2e" / "_qa_employee_names.py"


@pytest.fixture
def qa_database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[ModuleType, Path]:
    """Use a standalone schema with both identity and policy sentinel columns."""
    spec = importlib.util.spec_from_file_location("qa_employee_names", HELPER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    database = tmp_path / "backend" / "mes_e2e.db"
    database.parent.mkdir()
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.executescript("""
            CREATE TABLE employees (
                employee_id TEXT PRIMARY KEY, employee_code TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL, department TEXT, role TEXT, warehouse_role TEXT,
                department_role TEXT, as_research_approver INTEGER, pin_hash TEXT,
                pin_last_changed TEXT, is_active TEXT, hidden_sidebar_tabs TEXT,
                display_order INTEGER, contact TEXT, created_at TEXT, updated_at TEXT
            );
            CREATE TABLE audit_sentinel (actor_id TEXT, details TEXT);
        """)
        rows = [
            ("id-one", "E01", "original employee A", "dept-A", "role-A", "none", "primary", 1,
             "hash-one", "2026-10-01T10:00:00", "true", '["tab-a"]', 1, None, "created-one", "updated-one"),
            ("id-two", "E02", "original employee B", "dept-B", "role-B", "deputy", "none", 0,
             "hash-two", None, "false", "[]", 2, "synthetic contact", "created-two", "updated-two"),
        ]
        connection.executemany("INSERT INTO employees VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
        connection.execute("INSERT INTO audit_sentinel VALUES (?,?)", ("id-one", "unchanged audit"))
    monkeypatch.setattr(module, "E2E_DATABASE", database)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database.as_posix()}")
    return module, database


def read_rows(database: Path) -> tuple[list[tuple[object, ...]], list[tuple[object, ...]]]:
    """Read every stored column so the allowed name-only mutation is explicit."""
    with closing(sqlite3.connect(database)) as connection:
        return (
            connection.execute("SELECT * FROM employees ORDER BY employee_id").fetchall(),
            connection.execute("SELECT * FROM audit_sentinel").fetchall(),
        )


def test_all_names_are_synthetic_and_every_other_column_is_preserved(
    qa_database: tuple[ModuleType, Path],
) -> None:
    module, database = qa_database
    before, audit_before = read_rows(database)
    changed = module.anonymize_employees()
    after, audit_after = read_rows(database)
    assert [row[2] for row in after] == [f"QA-Employee-{row[1]}" for row in before]
    assert changed == len(before)
    assert [row[:2] + row[3:] for row in after] == [row[:2] + row[3:] for row in before]
    assert audit_after == audit_before
    module.anonymize_employees()
    assert read_rows(database) == (after, audit_after)


@pytest.mark.parametrize("url_kind", ["production-sibling", "other-qa-path", "postgres", "memory", "query", "missing"])
def test_nonexact_database_url_is_rejected_before_any_write(
    qa_database: tuple[ModuleType, Path], monkeypatch: pytest.MonkeyPatch, url_kind: str,
) -> None:
    module, database = qa_database
    protected = database.with_name("mes.db")
    protected.write_bytes(database.read_bytes())
    urls = {
        "production-sibling": f"sqlite:///{protected.as_posix()}",
        "other-qa-path": f"sqlite:///{(database.parent.parent / 'mes_e2e.db').as_posix()}",
        "postgres": "postgresql://qa@localhost/mes",
        "memory": "sqlite:///:memory:",
        "query": f"sqlite:///{database.as_posix()}?mode=rw",
        "missing": "",
    }
    monkeypatch.setenv("DATABASE_URL", urls[url_kind])
    before = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (database, protected)}
    with pytest.raises(ValueError, match="dedicated E2E"):
        module.anonymize_employees()
    assert {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in before} == before


def test_missing_e2e_file_is_not_created(qa_database: tuple[ModuleType, Path]) -> None:
    module, database = qa_database
    database.unlink()
    with pytest.raises(ValueError, match="existing E2E"):
        module.anonymize_employees()
    assert not database.exists()


def test_hardlink_to_other_database_is_rejected(qa_database: tuple[ModuleType, Path]) -> None:
    module, database = qa_database
    protected = database.with_name("mes.db")
    database.rename(protected)
    os.link(protected, database)
    before = protected.read_bytes()
    with pytest.raises(ValueError, match="independent E2E"):
        module.anonymize_employees()
    assert protected.read_bytes() == before
    assert database.read_bytes() == before
