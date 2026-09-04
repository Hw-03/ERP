#!/usr/bin/env python3
"""Validate a schema deployment on an isolated SQLite snapshot before employee sync."""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import sqlite3
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


IGNORED_TABLES = frozenset({"alembic_version", "alembic_schema_state"})
VALID_POLICY_KINDS = frozenset({"schema-only", "data-preserving", "data-change"})


class PreflightError(RuntimeError):
    """Base error for a preflight that must prevent the real deployment."""


class PreflightPolicyError(PreflightError):
    """A changed migration did not declare a safe automatic deployment contract."""


class PreflightDataError(PreflightError):
    """A migration changed employee data outside its declared contract."""


@dataclass(frozen=True)
class MigrationPolicy:
    """Machine-readable automatic-deployment contract for one Alembic revision."""

    revision: str
    kind: str
    allowed_tables: frozenset[str]
    validator_sql: str | None
    validator_expected: Any | None


@dataclass(frozen=True)
class TableSnapshot:
    """Stable digest of the rows and columns that existed before migration."""

    columns: tuple[str, ...]
    row_count: int
    digest: str


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _literal_assignment(tree: ast.Module, name: str, path: Path) -> Any:
    for node in tree.body:
        value_node: ast.expr | None = None
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == name for target in node.targets
        ):
            value_node = node.value
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == name:
            value_node = node.value
        if value_node is not None:
            try:
                return ast.literal_eval(value_node)
            except ValueError as exc:
                raise PreflightPolicyError(f"{path.name}: {name} must be a literal") from exc
    raise PreflightPolicyError(f"{path.name}: missing automatic deployment policy ({name})")


def _policy_from_migration(path: Path) -> MigrationPolicy:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except (OSError, SyntaxError) as exc:
        raise PreflightPolicyError(f"{path.name}: cannot read migration") from exc

    revision = _literal_assignment(tree, "revision", path)
    policy = _literal_assignment(tree, "EMPLOYEE_AUTO_DEPLOY_POLICY", path)
    if not isinstance(revision, str) or not isinstance(policy, dict):
        raise PreflightPolicyError(f"{path.name}: invalid automatic deployment policy")

    kind = policy.get("kind")
    allowed_tables = policy.get("allowed_tables", [])
    validator_sql = policy.get("validator_sql")
    validator_expected = policy.get("validator_expected")
    if kind not in VALID_POLICY_KINDS:
        raise PreflightPolicyError(f"{path.name}: invalid policy kind {kind!r}")
    if not isinstance(allowed_tables, list) or not all(
        isinstance(table, str) and table for table in allowed_tables
    ):
        raise PreflightPolicyError(f"{path.name}: allowed_tables must be a string list")
    if kind == "data-change" and (
        not isinstance(validator_sql, str) or not validator_sql.strip() or "validator_expected" not in policy
    ):
        raise PreflightPolicyError(f"{path.name}: data-change policy requires validator_sql and validator_expected")
    if kind != "data-change" and (validator_sql is not None or "validator_expected" in policy):
        raise PreflightPolicyError(f"{path.name}: only data-change policy may declare a validator")
    return MigrationPolicy(
        revision=revision,
        kind=kind,
        allowed_tables=frozenset(allowed_tables),
        validator_sql=validator_sql,
        validator_expected=validator_expected,
    )


def load_changed_migration_policies(source_dir: Path, target_dir: Path) -> tuple[MigrationPolicy, ...]:
    """Return contracts for every changed migration, rejecting missing declarations."""
    removed = sorted(path.name for path in target_dir.glob("*.py") if not (source_dir / path.name).is_file())
    if removed:
        raise PreflightPolicyError(f"employee migration files would be removed: {', '.join(removed)}")
    changed = [
        path
        for path in sorted(source_dir.glob("*.py"))
        if not (target_dir / path.name).is_file()
        or path.read_bytes() != (target_dir / path.name).read_bytes()
    ]
    if not changed:
        raise PreflightPolicyError("schema change has no changed Alembic migration policy")
    return tuple(_policy_from_migration(path) for path in changed)


def _normalise_value(value: Any) -> Any:
    if isinstance(value, bytes):
        return {"bytes": value.hex()}
    return value


def _table_names(connection: sqlite3.Connection) -> list[str]:
    return [
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        if row[0] not in IGNORED_TABLES
    ]


def _table_columns(connection: sqlite3.Connection, table: str) -> tuple[str, ...]:
    return tuple(row[1] for row in connection.execute(f"PRAGMA table_info({_quote_identifier(table)})"))


def _snapshot_table(
    connection: sqlite3.Connection, table: str, columns: tuple[str, ...]
) -> TableSnapshot:
    selected_columns = ", ".join(_quote_identifier(column) for column in columns)
    order_by = ", ".join(_quote_identifier(column) for column in columns)
    digest = hashlib.sha256()
    row_count = 0
    for row in connection.execute(
        f"SELECT {selected_columns} FROM {_quote_identifier(table)} ORDER BY {order_by}"
    ):
        payload = json.dumps([_normalise_value(value) for value in row], ensure_ascii=True, separators=(",", ":"))
        digest.update(payload.encode("utf-8"))
        digest.update(b"\n")
        row_count += 1
    return TableSnapshot(columns=columns, row_count=row_count, digest=digest.hexdigest())


