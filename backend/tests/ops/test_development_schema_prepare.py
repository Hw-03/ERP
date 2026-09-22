from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from scripts.ops import development_schema_prepare as prepare


def fixture_root(tmp_path: Path, revision: str = "old") -> tuple[Path, Path]:
    versions = tmp_path / "backend" / "alembic" / "versions"
    versions.mkdir(parents=True)
    for name, parent in (("old", None), ("new", "old")):
        (versions / f"{name}.py").write_text(
            f"revision = {name!r}\ndown_revision = {parent!r}\n"
            "branch_labels = None\ndepends_on = None\n"
            "EMPLOYEE_AUTO_DEPLOY_POLICY = {'kind': 'schema-only'}\n",
            encoding="utf-8",
        )
    database = tmp_path / "backend" / "mes.db"
    with sqlite3.connect(database) as connection:
        connection.executescript("CREATE TABLE alembic_version(version_num TEXT); CREATE TABLE items(id INTEGER, qty INTEGER);")
        connection.execute("INSERT INTO alembic_version VALUES (?)", (revision,))
        connection.execute("INSERT INTO items VALUES (1, 7)")
    return tmp_path, database


def test_only_known_linear_ancestor_is_accepted(tmp_path: Path) -> None:
    root, database = fixture_root(tmp_path)
    assert prepare.inspect_database(root, database) == {"revision": "old", "head": "new", "needs_migration": True}
    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE alembic_version SET version_num='unknown'")
    with pytest.raises(prepare.PreparationError):
        prepare.inspect_database(root, database)


def test_multiple_heads_are_rejected(tmp_path: Path) -> None:
    root, database = fixture_root(tmp_path)
    (root / "backend/alembic/versions/branch.py").write_text("revision='branch'\ndown_revision='old'\n", encoding="utf-8")
    with pytest.raises(prepare.PreparationError):
        prepare.inspect_database(root, database)


def test_rehearsal_preserves_original_and_rejects_data_mutation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root, database = fixture_root(tmp_path)
    original = database.read_bytes()
    def migrate(root: Path, candidate: Path, runtime: Path) -> None:
        with sqlite3.connect(candidate) as connection:
            connection.execute("ALTER TABLE items ADD COLUMN review TEXT")
            connection.execute("UPDATE alembic_version SET version_num='new'")
    monkeypatch.setattr(prepare, "migrate_and_verify", migrate)
    prepare.rehearse(root, database, tmp_path / "runtime")
    assert database.read_bytes() == original
    def corrupt(root: Path, candidate: Path, runtime: Path) -> None:
        migrate(root, candidate, runtime)
        with sqlite3.connect(candidate) as connection:
            connection.execute("UPDATE items SET qty=0")
    monkeypatch.setattr(prepare, "migrate_and_verify", corrupt)
    with pytest.raises(prepare.PreparationError, match="rows changed"):
        prepare.rehearse(root, database, tmp_path / "runtime")
    assert database.read_bytes() == original


def test_migration_without_preservation_policy_is_rejected(tmp_path: Path) -> None:
    root, database = fixture_root(tmp_path)
    (root / "backend/alembic/versions/new.py").write_text("revision='new'\ndown_revision='old'\n", encoding="utf-8")
    with pytest.raises(prepare.PreparationError):
        prepare.inspect_database(root, database)


def test_backup_failure_never_migrates_target(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root, database = fixture_root(tmp_path)
    original = database.read_bytes()
    monkeypatch.setattr(prepare, "assert_development_stopped", lambda: None)
    def fail(*args: object) -> str:
        raise prepare.PreparationError("backup failed")
    monkeypatch.setattr(prepare, "run_checked", fail)
    with pytest.raises(prepare.PreparationError, match="backup failed"):
        prepare.apply_stopped(root, database, tmp_path / "runtime")
    assert database.read_bytes() == original


def test_failed_rehearsal_leaves_original_unchanged(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root, database = fixture_root(tmp_path)
    original = database.read_bytes()
    def fail(*args: object) -> None:
        raise prepare.PreparationError("migration failed")
    monkeypatch.setattr(prepare, "migrate_and_verify", fail)
    with pytest.raises(prepare.PreparationError, match="migration failed"):
        prepare.rehearse(root, database, tmp_path / "runtime")
    assert database.read_bytes() == original
