#!/usr/bin/env python3
"""Issue and verify one bounded modern-0036 to Friday-0033 cutover admission.

The admission is evidence only. It never installs a database, rewrites a version,
starts a service, or weakens either code line's public FULL backup verifier.
"""

from __future__ import annotations

import argparse
from collections import Counter
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
from typing import Any
import uuid


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.ops import backup_manifest  # noqa: E402
from scripts.ops.project_legacy_effects import (  # noqa: E402
    assert_unplaced_equivalence,
    project_effect,
)


ADMISSION_CONTRACT = "friday-profile-cutover-admission/v1"
RECOVERY_CONTRACT = "friday-profile-recovery/v1"
CUTOVER_PROFILE = "modern-0036-to-friday-0033-latest-data"
FRIDAY_PROFILE = "friday-0033"
MODERN_REVISION = "20260911_0036"
FRIDAY_REVISION = "20260910_0033"
SCHEMA_TABLES = frozenset({"alembic_version", "alembic_schema_state"})
APPROVED_SOURCE_ONLY_TABLES = frozenset(
    {
        "operator_sessions",
        "shipping_command_receipts",
        "warehouse_unplaced_items",
    }
)
APPROVED_SOURCE_ONLY_COLUMNS = {
    "admin_audit_logs": frozenset({"bootstrap_employee_id"}),
    "employees": frozenset({"pin_requires_change"}),
    "io_batches": frozenset({"request_fingerprint"}),
    "shipping_request_events": frozenset(
        {"actor_employee_code", "actor_employee_id", "actor_name"}
    ),
    "stock_requests": frozenset({"request_fingerprint"}),
}
VALIDATOR_ANCHORS = (
    "scripts/ops/_verify_backup.py",
    "scripts/ops/backup_manifest.py",
    "scripts/ops/backup_retention.py",
    "scripts/ops/check_inventory_integrity.py",
    "scripts/ops/durable_file.py",
    "scripts/ops/recovery_owner.py",
    "scripts/runtime_paths.py",
    "backend/alembic.ini",
    "backend/migration_type_compare.py",
    "backend/bootstrap/schema.py",
    "backend/app/services/inventory_integrity.py",
    "backend/app/schemas/inventory_integrity.py",
)
VALIDATOR_TREES = (
    "backend/app",
    "backend/bootstrap",
    "backend/alembic",
)


class CutoverAdmissionError(RuntimeError):
    """The one-shot cutover evidence does not prove every required boundary."""


def _physical(path: Path, *, require_file: bool = False) -> Path:
    """Resolve a local path and reject aliases across every existing ancestor."""

    absolute = path.expanduser().absolute()
    for entry in (absolute, *absolute.parents):
        if not entry.exists():
            continue
        if entry.is_symlink() or (
            hasattr(entry, "is_junction") and entry.is_junction()
        ):
            raise CutoverAdmissionError(f"linked paths are not allowed: {entry}")
    resolved = absolute.resolve()
    if require_file and not resolved.is_file():
        raise CutoverAdmissionError(f"required file is missing: {resolved}")
    return resolved


def _sha256(path: Path) -> str:
    return backup_manifest.file_sha256(path)


def _valid_sha256(value: object) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value.lower())
    )


def validator_bundle_sha256(code_root: Path) -> str:
    """Hash the complete Python closure allowed to influence public FULL validation."""

    root = _physical(code_root)
    anchors = [root / relative for relative in VALIDATOR_ANCHORS]
    missing = [
        str(path)
        for path in anchors
        if not path.is_file() or path.stat().st_size <= 0
    ]
    if missing:
        raise CutoverAdmissionError(
            "validator bundle is incomplete: " + ", ".join(missing)
        )
    files = set(anchors)
    for relative in VALIDATOR_TREES:
        tree = root / relative
        if not tree.is_dir():
            raise CutoverAdmissionError(f"validator tree is missing: {tree}")
        files.update(path for path in tree.rglob("*.py") if "__pycache__" not in path.parts)
    digest = hashlib.sha256()
    for path in sorted(files, key=lambda candidate: candidate.relative_to(root).as_posix()):
        physical = _physical(path, require_file=True)
        relative = physical.relative_to(root).as_posix().encode("utf-8")
        digest.update(len(relative).to_bytes(4, "big"))
        digest.update(relative)
        digest.update(path.stat().st_size.to_bytes(8, "big"))
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
    return digest.hexdigest()


def _require_validator_bundle_unchanged(
    code_root: Path,
    *,
    expected_sha256: str,
    label: str,
) -> None:
    """Fail if public validation did not run within one pinned code generation."""

    if validator_bundle_sha256(code_root) != expected_sha256:
        raise CutoverAdmissionError(
            f"{label} validator bundle changed during validation"
        )


def _manifest(path: Path) -> dict[str, object]:
    receipt = backup_manifest.verify_manifest_receipt(
        path,
        expected_engine="sqlite",
    )
    if receipt.status is not backup_manifest.BackupStatus.PASS or receipt.manifest is None:
        raise CutoverAdmissionError(
            "FULL backup receipt is invalid: " + "; ".join(receipt.errors)
        )
    return receipt.manifest