def snapshot_existing_rows(database: Path) -> dict[str, TableSnapshot]:
    """Fingerprint every employee-owned table before a candidate migration."""
    with sqlite3.connect(database) as connection:
        return {
            table: _snapshot_table(connection, table, _table_columns(connection, table))
            for table in _table_names(connection)
        }


def assert_existing_rows_unchanged(
    database: Path,
    before: dict[str, TableSnapshot],
    allowed_tables: frozenset[str],
) -> None:
    """Reject changed rows outside the explicit data-change allowance."""
    with sqlite3.connect(database) as connection:
        current_tables = set(_table_names(connection))
        for table, snapshot in before.items():
            if table in allowed_tables:
                continue
            if table not in current_tables:
                raise PreflightDataError(f"{table}: existing table was removed")
            current_columns = _table_columns(connection, table)
            if not set(snapshot.columns).issubset(current_columns):
                raise PreflightDataError(f"{table}: existing column was removed")
            current = _snapshot_table(connection, table, snapshot.columns)
            if current != snapshot:
                raise PreflightDataError(f"{table}: existing employee rows changed")


def assert_policy_validators(database: Path, policies: Iterable[MigrationPolicy]) -> None:
    """Run each declared data-change query against the migrated snapshot."""
    with sqlite3.connect(database) as connection:
        for policy in policies:
            if policy.validator_sql is None:
                continue
            row = connection.execute(policy.validator_sql).fetchone()
            actual = None if row is None else row[0] if len(row) == 1 else tuple(row)
            if actual != policy.validator_expected:
                raise PreflightDataError(
                    f"{policy.revision}: validator expected {policy.validator_expected!r}, got {actual!r}"
                )


def _copy_verified_snapshot(source: Path, runtime_root: Path) -> Path:
    if not source.is_file():
        raise PreflightError(f"employee database not found: {source}")
    snapshot_dir = runtime_root / "preflight"
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    snapshot = snapshot_dir / f"mes_preflight_{datetime.now():%Y%m%d_%H%M%S}.db"
    with sqlite3.connect(source) as source_connection, sqlite3.connect(snapshot) as destination_connection:
        source_connection.backup(destination_connection)
    with sqlite3.connect(snapshot) as connection:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()
    if integrity != ("ok",):
        raise PreflightError(f"snapshot integrity check failed: {integrity}")
    return snapshot.resolve()


def _run_checked(command: list[str], working_directory: Path, environment: dict[str, str]) -> None:
    result = subprocess.run(command, cwd=working_directory, env=environment, text=True, capture_output=True)
    if result.stdout:
        print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)
    if result.returncode:
        raise PreflightError(f"{' '.join(command[1:])} failed (exit {result.returncode})")


def run_preflight(args: argparse.Namespace) -> Path:
    """Migrate only an isolated backup and prove its declared data contract."""
    policies = load_changed_migration_policies(args.source_migrations, args.target_migrations)
    snapshot = _copy_verified_snapshot(args.employee_db, args.runtime_root)
    print(f"PREFLIGHT_SNAPSHOT={snapshot}")
    before = snapshot_existing_rows(snapshot)
    environment = os.environ.copy()
    environment["DATABASE_URL"] = f"sqlite:///{snapshot.as_posix()}"
    backend = args.backend_dir.resolve()
    _run_checked([sys.executable, "bootstrap_db.py", "--migrate"], backend, environment)
    _run_checked([sys.executable, "bootstrap_db.py", "--check"], backend, environment)
    _run_checked(
        [sys.executable, str(args.verify_tool.resolve()), "--database", str(snapshot)],
        backend,
        environment,
    )
    _run_checked(
        [sys.executable, str(args.inventory_tool.resolve()), "--db-url", environment["DATABASE_URL"]],
        backend,
        environment,
    )
    allowed_tables = frozenset().union(*(policy.allowed_tables for policy in policies))
    assert_existing_rows_unchanged(snapshot, before, allowed_tables)
    assert_policy_validators(snapshot, policies)
    print("PREFLIGHT_RESULT=PASS")
    return snapshot


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Preflight employee schema sync on an isolated SQLite snapshot")
    parser.add_argument("--employee-db", required=True, type=Path)
    parser.add_argument("--backend-dir", required=True, type=Path)
    parser.add_argument("--runtime-root", required=True, type=Path)
    parser.add_argument("--source-migrations", required=True, type=Path)
    parser.add_argument("--target-migrations", required=True, type=Path)
    parser.add_argument("--verify-tool", required=True, type=Path)
    parser.add_argument("--inventory-tool", required=True, type=Path)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    try:
        run_preflight(parse_args(argv))
    except PreflightError as exc:
        print(f"PREFLIGHT_RESULT=BLOCKED\nPREFLIGHT_ERROR={exc}", file=sys.stderr)
        return 9
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
