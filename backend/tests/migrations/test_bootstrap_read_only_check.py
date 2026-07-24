from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
from contextlib import contextmanager
from pathlib import Path

import pytest
import sqlalchemy as sa

import bootstrap.seed as seed_module
import bootstrap_db
from bootstrap.schema import SchemaCheckResult, SchemaState, ensure_schema


BACKEND_DIR = Path(__file__).resolve().parents[2]
HEAD_REVISION = "20260724_0004"


def _upgrade_head(path: Path) -> None:
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        ensure_schema(engine=engine)
    finally:
        engine.dispose()


def _run_check(path: Path) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{path.as_posix()}"
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return subprocess.run(
        [sys.executable, "bootstrap_db.py", "--check"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )


def test_check_missing_sqlite_is_nonzero_without_creating_file(tmp_path: Path):
    path = tmp_path / "missing.db"

    result = _run_check(path)

    assert result.returncode != 0
    assert not path.exists()


def test_check_preserves_sqlite_delete_journal_mode(tmp_path: Path):
    path = tmp_path / "delete-mode.db"
    _upgrade_head(path)
    with sqlite3.connect(path) as db:
        assert db.execute("PRAGMA journal_mode=DELETE").fetchone()[0].lower() == "delete"

    result = _run_check(path)

    assert result.returncode == 0, result.stderr
    with sqlite3.connect(path) as db:
        assert db.execute("PRAGMA journal_mode").fetchone()[0].lower() == "delete"


def test_check_succeeds_while_another_connection_holds_reserved_lock(tmp_path: Path):
    path = tmp_path / "reserved-lock.db"
    _upgrade_head(path)
    locker = sqlite3.connect(path, isolation_level=None)
    try:
        locker.execute("BEGIN IMMEDIATE")
        result = _run_check(path)
    finally:
        locker.execute("ROLLBACK")
        locker.close()

    assert result.returncode == 0, result.stderr


def test_cli_check_injects_one_readonly_connection_into_both_steps(
    monkeypatch: pytest.MonkeyPatch,
):
    sentinel = object()
    calls: list[tuple[str, object]] = []

    @contextmanager
    def fake_readonly_connection():
        yield sentinel

    monkeypatch.setattr(bootstrap_db, "readonly_connection", fake_readonly_connection)
    monkeypatch.setattr(
        bootstrap_db,
        "check_schema",
        lambda *, connection: calls.append(("schema", connection))
        or SchemaCheckResult(
            state=SchemaState.VERSIONED,
            revision=HEAD_REVISION,
            ready=True,
        ),
    )
    monkeypatch.setattr(
        bootstrap_db,
        "check_db",
        lambda *, connection: calls.append(("data", connection)) or {"items": 0},
    )

    assert bootstrap_db.main(["--check"]) == 0
    assert calls == [("schema", sentinel), ("data", sentinel)]


def test_check_db_with_connection_never_opens_session(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    path = tmp_path / "core-counts.db"
    _upgrade_head(path)
    monkeypatch.setattr(
        seed_module,
        "SessionLocal",
        lambda: pytest.fail("injected check_db must not open SessionLocal"),
    )
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        with engine.connect() as connection:
            report = seed_module.check_db(connection=connection)
    finally:
        engine.dispose()

    assert report == {
        "employees": 0,
        "process_types": 0,
        "product_symbols": 0,
        "items": 0,
        "items_missing_mes_code": 0,
    }