def _require_manifest_profile(
    manifest: dict[str, object],
    *,
    revision: str,
    friday_profile: bool,
) -> None:
    database = manifest.get("database")
    verification = manifest.get("verification")
    inventory = (
        verification.get("inventory") if isinstance(verification, dict) else None
    )
    if (
        not isinstance(database, dict)
        or database.get("alembic_revision") != revision
        or not isinstance(verification, dict)
        or verification.get("status") != backup_manifest.BackupStatus.PASS.value
    ):
        raise CutoverAdmissionError(f"FULL manifest is not revision {revision}")
    if friday_profile and (
        not isinstance(inventory, dict)
        or inventory.get("profile") != FRIDAY_PROFILE
    ):
        raise CutoverAdmissionError(
            f"Friday FULL manifest must declare inventory profile={FRIDAY_PROFILE}"
        )


def _run_public_full_validator(
    code_root: Path,
    artifact: Path,
    *,
    source_path: Path | None = None,
    label: str,
) -> None:
    """Run the pinned code line's public verifier rather than importing its helpers."""

    verifier = code_root / "scripts" / "ops" / "_verify_backup.py"
    command = [sys.executable, "-I", "-B", str(verifier), str(artifact)]
    if source_path is not None:
        command.extend(["--source-db", str(source_path)])
    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    environment.pop("PYTHONHOME", None)
    result = subprocess.run(
        command,
        cwd=code_root,
        text=True,
        capture_output=True,
        check=False,
        env=environment,
    )
    lines = {line.strip() for line in result.stdout.splitlines() if line.strip()}
    if result.returncode != 0 or "BACKUP_STATUS=PASS" not in lines:
        detail = (result.stderr or result.stdout).strip()
        raise CutoverAdmissionError(f"{label} FULL validation failed: {detail}")


def _run_public_database_validator(
    code_root: Path,
    database: Path,
    *,
    label: str,
) -> None:
    """Run the pinned code line's public live-database validator."""

    verifier = code_root / "scripts" / "ops" / "_verify_backup.py"
    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    environment.pop("PYTHONHOME", None)
    result = subprocess.run(
        [sys.executable, "-I", "-B", str(verifier), "--database", str(database)],
        cwd=code_root,
        text=True,
        capture_output=True,
        check=False,
        env=environment,
    )
    lines = {line.strip() for line in result.stdout.splitlines() if line.strip()}
    if result.returncode != 0 or "DATABASE_STATUS=PASS" not in lines:
        detail = (result.stderr or result.stdout).strip()
        raise CutoverAdmissionError(f"{label} database validation failed: {detail}")


def _read_only(path: Path) -> sqlite3.Connection:
    for suffix in ("-wal", "-journal"):
        sidecar = Path(f"{path}{suffix}")
        if sidecar.exists() and sidecar.stat().st_size:
            raise CutoverAdmissionError(
                "conversion comparison requires checkpointed offline artifacts"
            )
    connection = sqlite3.connect(path.as_uri() + "?mode=ro&immutable=1", uri=True)
    connection.execute("PRAGMA query_only=ON")
    connection.execute("BEGIN")
    return connection


def _read_complete_snapshot(path: Path) -> sqlite3.Connection:
    """Read one WAL-aware snapshot without accepting a commit during comparison."""

    connection = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
    connection.execute("PRAGMA query_only=ON")
    connection.execute("BEGIN")
    connection.execute("SELECT 1 FROM sqlite_master LIMIT 1").fetchone()
    return connection


def _logical_snapshot_identity(path: Path, *, label: str) -> dict[str, object]:
    """Reuse the backup manifest's complete schema and business-row identity."""

    try:
        with backup_manifest.readonly_connection(
            backup_manifest._database_url_for_sqlite(path)
        ) as connection:
            connection.exec_driver_sql("BEGIN")
            try:
                return backup_manifest._snapshot_identity(connection)
            finally:
                connection.rollback()
    except Exception as exc:
        raise CutoverAdmissionError(
            f"{label} logical snapshot validation failed: {exc}"
        ) from exc


def _sqlite_sequence_state(connection: sqlite3.Connection) -> tuple[tuple[object, ...], ...]:
    exists = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'"
    ).fetchone()
    if exists is None:
        return ()
    return tuple(sorted(connection.execute("SELECT name, seq FROM sqlite_sequence").fetchall()))


def _quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _shapes(connection: sqlite3.Connection) -> dict[str, list[str]]:
    tables = connection.execute(
        "SELECT name FROM sqlite_master "
        "WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()
    return {
        name: [
            row[1]
            for row in connection.execute(f"PRAGMA table_info({_quote(name)})")
        ]
        for name, in tables
    }


def _rows(
    connection: sqlite3.Connection,
    table: str,
    columns: list[str],
) -> list[tuple[Any, ...]]:
    projection = ",".join(_quote(column) for column in columns)
    return connection.execute(
        f"SELECT {projection} FROM {_quote(table)}"
    ).fetchall()


def _json_value(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, bytes):
        return {"sqlite_blob_hex": value.hex()}
    if isinstance(value, float):
        return {"sqlite_float_hex": value.hex()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    if isinstance(value, dict):
        return {
            str(key): _json_value(item)
            for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))
        }
    raise CutoverAdmissionError(
        f"unsupported SQLite value type: {type(value).__name__}"
    )


