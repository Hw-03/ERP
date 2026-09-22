"""Rehearse a preserving development migration before the data-sync backup gate."""
from __future__ import annotations

import argparse
import json
import os
import re
import socket
import sqlite3
import subprocess
import sys
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from alembic.script import ScriptDirectory  # noqa: E402
from scripts.ops.backup_manifest import BackupStatus, verify_sqlite_backup  # noqa: E402
from scripts.ops.employee_schema_preflight import (  # noqa: E402
    PreflightError,
    _copy_verified_snapshot,
    _policy_from_migration,
    assert_existing_rows_unchanged,
    snapshot_existing_rows,
)


class PreparationError(RuntimeError):
    """Preparation cannot prove a preserving upgrade; stop the enclosing sync."""


def inspect_database(root: Path, database: Path) -> dict[str, object]:
    """Allow only a known single revision on a linear, preserving path to head."""
    graph = ScriptDirectory(str(root / "backend" / "alembic"))
    heads = graph.get_heads()
    if len(heads) != 1:
        raise PreparationError("development migration graph must have one head")
    with closing(sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True)) as connection:
        revisions = connection.execute("SELECT version_num FROM alembic_version").fetchall()
    if len(revisions) != 1:
        raise PreparationError("development database must have one known revision")
    current = revisions[0][0]
    revision = graph.get_revision(heads[0])
    while revision is not None and revision.revision != current:
        if revision.dependencies or isinstance(revision.down_revision, tuple):
            raise PreparationError("branched/dependent migration is not automatically prepared")
        try:
            policy = _policy_from_migration(Path(revision.path))
        except PreflightError as exc:
            raise PreparationError(str(exc)) from exc
        if policy.kind not in {"schema-only", "data-preserving"}:
            raise PreparationError("development preparation requires a preserving migration policy")
        revision = graph.get_revision(revision.down_revision) if revision.down_revision else None
    if revision is None:
        raise PreparationError(f"unknown or non-ancestor development revision: {current}")
    return {"revision": current, "head": heads[0], "needs_migration": current != heads[0]}


def run_checked(root: Path, runtime: Path, database: Path, arguments: list[str]) -> str:
    """Run existing validators with explicit database and isolated runtime settings."""
    environment = os.environ.copy()
    environment.update(DATABASE_URL=f"sqlite:///{database.as_posix()}", MES_RUNTIME_ROOT=str(runtime), PYTHON_DOTENV_DISABLED="1")
    for name in ("APP_ENV", "REQUIRE_POSTGRES", "PYTHONPATH"):
        environment.pop(name, None)
    result = subprocess.run([sys.executable, *arguments], cwd=root / "backend", env=environment, text=True, capture_output=True)
    print(result.stdout, end="")
    print(result.stderr, end="", file=sys.stderr)
    print(f"SYNC_DEV_PREP_COMMAND_EXIT={result.returncode}")
    if result.returncode:
        raise PreparationError(f"{Path(arguments[0]).name} failed: exit {result.returncode}")
    return result.stdout


def migrate_and_verify(root: Path, database: Path, runtime: Path) -> None:
    """Use bootstrap and the same DB/inventory validators as data synchronization."""
    run_checked(root, runtime, database, ["bootstrap_db.py", "--migrate"])
    run_checked(root, runtime, database, ["bootstrap_db.py", "--check"])
    run_checked(root, runtime, database, [str(root / "scripts/ops/_verify_backup.py"), "--database", str(database)])
    run_checked(root, runtime, database, [str(root / "scripts/ops/check_inventory_integrity.py"), "--db-url", f"sqlite:///{database.as_posix()}"])


def rehearse(root: Path, database: Path, runtime: Path) -> Path:
    """Prove migration preserves all existing business values on an online snapshot."""
    inspect_database(root, database)
    snapshot = _copy_verified_snapshot(database, runtime)
    print(f"SYNC_DEV_PREP_SNAPSHOT={snapshot}")
    before = snapshot_existing_rows(snapshot)
    migrate_and_verify(root, snapshot, runtime)
    try:
        assert_existing_rows_unchanged(snapshot, before, frozenset())
    except PreflightError as exc:
        raise PreparationError(str(exc)) from exc
    if inspect_database(root, snapshot)["needs_migration"]:
        raise PreparationError("rehearsal did not reach head")
    print("SYNC_DEV_PREP_DATA_PRESERVED=PASS")
    return snapshot


def apply_stopped(root: Path, database: Path, runtime: Path) -> None:
    """Caller owns service shutdown; revalidate fresh stopped data before migration."""
    assert_development_stopped()
    # The structural backup is explicit old-schema evidence, never a full-head backup.
    output = run_checked(root, runtime, database, [str(root / "scripts/ops/backup_db.py"), "--sqlite", str(database), "--integrity-only"])
    match = re.search(r"(?m)^BACKUP_PATH=(.+)$", output)
    if match is None:
        raise PreparationError("structural backup did not return a path")
    backup = Path(match[1].strip()).resolve()
    if not backup.is_relative_to(runtime.resolve()) or verify_sqlite_backup(backup).status != BackupStatus.STRUCTURAL_ONLY:
        raise PreparationError("structural backup verification failed")
    print(f"SYNC_DEV_PREP_BACKUP={backup}")
    rehearse(root, database, runtime)
    before = snapshot_existing_rows(backup)
    assert_existing_rows_unchanged(database, before, frozenset())
    assert_development_stopped()
    migrate_and_verify(root, database, runtime)
    assert_existing_rows_unchanged(database, before, frozenset())
    if inspect_database(root, database)["needs_migration"]:
        raise PreparationError("development migration did not reach head")
    print("SYNC_DEV_PREP_DATA_PRESERVED=PASS")


def assert_development_stopped() -> None:
    """Recheck both ports immediately before mutation to catch a service restart."""
    for port in (8011, 3001):
        with socket.socket() as connection:
            connection.settimeout(1)
            if connection.connect_ex(("127.0.0.1", port)) == 0:
                raise PreparationError(f"development service still listening on {port}")


def main(argv: list[str] | None = None) -> int:
    """Expose probe/rehearsal/stopped-apply stages to the managed data-sync script."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("probe", "rehearse", "apply-stopped"))
    parser.add_argument("--root", type=Path, required=True)
    args = parser.parse_args(argv)
    root = args.root.resolve()
    database = root / "backend/mes.db"
    runtime = root / "_attic/runtime/development-schema-preparation"
    try:
        if root.name.casefold() == "erp-dev":
            raise PreparationError("employee root cannot be prepared by development tooling")
        state = inspect_database(root, database)
        if state["needs_migration"]:
            if args.mode == "rehearse":
                rehearse(root, database, runtime)
            elif args.mode == "apply-stopped":
                apply_stopped(root, database, runtime)
        print(json.dumps(state))
        return 0
    except Exception as exc:  # One CLI boundary: any failed proof must block the sync.
        print(f"SYNC_DEV_PREP_ERROR={exc}", file=sys.stderr)
        return 13


if __name__ == "__main__":
    raise SystemExit(main())