def _row_hashes(rows: list[tuple[Any, ...]]) -> Counter[str]:
    return Counter(
        hashlib.sha256(
            json.dumps(
                _json_value(row),
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()
        for row in rows
    )


def _dropped_projection_evidence(
    connection: sqlite3.Connection,
    *,
    table: str,
    columns: list[str],
) -> dict[str, object]:
    """Bind intentionally omitted source values without copying them into Friday."""

    rows = _rows(connection, table, columns)
    row_hashes = _row_hashes(rows)
    digest = hashlib.sha256(
        json.dumps(
            sorted(row_hashes.items()),
            ensure_ascii=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    return {
        "table": table,
        "columns": columns,
        "row_count": len(rows),
        "row_multiset_sha256": digest,
    }


def _parse_effect(raw: Any) -> Any:
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise CutoverAdmissionError("inventory_effect must be JSON text or null")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise CutoverAdmissionError("inventory_effect JSON is invalid") from exc


def _effect_row_item_id(
    source: sqlite3.Connection,
    *,
    table: str,
    id_column: str,
    row_id: Any,
) -> str:
    if not isinstance(row_id, str):
        raise CutoverAdmissionError("effect row binding requires a UUID row_id")
    try:
        stored_id = uuid.UUID(row_id).hex
    except ValueError as exc:
        raise CutoverAdmissionError(
            "effect row binding requires a UUID row_id"
        ) from exc
    row = source.execute(
        f"SELECT item_id FROM {_quote(table)} WHERE {_quote(id_column)}=?",
        (stored_id,),
    ).fetchone()
    if row is None:
        raise CutoverAdmissionError("effect row binding does not identify a stock row")
    return str(row[0])


def _assert_effect_binding(
    source: sqlite3.Connection,
    *,
    item_id: str,
    effect: list[dict[str, Any]],
) -> None:
    scopes = {
        "warehouse": ("inventory", "inventory_id"),
        "warehouse_unplaced": ("warehouse_unplaced_items", "id"),
    }
    resolved: list[str] = []
    for scope, (table, id_column) in scopes.items():
        cells = [cell for cell in effect if cell.get("scope") == scope]
        if len(cells) != 1:
            raise CutoverAdmissionError(
                "effect row binding requires a unique W/U pair"
            )
        resolved.append(
            _effect_row_item_id(
                source,
                table=table,
                id_column=id_column,
                row_id=cells[0].get("row_id"),
            )
        )
    if any(resolved_item != item_id for resolved_item in resolved):
        raise CutoverAdmissionError(
            "effect row binding item does not match transaction log"
        )


def _transaction_projection(
    source: sqlite3.Connection,
    candidate: sqlite3.Connection,
    columns: list[str],
) -> tuple[Counter[str], Counter[str], int]:
    effect_index = columns.index("inventory_effect")
    item_index = columns.index("item_id")
    expected: list[tuple[Any, ...]] = []
    converted = 0
    for row in _rows(source, "transaction_logs", columns):
        values = list(row)
        original = _parse_effect(values[effect_index])
        if original is None:
            projected = None
        else:
            try:
                projected = project_effect(original)
            except (TypeError, ValueError) as exc:
                raise CutoverAdmissionError(str(exc)) from exc
            if projected != original:
                if not isinstance(original, list):
                    raise CutoverAdmissionError("inventory effect must be a cell list")
                _assert_effect_binding(
                    source,
                    item_id=str(values[item_index]),
                    effect=original,
                )
                converted += 1
        values[effect_index] = projected
        expected.append(tuple(values))
    actual = []
    for row in _rows(candidate, "transaction_logs", columns):
        values = list(row)
        values[effect_index] = _parse_effect(values[effect_index])
        actual.append(tuple(values))
    return _row_hashes(expected), _row_hashes(actual), converted


def _assert_integrity(connection: sqlite3.Connection, *, label: str) -> None:
    if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
        raise CutoverAdmissionError(f"{label} SQLite integrity failed")
    if connection.execute("PRAGMA foreign_key_check").fetchall():
        raise CutoverAdmissionError(f"{label} foreign key validation failed")


def compare_conversion_data(
    original_path: Path,
    candidate_path: Path,
) -> dict[str, object]:
    """Recompute the exact approved cross-schema projection from actual DB rows."""

    original = _physical(original_path, require_file=True)
    candidate = _physical(candidate_path, require_file=True)
    initial_hashes = (_sha256(original), _sha256(candidate))
    with closing(_read_only(original)) as source, closing(_read_only(candidate)) as target:
        _assert_integrity(source, label="modern original")
        _assert_integrity(target, label="Friday candidate")
        source_shapes = _shapes(source)
        target_shapes = _shapes(target)
        if "warehouse_unplaced_items" not in source_shapes:
            raise CutoverAdmissionError("modern original is missing warehouse_unplaced_items")
        if "warehouse_unplaced_items" in target_shapes:
            raise CutoverAdmissionError("Friday candidate must not contain a live U table")
        source_only_tables = set(source_shapes) - set(target_shapes)
        unapproved_tables = source_only_tables - APPROVED_SOURCE_ONLY_TABLES
        if unapproved_tables:
            raise CutoverAdmissionError(
                "unapproved source-only tables: " + ", ".join(sorted(unapproved_tables))
            )
        missing_approved_tables = APPROVED_SOURCE_ONLY_TABLES - source_only_tables
        if missing_approved_tables:
            raise CutoverAdmissionError(
                "approved source-only tables are missing: "
                + ", ".join(sorted(missing_approved_tables))
            )
        actual_source_only_columns: dict[str, frozenset[str]] = {}
        for table in sorted(set(source_shapes) & set(target_shapes)):
            source_only_columns = frozenset(
                set(source_shapes[table]) - set(target_shapes[table])
            )
            if source_only_columns:
                actual_source_only_columns[table] = source_only_columns
        unapproved_columns = {
            table: columns - APPROVED_SOURCE_ONLY_COLUMNS.get(table, frozenset())
            for table, columns in actual_source_only_columns.items()
            if columns - APPROVED_SOURCE_ONLY_COLUMNS.get(table, frozenset())
        }
        if unapproved_columns:
            detail = ", ".join(
                f"{table}.{column}"
                for table, columns in sorted(unapproved_columns.items())
                for column in sorted(columns)
            )
            raise CutoverAdmissionError("unapproved source-only columns: " + detail)
        missing_approved_columns = {
            table: columns - actual_source_only_columns.get(table, frozenset())
            for table, columns in APPROVED_SOURCE_ONLY_COLUMNS.items()
            if columns - actual_source_only_columns.get(table, frozenset())
        }
        if missing_approved_columns:
            detail = ", ".join(
                f"{table}.{column}"
                for table, columns in sorted(missing_approved_columns.items())
                for column in sorted(columns)
            )
            raise CutoverAdmissionError("approved source-only columns are missing: " + detail)
        placed_rows = sum(
            source.execute(f"SELECT count(*) FROM {_quote(table)}").fetchone()[0]
            for table in (
                "warehouse_box_items",
                "warehouse_special_zone_items",
                "warehouse_special_zones",
            )
        )
        try:
            assert_unplaced_equivalence(
                source.execute(
                    "SELECT item_id,warehouse_qty FROM inventory"
                ).fetchall(),
                source.execute(
                    "SELECT item_id,quantity FROM warehouse_unplaced_items"
                ).fetchall(),
                placed_rows=placed_rows,
            )
        except ValueError as exc:
            raise CutoverAdmissionError(str(exc)) from exc

        source_evidence: list[dict[str, object]] = []
        target_evidence: list[dict[str, object]] = []
        dropped_table_evidence = [
            _dropped_projection_evidence(
                source,
                table=table,
                columns=source_shapes[table],
            )
            for table in sorted(source_only_tables)
        ]
        dropped_column_evidence = [
            _dropped_projection_evidence(
                source,
                table=table,
                columns=sorted(columns),
            )
            for table, columns in sorted(actual_source_only_columns.items())
        ]
        converted_logs = 0
        business_tables = sorted(set(target_shapes) - SCHEMA_TABLES)
        for table in business_tables:
            columns = target_shapes[table]
            if table not in source_shapes:
                raise CutoverAdmissionError(f"modern original is missing table: {table}")
            missing_columns = sorted(set(columns) - set(source_shapes[table]))
            if missing_columns:
                raise CutoverAdmissionError(
                    f"modern original is missing columns: {table}: {missing_columns}"
                )
            if table == "transaction_logs":
                if not {"item_id", "inventory_effect"}.issubset(columns):
                    raise CutoverAdmissionError(
                        "transaction_logs projection columns are incomplete"
                    )
                expected, actual, converted = _transaction_projection(
                    source,
                    target,
                    columns,
                )
                converted_logs += converted
            else:
                expected = _row_hashes(_rows(source, table, columns))
                actual = _row_hashes(_rows(target, table, columns))
            if expected != actual:
                raise CutoverAdmissionError(f"conversion data mismatch: {table}")
            source_evidence.append(
                {
                    "table": table,
                    "columns": columns,
                    "rows": sorted(expected.items()),
                }
            )
            target_evidence.append(
                {
                    "table": table,
                    "columns": columns,
                    "rows": sorted(actual.items()),
                }
            )
    if (_sha256(original), _sha256(candidate)) != initial_hashes:
        raise CutoverAdmissionError("conversion inputs changed during comparison")
    source_hash = hashlib.sha256(
        json.dumps(source_evidence, ensure_ascii=True, separators=(",", ":")).encode()
    ).hexdigest()
    candidate_hash = hashlib.sha256(
        json.dumps(target_evidence, ensure_ascii=True, separators=(",", ":")).encode()
    ).hexdigest()
    if source_hash != candidate_hash:
        raise CutoverAdmissionError("conversion data mismatch")
    return {
        "source_projection_sha256": source_hash,
        "candidate_projection_sha256": candidate_hash,
        "table_count": len(source_evidence),
        "converted_log_count": converted_logs,
        "dropped_table_evidence": dropped_table_evidence,
        "dropped_column_evidence": dropped_column_evidence,
    }


def compare_exact_database(
    source_path: Path,
    installed_path: Path,
    *,
    label: str = "modern recovery",
) -> str:
    """Prove an installed database preserves every row from its admitted FULL source."""

    source = _physical(source_path, require_file=True)
    installed = _physical(installed_path, require_file=True)
    with (
        closing(_read_complete_snapshot(source)) as expected,
        closing(_read_complete_snapshot(installed)) as actual,
    ):
        initial_generations = (
            backup_manifest.sqlite_file_generation(source),
            backup_manifest.sqlite_file_generation(installed),
        )
        expected_identity = _logical_snapshot_identity(
            source,
            label=f"{label} FULL source",
        )
        actual_identity = _logical_snapshot_identity(installed, label=label)
        if expected_identity["schema_fingerprint"] != actual_identity["schema_fingerprint"]:
            raise CutoverAdmissionError(f"{label} schema does not match FULL source")
        _assert_integrity(expected, label=f"{label} FULL source")
        _assert_integrity(actual, label=label)
        expected_shapes = _shapes(expected)
        actual_shapes = _shapes(actual)
        if expected_shapes != actual_shapes:
            raise CutoverAdmissionError(f"{label} schema does not match FULL source")
        evidence: list[dict[str, object]] = []
        for table, columns in sorted(expected_shapes.items()):
            expected_rows = _row_hashes(_rows(expected, table, columns))
            actual_rows = _row_hashes(_rows(actual, table, columns))
            if expected_rows != actual_rows:
                raise CutoverAdmissionError(
                    f"{label} data does not match FULL source: {table}"
                )
            evidence.append(
                {
                    "table": table,
                    "columns": columns,
                    "rows": sorted(expected_rows.items()),
                }
            )
        if _sqlite_sequence_state(expected) != _sqlite_sequence_state(actual):
            raise CutoverAdmissionError(
                f"{label} sqlite_sequence does not match FULL source"
            )
        if (
            backup_manifest.sqlite_file_generation(source),
            backup_manifest.sqlite_file_generation(installed),
        ) != initial_generations:
            raise CutoverAdmissionError(f"{label} inputs changed during comparison")
    logical_keys = ("data_revision", "oracle_hash", "snapshot_hash")
    if any(expected_identity[key] != actual_identity[key] for key in logical_keys):
        raise CutoverAdmissionError(f"{label} logical snapshot does not match FULL source")
    return hashlib.sha256(
        json.dumps(evidence, ensure_ascii=True, separators=(",", ":")).encode()
    ).hexdigest()


def _validate_full_inputs(
    *,
    candidate: Path,
    original: Path,
    target: Path,
    modern_root: Path,
    friday_root: Path,
    recovery: bool = False,
) -> tuple[dict[str, object], dict[str, object]]:
    original_manifest = _manifest(original)
    candidate_manifest = _manifest(candidate)
    _require_manifest_profile(
        original_manifest,
        revision=MODERN_REVISION,
        friday_profile=False,
    )
    _require_manifest_profile(
        candidate_manifest,
        revision=FRIDAY_REVISION,
        friday_profile=True,
    )
    _run_public_full_validator(
        modern_root,
        original,
        source_path=None if recovery else target,
        label="modern FULL" if recovery else "modern FULL freshness",
    )
    _run_public_full_validator(
        friday_root,
        candidate,
        label="Friday FULL",
    )
    if recovery:
        compare_exact_database(
            candidate,
            target,
            label="installed Friday target",
        )
    return original_manifest, candidate_manifest


def _manifest_snapshot_hash(manifest: dict[str, object]) -> str:
    database = manifest.get("database")
    value = database.get("snapshot_hash") if isinstance(database, dict) else None
    if not _valid_sha256(value):
        raise CutoverAdmissionError("FULL manifest snapshot hash is invalid")
    return str(value).lower()


def create_admission(
    *,
    candidate_path: Path,
    original_path: Path,
    target_path: Path,
    modern_validator_root: Path,
    friday_validator_root: Path,
    trusted_modern_validator_sha256: str,
    trusted_friday_validator_sha256: str,
    output_path: Path,
) -> dict[str, object]:
    """Validate both code lines and write one immutable one-shot admission receipt."""

    candidate = _physical(candidate_path, require_file=True)
    original = _physical(original_path, require_file=True)
    target = _physical(target_path, require_file=True)
    modern_root = _physical(modern_validator_root)
    friday_root = _physical(friday_validator_root)
    output = _physical(output_path)
    if output.exists():
        raise CutoverAdmissionError(f"admission output already exists: {output}")
    modern_hash = validator_bundle_sha256(modern_root)
    friday_hash = validator_bundle_sha256(friday_root)
    if modern_hash != trusted_modern_validator_sha256.lower():
        raise CutoverAdmissionError("modern validator bundle hash mismatch")
    if friday_hash != trusted_friday_validator_sha256.lower():
        raise CutoverAdmissionError("Friday validator bundle hash mismatch")
    original_manifest, candidate_manifest = _validate_full_inputs(
        candidate=candidate,
        original=original,
        target=target,
        modern_root=modern_root,
        friday_root=friday_root,
    )
    _require_validator_bundle_unchanged(
        modern_root,
        expected_sha256=modern_hash,
        label="modern",
    )
    _require_validator_bundle_unchanged(
        friday_root,
        expected_sha256=friday_hash,
        label="Friday",
    )
    conversion = compare_conversion_data(original, candidate)
    receipt: dict[str, object] = {
        "contract": ADMISSION_CONTRACT,
        "profile": CUTOVER_PROFILE,
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "target_path": str(target),
        "candidate": {
            "artifact_sha256": _sha256(candidate),
            "manifest_sha256": _sha256(backup_manifest.manifest_path_for(candidate)),
            "snapshot_hash": _manifest_snapshot_hash(candidate_manifest),
            "revision": FRIDAY_REVISION,
        },
        "original": {
            "artifact_sha256": _sha256(original),
            "manifest_sha256": _sha256(backup_manifest.manifest_path_for(original)),
            "snapshot_hash": _manifest_snapshot_hash(original_manifest),
            "revision": MODERN_REVISION,
        },
        "validators": {
            "modern_root": str(modern_root),
            "modern_bundle_sha256": modern_hash,
            "friday_bundle_sha256": friday_hash,
        },
        "validation": {
            "modern_full": "PASS",
            "friday_full": "PASS",
            "original_freshness": "PASS",
        },
        "conversion": conversion,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("xb") as stream:
        stream.write(
            json.dumps(
                receipt,
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            ).encode("utf-8")
            + b"\n"
        )
        stream.flush()
        os.fsync(stream.fileno())
    return receipt


def _load_admission(path: Path) -> dict[str, object]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise CutoverAdmissionError("cutover admission JSON is invalid") from exc
    if (
        not isinstance(payload, dict)
        or payload.get("contract") != ADMISSION_CONTRACT
        or payload.get("profile") != CUTOVER_PROFILE
    ):
        raise CutoverAdmissionError("cutover admission contract is invalid")
    return payload


def _receipt_section(
    receipt: dict[str, object],
    name: str,
) -> dict[str, object]:
    value = receipt.get(name)
    if not isinstance(value, dict):
        raise CutoverAdmissionError(f"cutover admission {name} section is invalid")
    return value


def verify_admission(
    *,
    receipt_path: Path,
    expected_receipt_sha256: str,
    candidate_path: Path,
    original_path: Path,
    target_path: Path,
    friday_validator_root: Path,
    recovery: bool = False,
) -> dict[str, object]:
    """Recompute every one-shot condition immediately before cutover or recovery."""

    receipt_file = _physical(receipt_path, require_file=True)
    if not _valid_sha256(expected_receipt_sha256):
        raise CutoverAdmissionError("trusted admission SHA-256 is invalid")
    if _sha256(receipt_file) != expected_receipt_sha256.lower():
        raise CutoverAdmissionError("cutover admission SHA-256 mismatch")
    receipt = _load_admission(receipt_file)
    candidate = _physical(candidate_path, require_file=True)
    original = _physical(original_path, require_file=True)
    target = _physical(target_path, require_file=True)
    friday_root = _physical(friday_validator_root)
    candidate_section = _receipt_section(receipt, "candidate")
    original_section = _receipt_section(receipt, "original")
    validators = _receipt_section(receipt, "validators")
    recorded_modern_root = validators.get("modern_root")
    if not isinstance(recorded_modern_root, str):
        raise CutoverAdmissionError("modern validator root is invalid")
    modern_root = _physical(Path(recorded_modern_root))
    if receipt.get("target_path") != str(target):
        raise CutoverAdmissionError("cutover target path mismatch")
    if candidate_section.get("artifact_sha256") != _sha256(candidate):
        raise CutoverAdmissionError("candidate artifact hash mismatch")
    if candidate_section.get("manifest_sha256") != _sha256(
        _physical(backup_manifest.manifest_path_for(candidate), require_file=True)
    ):
        raise CutoverAdmissionError("candidate manifest hash mismatch")
    if original_section.get("artifact_sha256") != _sha256(original):
        raise CutoverAdmissionError("original artifact hash mismatch")
    if original_section.get("manifest_sha256") != _sha256(
        _physical(backup_manifest.manifest_path_for(original), require_file=True)
    ):
        raise CutoverAdmissionError("original manifest hash mismatch")
    modern_hash = validators.get("modern_bundle_sha256")
    friday_hash = validators.get("friday_bundle_sha256")
    if not _valid_sha256(modern_hash) or validator_bundle_sha256(modern_root) != modern_hash:
        raise CutoverAdmissionError("modern validator bundle hash mismatch")
    if not _valid_sha256(friday_hash) or validator_bundle_sha256(friday_root) != friday_hash:
        raise CutoverAdmissionError("Friday validator bundle hash mismatch")
    original_manifest, candidate_manifest = _validate_full_inputs(
        candidate=candidate,
        original=original,
        target=target,
        modern_root=modern_root,
        friday_root=friday_root,
        recovery=recovery,
    )
    _require_validator_bundle_unchanged(
        modern_root,
        expected_sha256=str(modern_hash),
        label="modern",
    )
    _require_validator_bundle_unchanged(
        friday_root,
        expected_sha256=str(friday_hash),
        label="Friday",
    )
    if original_section.get("snapshot_hash") != _manifest_snapshot_hash(original_manifest):
        raise CutoverAdmissionError("original snapshot hash mismatch")
    if candidate_section.get("snapshot_hash") != _manifest_snapshot_hash(candidate_manifest):
        raise CutoverAdmissionError("candidate snapshot hash mismatch")
    conversion = compare_conversion_data(original, candidate)
    if receipt.get("conversion") != conversion:
        raise CutoverAdmissionError("conversion evidence mismatch")
    validation = _receipt_section(receipt, "validation")
    if validation != {
        "modern_full": "PASS",
        "friday_full": "PASS",
        "original_freshness": "PASS",
    }:
        raise CutoverAdmissionError("cutover validation evidence is incomplete")
    return receipt


def verify_recovery_install(
    *,
    receipt_path: Path,
    expected_receipt_sha256: str,
    original_path: Path,
    installed_path: Path,
) -> str:
    """Post-check a modern recovery copy with its pinned public validator and rows."""

    receipt_file = _physical(receipt_path, require_file=True)
    if not _valid_sha256(expected_receipt_sha256):
        raise CutoverAdmissionError("trusted admission SHA-256 is invalid")
    if _sha256(receipt_file) != expected_receipt_sha256.lower():
        raise CutoverAdmissionError("cutover admission SHA-256 mismatch")
    receipt = _load_admission(receipt_file)
    original = _physical(original_path, require_file=True)
    installed = _physical(installed_path, require_file=True)
    original_section = _receipt_section(receipt, "original")
    validators = _receipt_section(receipt, "validators")
    if original_section.get("artifact_sha256") != _sha256(original):
        raise CutoverAdmissionError("original artifact hash mismatch")
    if original_section.get("manifest_sha256") != _sha256(
        _physical(backup_manifest.manifest_path_for(original), require_file=True)
    ):
        raise CutoverAdmissionError("original manifest hash mismatch")
    recorded_modern_root = validators.get("modern_root")
    modern_hash = validators.get("modern_bundle_sha256")
    if not isinstance(recorded_modern_root, str) or not _valid_sha256(modern_hash):
        raise CutoverAdmissionError("modern validator binding is invalid")
    modern_root = _physical(Path(recorded_modern_root))
    if validator_bundle_sha256(modern_root) != modern_hash:
        raise CutoverAdmissionError("modern validator bundle hash mismatch")
    _run_public_full_validator(
        modern_root,
        original,
        label="modern recovery source FULL",
    )
    _run_public_database_validator(
        modern_root,
        installed,
        label="installed modern recovery",
    )
    _require_validator_bundle_unchanged(
        modern_root,
        expected_sha256=str(modern_hash),
        label="modern",
    )
    return compare_exact_database(original, installed)


def create_recovery_receipt(
    *,
    cutover_receipt_path: Path,
    expected_cutover_receipt_sha256: str,
    original_path: Path,
    target_path: Path,
    installed_snapshot_path: Path,
    output_path: Path,
) -> dict[str, object]:
    """Publish PASS only for the modern DB copy post-checked inside the writer fence."""

    output = _physical(output_path)
    if output.exists():
        raise CutoverAdmissionError(f"recovery output already exists: {output}")
    logical_hash = verify_recovery_install(
        receipt_path=cutover_receipt_path,
        expected_receipt_sha256=expected_cutover_receipt_sha256,
        original_path=original_path,
        installed_path=installed_snapshot_path,
    )
    cutover_receipt = _load_admission(
        _physical(cutover_receipt_path, require_file=True)
    )
    original = _physical(original_path, require_file=True)
    installed = _physical(installed_snapshot_path, require_file=True)
    validators = _receipt_section(cutover_receipt, "validators")
    payload: dict[str, object] = {
        "contract": RECOVERY_CONTRACT,
        "status": "PASS",
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "cutover_admission_sha256": expected_cutover_receipt_sha256.lower(),
        "target_path": str(_physical(target_path)),
        "modern": {
            "artifact_sha256": _sha256(original),
            "manifest_sha256": _sha256(
                _physical(backup_manifest.manifest_path_for(original), require_file=True)
            ),
            "validator_bundle_sha256": validators.get("modern_bundle_sha256"),
        },
        "installed": {
            "logical_projection_sha256": logical_hash,
            "verification_snapshot_sha256": _sha256(installed),
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("xb") as stream:
        stream.write(
            json.dumps(
                payload,
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            ).encode("utf-8")
            + b"\n"
        )
        stream.flush()
        os.fsync(stream.fileno())
    return payload


def verify_recovery_receipt(
    *,
    recovery_receipt_path: Path,
    expected_recovery_receipt_sha256: str,
    cutover_receipt_path: Path,
    expected_cutover_receipt_sha256: str,
    original_path: Path,
    target_path: Path,
) -> dict[str, object]:
    """Verify a recovery receipt against the actual restored modern target."""

    recovery_file = _physical(recovery_receipt_path, require_file=True)
    if not _valid_sha256(expected_recovery_receipt_sha256):
        raise CutoverAdmissionError("trusted recovery receipt SHA-256 is invalid")
    if _sha256(recovery_file) != expected_recovery_receipt_sha256.lower():
        raise CutoverAdmissionError("recovery receipt SHA-256 mismatch")
    try:
        payload = json.loads(recovery_file.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise CutoverAdmissionError("recovery receipt JSON is invalid") from exc
    if (
        not isinstance(payload, dict)
        or payload.get("contract") != RECOVERY_CONTRACT
        or payload.get("status") != "PASS"
        or payload.get("cutover_admission_sha256")
        != expected_cutover_receipt_sha256.lower()
        or payload.get("target_path") != str(_physical(target_path))
    ):
        raise CutoverAdmissionError("recovery receipt contract is invalid")
    modern = _receipt_section(payload, "modern")
    installed = _receipt_section(payload, "installed")
    original = _physical(original_path, require_file=True)
    if modern.get("artifact_sha256") != _sha256(original):
        raise CutoverAdmissionError("recovery receipt modern artifact mismatch")
    if modern.get("manifest_sha256") != _sha256(
        _physical(backup_manifest.manifest_path_for(original), require_file=True)
    ):
        raise CutoverAdmissionError("recovery receipt modern manifest mismatch")
    logical_hash = verify_recovery_install(
        receipt_path=cutover_receipt_path,
        expected_receipt_sha256=expected_cutover_receipt_sha256,
        original_path=original,
        installed_path=target_path,
    )
    if installed.get("logical_projection_sha256") != logical_hash:
        raise CutoverAdmissionError("recovery receipt installed data mismatch")
    cutover = _load_admission(_physical(cutover_receipt_path, require_file=True))
    validators = _receipt_section(cutover, "validators")
    if modern.get("validator_bundle_sha256") != validators.get(
        "modern_bundle_sha256"
    ):
        raise CutoverAdmissionError("recovery receipt validator binding mismatch")
    return payload


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare = subparsers.add_parser("prepare")
    prepare.add_argument("--candidate", type=Path, required=True)
    prepare.add_argument("--original", type=Path, required=True)
    prepare.add_argument("--target", type=Path, required=True)
    prepare.add_argument("--modern-validator-root", type=Path, required=True)
    prepare.add_argument("--friday-validator-root", type=Path, required=True)
    prepare.add_argument("--trusted-modern-validator-sha256", required=True)
    prepare.add_argument("--trusted-friday-validator-sha256", required=True)
    prepare.add_argument("--output", type=Path, required=True)
    verify = subparsers.add_parser("verify")
    verify.add_argument("--receipt", type=Path, required=True)
    verify.add_argument("--receipt-sha256", required=True)
    verify.add_argument("--candidate", type=Path, required=True)
    verify.add_argument("--original", type=Path, required=True)
    verify.add_argument("--target", type=Path, required=True)
    verify.add_argument("--friday-validator-root", type=Path, required=True)
    verify.add_argument("--recovery", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.command == "prepare":
        create_admission(
            candidate_path=args.candidate,
            original_path=args.original,
            target_path=args.target,
            modern_validator_root=args.modern_validator_root,
            friday_validator_root=args.friday_validator_root,
            trusted_modern_validator_sha256=args.trusted_modern_validator_sha256,
            trusted_friday_validator_sha256=args.trusted_friday_validator_sha256,
            output_path=args.output,
        )
        receipt = args.output
    else:
        verify_admission(
            receipt_path=args.receipt,
            expected_receipt_sha256=args.receipt_sha256,
            candidate_path=args.candidate,
            original_path=args.original,
            target_path=args.target,
            friday_validator_root=args.friday_validator_root,
            recovery=args.recovery,
        )
        receipt = args.receipt
    print(
        json.dumps(
            {
                "status": "ADMITTED",
                "profile": CUTOVER_PROFILE,
                "receipt": str(receipt.resolve()),
                "receipt_sha256": _sha256(receipt.resolve()),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except CutoverAdmissionError as error:
        print(f"CUTOVER_ADMISSION=FAIL: {error}", file=sys.stderr)
        raise SystemExit(1) from error
