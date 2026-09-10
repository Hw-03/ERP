"""Create and verify versioned evidence for database backup artifacts."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum
from pathlib import Path
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from bootstrap.schema import check_schema, readonly_connection  # noqa: E402
from scripts.ops.durable_file import (  # noqa: E402
    durable_replace as _durable_replace,
    durable_unlink as _durable_unlink,
)
from scripts.ops.recovery_owner import (  # noqa: E402
    current_process_owner,
    process_started_at_ns as _process_started_at_ns,
)


MANIFEST_CONTRACT = "backup-manifest/v1"
INVENTORY_CONTRACT = "inventory-integrity/v1"
INVENTORY_CHECK = PROJECT_ROOT / "scripts" / "ops" / "check_inventory_integrity.py"
ALEMBIC_INFRASTRUCTURE_TABLES = frozenset(
    {"alembic_version", "alembic_schema_state", "data_revision"}
)
RUNTIME_RECOVERY_CONTRACT: dict[str, object] = {
    "task_schema_version": "1.2",
    "owner": "current-windows-identity",
    "scheduler_restart_count": 3,
    "scheduler_restart_interval": "PT1M",
    "host_retry_count": 3,
    "host_retry_delay_seconds": 60,
}
PUBLICATION_RECOVERY_PREFIX = ".backup-publication-recovery-"
PUBLICATION_QUARANTINE_PREFIX = ".backup-publication-quarantine-"
PUBLICATION_RECOVERY_CONTRACT = "backup-publication-recovery/v1"


class BackupStatus(str, Enum):
    """Stable result states for backup consumers."""

    PASS = "PASS"
    FAIL = "FAIL"
    STALE = "STALE"
    LEGACY_UNVERIFIED = "LEGACY_UNVERIFIED"
    STRUCTURAL_ONLY = "STRUCTURAL_ONLY"


class BackupValidationError(RuntimeError):
    """The artifact cannot prove the current backup contract."""


@dataclass(frozen=True)
class BackupVerification:
    """Fail-closed backup verification result without traceback-shaped output."""

    status: BackupStatus
    errors: tuple[str, ...] = ()
    manifest: dict[str, object] | None = None


def _source_snapshot_errors(
    engine: object,
    source_snapshot: object,
) -> tuple[str, ...]:
    if not isinstance(source_snapshot, dict):
        return ("manifest source snapshot is missing",)
    if engine == "postgresql":
        if (
            source_snapshot.get("method") != "pg_dump"
            or source_snapshot.get("transaction_snapshot") is not True
        ):
            return ("PostgreSQL pg_dump transaction snapshot evidence is invalid",)
        return ()
    if engine != "sqlite":
        return ()
    if (
        source_snapshot.get("method") != "sqlite3.backup"
        or source_snapshot.get("wal_included") is not True
        or not isinstance(source_snapshot.get("journal_mode"), str)
        or not str(source_snapshot["journal_mode"]).strip()
    ):
        return ("SQLite snapshot capture evidence is invalid",)
    generation = source_snapshot.get("physical_generation")
    if (
        not isinstance(generation, str)
        or len(generation) != 64
        or any(character not in "0123456789abcdef" for character in generation.lower())
    ):
        return ("source physical generation is missing or invalid",)
    return ()


def manifest_path_for(artifact: Path) -> Path:
    """Return the companion manifest path for one artifact."""

    return artifact.with_name(f"{artifact.name}.manifest.json")


def file_sha256(path: Path) -> str:
    """Hash an artifact without loading it into memory."""

    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sqlite_file_generation(path: Path) -> str:
    """Fingerprint SQLite database/WAL bytes to detect logical round trips."""

    digest = hashlib.sha256()
    for label, candidate in (("database", path), ("wal", Path(f"{path}-wal"))):
        digest.update(label.encode("ascii"))
        if not candidate.is_file():
            digest.update(b"\x00")
            continue
        digest.update(b"\x01")
        digest.update(candidate.stat().st_size.to_bytes(8, "big"))
        with candidate.open("rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(block)
    return digest.hexdigest()


def _json_bytes(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _json_sha256(value: object) -> str:
    return hashlib.sha256(_json_bytes(value)).hexdigest()


def _json_value(value: object) -> object:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, bytes):
        return {"type": "bytes", "value": value.hex()}
    if isinstance(value, float):
        return {"type": "float", "value": value.hex()}
    if isinstance(value, Decimal):
        return {"type": "decimal", "value": str(value)}
    if isinstance(value, (datetime, date)):
        return {"type": "datetime", "value": value.isoformat()}
    if isinstance(value, UUID):
        return {"type": "uuid", "value": str(value)}
    if isinstance(value, dict):
        return {
            str(key): _json_value(item)
            for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))
        }
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    return {"type": type(value).__name__, "value": str(value)}


def _qualified_identifier(
    preparer: sa.sql.compiler.IdentifierPreparer,
    schema: str | None,
    name: str,
) -> str:
    """Quote a possibly schema-qualified PostgreSQL object name."""

    quoted_name = preparer.quote(name)
    return (
        f"{preparer.quote_schema(schema)}.{quoted_name}"
        if schema
        else quoted_name
    )


def _schema_fingerprint(connection: Connection) -> str:
    """Hash every application and Alembic schema object for this engine."""

    if connection.dialect.name == "sqlite":
        rows = connection.exec_driver_sql(
            "SELECT type, name, tbl_name, COALESCE(sql, '') "
            "FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' "
            "ORDER BY type, name, tbl_name"
        ).all()
        return _json_sha256([list(row) for row in rows])

    inspector = sa.inspect(connection)
    tables: list[dict[str, object]] = []
    for table_name in sorted(inspector.get_table_names()):
        tables.append(
            {
                "name": table_name,
                "columns": _json_value(inspector.get_columns(table_name)),
                "primary_key": _json_value(inspector.get_pk_constraint(table_name)),
                "foreign_keys": _json_value(
                    sorted(
                        inspector.get_foreign_keys(table_name),
                        key=lambda item: str(item.get("name") or ""),
                    )
                ),
                "unique_constraints": _json_value(
                    sorted(
                        inspector.get_unique_constraints(table_name),
                        key=lambda item: str(item.get("name") or ""),
                    )
                ),
                "check_constraints": _json_value(
                    sorted(
                        inspector.get_check_constraints(table_name),
                        key=lambda item: str(item.get("name") or ""),
                    )
                ),
                "indexes": _json_value(
                    sorted(
                        inspector.get_indexes(table_name),
                        key=lambda item: str(item.get("name") or ""),
                    )
                ),
            }
        )
    enum_rows = connection.exec_driver_sql(
        "SELECT namespace.nspname, type.typname, enum.enumsortorder, enum.enumlabel "
        "FROM pg_type AS type "
        "JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace "
        "JOIN pg_enum AS enum ON enum.enumtypid = type.oid "
        "WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema') "
        "AND namespace.nspname NOT LIKE 'pg_toast%%' "
        "ORDER BY namespace.nspname, type.typname, enum.enumsortorder"
    ).all()
    sequence_rows = connection.exec_driver_sql(
        "SELECT sequence_namespace.nspname, sequence.relname, "
        "format_type(definition.seqtypid, NULL), definition.seqstart, "
        "definition.seqincrement, definition.seqmin, definition.seqmax, "
        "definition.seqcache, definition.seqcycle, "
        "owner_namespace.nspname, owner_table.relname, owner_column.attname "
        "FROM pg_sequence AS definition "
        "JOIN pg_class AS sequence ON sequence.oid = definition.seqrelid "
        "JOIN pg_namespace AS sequence_namespace "
        "ON sequence_namespace.oid = sequence.relnamespace "
        "LEFT JOIN pg_depend AS dependency "
        "ON dependency.classid = 'pg_class'::regclass "
        "AND dependency.objid = sequence.oid "
        "AND dependency.deptype IN ('a', 'i') "
        "LEFT JOIN pg_class AS owner_table ON owner_table.oid = dependency.refobjid "
        "LEFT JOIN pg_namespace AS owner_namespace "
        "ON owner_namespace.oid = owner_table.relnamespace "
        "LEFT JOIN pg_attribute AS owner_column "
        "ON owner_column.attrelid = owner_table.oid "
        "AND owner_column.attnum = dependency.refobjsubid "
        "WHERE sequence_namespace.nspname NOT IN ('pg_catalog', 'information_schema') "
        "AND sequence_namespace.nspname NOT LIKE 'pg_toast%%' "
        "ORDER BY sequence_namespace.nspname, sequence.relname"
    ).all()
    return _json_sha256(
        {
            "tables": tables,
            "enums": [list(row) for row in enum_rows],
            "sequences": [list(row) for row in sequence_rows],
        }
    )


def _data_revision(connection: Connection) -> dict[str, object]:
    row = connection.execute(
        sa.text("SELECT revision, updated_at FROM data_revision WHERE id = 1")
    ).one()
    updated_at = row.updated_at
    return {
        "revision": int(row.revision),
        "updated_at": (
            updated_at.isoformat() if isinstance(updated_at, datetime) else str(updated_at)
        ),
    }


def _data_oracle_hash(connection: Connection) -> str:
    """Hash raw SQL rows independently from application integrity calculations."""

    inspector = sa.inspect(connection)
    preparer = connection.dialect.identifier_preparer
    table_hashes: list[dict[str, object]] = []
    for table_name in sorted(inspector.get_table_names()):
        if table_name in ALEMBIC_INFRASTRUCTURE_TABLES:
            continue
        column_names = [str(column["name"]) for column in inspector.get_columns(table_name)]
        quoted_table = preparer.quote(table_name)
        quoted_columns = ", ".join(preparer.quote(name) for name in column_names)
        row_hashes = sorted(
            _json_sha256([_json_value(value) for value in row])
            for row in connection.exec_driver_sql(
                f"SELECT {quoted_columns} FROM {quoted_table}"
            )
        )
        table_hashes.append(
            {
                "table": table_name,
                "columns": column_names,
                "row_hashes": row_hashes,
            }
        )
    sequence_states: list[dict[str, object]] = []
    if connection.dialect.name == "postgresql":
        sequences = connection.exec_driver_sql(
            "SELECT schemaname, sequencename FROM pg_sequences "
            "WHERE schemaname NOT IN ('pg_catalog', 'information_schema') "
            "AND schemaname NOT LIKE 'pg_toast%%' "
            "ORDER BY schemaname, sequencename"
        ).all()
        for schema_name, sequence_name in sequences:
            qualified = _qualified_identifier(
                preparer,
                str(schema_name),
                str(sequence_name),
            )
            last_value, is_called = connection.exec_driver_sql(
                f"SELECT last_value, is_called FROM {qualified}"
            ).one()
            sequence_states.append(
                {
                    "schema": str(schema_name),
                    "name": str(sequence_name),
                    "last_value": _json_value(last_value),
                    "is_called": bool(is_called),
                }
            )
    return _json_sha256(
        {
            "tables": table_hashes,
            "sequence_states": sequence_states,
        }
    )


def _snapshot_metadata(connection: Connection) -> dict[str, object]:
    if connection.dialect.name == "sqlite":
        return {
            "journal_mode": str(connection.exec_driver_sql("PRAGMA journal_mode").scalar_one()),
            "page_count": int(connection.exec_driver_sql("PRAGMA page_count").scalar_one()),
            "freelist_count": int(
                connection.exec_driver_sql("PRAGMA freelist_count").scalar_one()
            ),
            "schema_version": int(
                connection.exec_driver_sql("PRAGMA schema_version").scalar_one()
            ),
            "user_version": int(
                connection.exec_driver_sql("PRAGMA user_version").scalar_one()
            ),
        }
    return {
        "server_version": str(
            connection.exec_driver_sql("SHOW server_version").scalar_one()
        )
    }


def _snapshot_identity(connection: Connection) -> dict[str, object]:
    schema_fingerprint = _schema_fingerprint(connection)
    data_revision = _data_revision(connection)
    oracle_hash = _data_oracle_hash(connection)
    snapshot_hash = _json_sha256(
        {
            "engine": connection.dialect.name,
            "schema_fingerprint": schema_fingerprint,
            "data_revision": data_revision,
            "oracle_hash": oracle_hash,
        }
    )
    return {
        "schema_fingerprint": schema_fingerprint,
        "data_revision": data_revision,
        "oracle_hash": oracle_hash,
        "snapshot_hash": snapshot_hash,
        "snapshot_metadata": _snapshot_metadata(connection),
    }


def _run_inventory_integrity(database_url: str) -> dict[str, object]:
    result = subprocess.run(
        [
            sys.executable,
            str(INVENTORY_CHECK),
            "--db-url",
            database_url,
            "--json",
        ],
        cwd=PROJECT_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    try:
        payload = json.loads(lines[-1]) if lines else None
    except json.JSONDecodeError as exc:
        raise BackupValidationError("inventory-integrity/v1 output is invalid") from exc
    if not isinstance(payload, dict) or payload.get("contract") != INVENTORY_CONTRACT:
        raise BackupValidationError("inventory-integrity/v1 result is missing")
    if result.returncode == 1 or int(payload.get("blocking_count", 0)):
        raise BackupValidationError("inventory-integrity/v1 blocking violation")
    if result.returncode != 0:
        raise BackupValidationError(
            f"inventory-integrity/v1 tool failed with exit {result.returncode}"
        )
    return payload


def _inventory_integrity_from_connection(connection: Connection) -> dict[str, object]:
    """Collect inventory evidence inside the caller's existing DB snapshot."""

    from app.services.inventory_integrity import diagnose_inventory_integrity

    session = Session(
        bind=connection,
        autoflush=False,
        expire_on_commit=False,
        join_transaction_mode="rollback_only",
    )
    try:
        payload = diagnose_inventory_integrity(session).contract_payload()
    finally:
        session.close()
    if payload.get("contract") != INVENTORY_CONTRACT:
        raise BackupValidationError("inventory-integrity/v1 result is missing")
    if int(payload.get("blocking_count", 0)):
        raise BackupValidationError("inventory-integrity/v1 blocking violation")
    return payload


def _foreign_key_check(connection: Connection) -> None:
    if connection.dialect.name == "sqlite":
        if connection.exec_driver_sql("PRAGMA foreign_key_check").all():
            raise BackupValidationError("foreign key violations detected")
        return
    invalid = connection.execute(
        sa.text(
            "SELECT conname FROM pg_constraint "
            "WHERE contype = 'f' AND NOT convalidated ORDER BY conname"
        )
    ).all()
    if invalid:
        raise BackupValidationError("foreign key constraints are not validated")
    inspector = sa.inspect(connection)
    preparer = connection.dialect.identifier_preparer
    violations: list[str] = []
    for table_name in sorted(inspector.get_table_names()):
        child_table = _qualified_identifier(preparer, None, table_name)
        for foreign_key in inspector.get_foreign_keys(table_name):
            child_columns = [
                str(column) for column in foreign_key.get("constrained_columns") or ()
            ]
            parent_columns = [
                str(column) for column in foreign_key.get("referred_columns") or ()
            ]
            parent_table_name = foreign_key.get("referred_table")
            if (
                not isinstance(parent_table_name, str)
                or not child_columns
                or len(child_columns) != len(parent_columns)
            ):
                raise BackupValidationError("foreign key metadata is incomplete")
            parent_schema = foreign_key.get("referred_schema")
            parent_table = _qualified_identifier(
                preparer,
                str(parent_schema) if parent_schema else None,
                parent_table_name,
            )
            populated = " AND ".join(
                f"child.{preparer.quote(column)} IS NOT NULL"
                for column in child_columns
            )
            matches = " AND ".join(
                f"parent.{preparer.quote(parent)} = child.{preparer.quote(child)}"
                for child, parent in zip(child_columns, parent_columns, strict=True)
            )
            violation = connection.exec_driver_sql(
                f"SELECT 1 FROM {child_table} AS child "
                f"WHERE {populated} AND NOT EXISTS ("
                f"SELECT 1 FROM {parent_table} AS parent WHERE {matches}"
                ") LIMIT 1"
            ).first()
            if violation is not None:
                violations.append(
                    str(foreign_key.get("name") or f"{table_name}:unnamed")
                )
    if violations:
        raise BackupValidationError(
            "foreign key violations detected: " + ", ".join(sorted(violations))
        )


def _sqlite_integrity_check(connection: Connection) -> None:
    if connection.exec_driver_sql("PRAGMA integrity_check").all() != [("ok",)]:
        raise BackupValidationError("SQLite integrity check failed")


def _database_url_for_sqlite(path: Path) -> str:
    return f"sqlite:///{path.resolve().as_posix()}"


def _collect_database_evidence_from_connection(
    connection: Connection,
    *,
    expected_engine: str | None,
) -> dict[str, object]:
    inventory: dict[str, object] | None = None
    engine = connection.dialect.name
    if expected_engine is not None and engine != expected_engine:
        raise BackupValidationError(
            f"database engine mismatch: expected={expected_engine} actual={engine}"
        )
    if engine == "postgresql":
        connection.exec_driver_sql(
            "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"
        )
    schema = check_schema(connection=connection)
    if not schema.ready:
        detail = "; ".join(schema.differences) or (
            f"Alembic revision mismatch: expected=head actual={schema.revision}"
        )
        raise BackupValidationError(f"schema verification failed: {detail}")
    if engine == "sqlite":
        _sqlite_integrity_check(connection)
    _foreign_key_check(connection)
    identity = _snapshot_identity(connection)
    if engine == "postgresql":
        inventory = _inventory_integrity_from_connection(connection)
    return {
        "engine": engine,
        "alembic_revision": schema.revision,
        **identity,
        "verification": {
            "status": BackupStatus.PASS.value,
            "schema": "PASS",
            "sqlite_integrity": "PASS" if engine == "sqlite" else "NOT_APPLICABLE",
            "foreign_keys": "PASS",
            "inventory": inventory,
        },
    }


def collect_database_evidence_from_connection(
    connection: Connection,
    *,
    expected_engine: str | None = None,
) -> dict[str, object]:
    """Collect complete PostgreSQL evidence from an already-admitted session."""

    try:
        evidence = _collect_database_evidence_from_connection(
            connection,
            expected_engine=expected_engine,
        )
        verification = evidence["verification"]
        if (
            evidence["engine"] != "postgresql"
            or not isinstance(verification, dict)
            or verification.get("inventory") is None
        ):
            raise BackupValidationError(
                "connection-bound evidence requires PostgreSQL inventory"
            )
    except BackupValidationError:
        raise
    except Exception as exc:  # noqa: BLE001 - normalized for operational callers
        raise BackupValidationError(
            f"database verification failed: {type(exc).__name__}: {exc}"
        ) from exc
    return evidence


def collect_database_evidence(
    database_url: str,
    *,
    expected_engine: str | None = None,
) -> dict[str, object]:
    """Collect head/schema/FK/raw-hash/W5 evidence from one read-only DB."""

    try:
        with readonly_connection(database_url) as connection:
            evidence = _collect_database_evidence_from_connection(
                connection,
                expected_engine=expected_engine,
            )
    except BackupValidationError:
        raise
    except Exception as exc:  # noqa: BLE001 - normalized for operational callers
        raise BackupValidationError(
            f"database verification failed: {type(exc).__name__}: {exc}"
        ) from exc

    verification = evidence["verification"]
    assert isinstance(verification, dict)
    if verification.get("inventory") is None:
        verification["inventory"] = _run_inventory_integrity(database_url)
    return evidence


def build_manifest(
    artifact: Path,
    *,
    published_name: str,
    evidence: dict[str, object],
    source_snapshot: dict[str, object],
) -> dict[str, object]:
    """Build one complete v1 manifest from already-verified evidence."""

    verification = evidence["verification"]
    if not isinstance(verification, dict) or verification.get("status") != "PASS":
        raise BackupValidationError("only PASS evidence can create a backup manifest")
    source_errors = _source_snapshot_errors(evidence.get("engine"), source_snapshot)
    if source_errors:
        raise BackupValidationError("; ".join(source_errors))
    return {
        "contract": MANIFEST_CONTRACT,
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "artifact": {
            "name": published_name,
            "sha256": file_sha256(artifact),
            "size": artifact.stat().st_size,
        },
        "database": {
            key: evidence[key]
            for key in (
                "engine",
                "alembic_revision",
                "schema_fingerprint",
                "data_revision",
                "snapshot_hash",
                "oracle_hash",
                "snapshot_metadata",
            )
        },
        "source_snapshot": source_snapshot,
        "verification": verification,
        "runtime_recovery": RUNTIME_RECOVERY_CONTRACT,
    }


def build_structural_sqlite_manifest(
    artifact: Path,
    *,
    published_name: str,
    source_snapshot: dict[str, object],
) -> dict[str, object]:
    """Record a structural-only SQLite snapshot without promoting it to PASS."""

    source_errors = _source_snapshot_errors("sqlite", source_snapshot)
    if source_errors:
        raise BackupValidationError("; ".join(source_errors))

    try:
        with readonly_connection(_database_url_for_sqlite(artifact)) as connection:
            if connection.dialect.name != "sqlite":
                raise BackupValidationError("legacy snapshot is not SQLite")
            _sqlite_integrity_check(connection)
            _foreign_key_check(connection)
            inspector = sa.inspect(connection)
            revisions = (
                [
                    str(row[0])
                    for row in connection.exec_driver_sql(
                        "SELECT version_num FROM alembic_version ORDER BY version_num"
                    ).all()
                ]
                if inspector.has_table("alembic_version")
                else []
            )
            data_revision = (
                _data_revision(connection)
                if inspector.has_table("data_revision")
                else None
            )
            schema_fingerprint = _schema_fingerprint(connection)
            oracle_hash = _data_oracle_hash(connection)
            snapshot_hash = _json_sha256(
                {
                    "engine": "sqlite",
                    "schema_fingerprint": schema_fingerprint,
                    "data_revision": data_revision,
                    "oracle_hash": oracle_hash,
                }
            )
            snapshot_metadata = _snapshot_metadata(connection)
    except BackupValidationError:
        raise
    except Exception as exc:  # noqa: BLE001 - normalized for operational callers
        raise BackupValidationError(
            f"legacy snapshot verification failed: {type(exc).__name__}: {exc}"
        ) from exc

    alembic_revision: object
    if len(revisions) == 1:
        alembic_revision = revisions[0]
    elif revisions:
        alembic_revision = revisions
    else:
        alembic_revision = None
    return {
        "contract": MANIFEST_CONTRACT,
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "artifact": {
            "name": published_name,
            "sha256": file_sha256(artifact),
            "size": artifact.stat().st_size,
        },
        "database": {
            "engine": "sqlite",
            "alembic_revision": alembic_revision,
            "schema_fingerprint": schema_fingerprint,
            "data_revision": data_revision,
            "snapshot_hash": snapshot_hash,
            "oracle_hash": oracle_hash,
            "snapshot_metadata": snapshot_metadata,
        },
        "source_snapshot": source_snapshot,
        "verification": {
            "status": BackupStatus.STRUCTURAL_ONLY.value,
            "schema": "NOT_VERIFIED",
            "sqlite_integrity": "PASS",
            "foreign_keys": "PASS",
            "inventory": {
                "contract": INVENTORY_CONTRACT,
                "status": "NOT_VERIFIED",
            },
        },
        "runtime_recovery": RUNTIME_RECOVERY_CONTRACT,
    }


def _write_publication_recovery_receipt(
    receipt: Path,
    *,
    state: str,
    staged_artifact: Path,
    published_artifact: Path,
    published_manifest: Path,
    staged_manifest: Path,
    quarantined_artifact: Path,
    quarantined_manifest: Path,
) -> None:
    """Atomically persist enough bounded state to finish one pair publication."""

    pending = receipt.with_name(f".{receipt.name}.pending-{uuid4().hex}.tmp")
    payload = {
        "contract": PUBLICATION_RECOVERY_CONTRACT,
        "state": state,
        "owner": current_process_owner(),
        "staged_artifact": staged_artifact.name,
        "published_artifact": published_artifact.name,
        "published_manifest": published_manifest.name,
        "staged_manifest": staged_manifest.name,
        "quarantined_artifact": quarantined_artifact.name,
        "quarantined_manifest": quarantined_manifest.name,
    }
    operation_error: BaseException | None = None
    try:
        with pending.open("wb") as handle:
            handle.write(_json_bytes(payload) + b"\n")
            handle.flush()
            os.fsync(handle.fileno())
        _durable_replace(pending, receipt)
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        try:
            pending.unlink(missing_ok=True)
        except OSError as cleanup_error:
            if operation_error is None:
                raise
            operation_error.add_note(
                f"backup publication receipt cleanup failed: {cleanup_error}"
            )


def _load_publication_recovery_receipt(
    receipt: Path,
) -> tuple[str, int, int, Path, Path, Path, Path, Path, Path]:
    """Load only same-directory paths from one publication recovery receipt."""

    try:
        payload = json.loads(receipt.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise OSError(f"invalid backup publication recovery receipt: {receipt}") from exc
    path_keys = (
        "staged_artifact",
        "published_artifact",
        "published_manifest",
        "staged_manifest",
        "quarantined_artifact",
        "quarantined_manifest",
    )
    if (
        not isinstance(payload, dict)
        or payload.get("contract") != PUBLICATION_RECOVERY_CONTRACT
        or payload.get("state")
        not in {"publishing", "recovery_required", "cleanup_required"}
        or not isinstance(payload.get("owner"), dict)
        or not isinstance(payload["owner"].get("pid"), int)
        or int(payload["owner"]["pid"]) <= 0
        or not isinstance(payload["owner"].get("started_at_ns"), int)
        or int(payload["owner"]["started_at_ns"]) < -1
    ):
        raise OSError(f"invalid backup publication recovery receipt: {receipt}")
    names = [payload.get(key) for key in path_keys]
    if any(
        not isinstance(name, str)
        or Path(name).name != name
        or name in {"", ".", ".."}
        for name in names
    ):
        raise OSError(f"invalid backup publication recovery receipt: {receipt}")
    receipt_match = re.fullmatch(
        rf"{re.escape(PUBLICATION_RECOVERY_PREFIX)}([0-9a-f]{{32}})\.json",
        receipt.name,
    )
    if receipt_match is None:
        raise OSError(f"invalid backup publication recovery receipt: {receipt}")
    token = receipt_match.group(1)
    paths = [receipt.parent / str(name) for name in names]
    (
        staged_artifact,
        published_artifact,
        published_manifest,
        staged_manifest,
        quarantined_artifact,
        quarantined_manifest,
    ) = paths
    expected_published_manifest = manifest_path_for(published_artifact)
    if (
        len(set(paths)) != len(paths)
        or published_artifact.name.startswith(".")
        or published_manifest != expected_published_manifest
        or re.fullmatch(
            rf"\.{re.escape(published_artifact.name)}\.pending-[0-9a-f]{{32}}\.tmp",
            staged_artifact.name,
        )
        is None
        or re.fullmatch(
            rf"\.{re.escape(published_manifest.name)}\.pending-[0-9a-f]{{32}}\.tmp",
            staged_manifest.name,
        )
        is None
        or quarantined_artifact.name
        != f"{PUBLICATION_QUARANTINE_PREFIX}{token}-{published_artifact.name}"
        or quarantined_manifest.name
        != f"{PUBLICATION_QUARANTINE_PREFIX}{token}-{published_manifest.name}"
    ):
        raise OSError(f"invalid backup publication recovery receipt: {receipt}")
    return (
        str(payload["state"]),
        int(payload["owner"]["pid"]),
        int(payload["owner"]["started_at_ns"]),
        staged_artifact,
        published_artifact,
        published_manifest,
        staged_manifest,
        quarantined_artifact,
        quarantined_manifest,
    )


def _process_is_running(process_id: int, expected_started_at_ns: int) -> bool:
    """Avoid recovering a publication that another live process still owns."""

    observed_started_at_ns = _process_started_at_ns(process_id)
    if observed_started_at_ns == -1 or expected_started_at_ns == -1:
        return True
    return (
        observed_started_at_ns is not None
        and observed_started_at_ns == expected_started_at_ns
    )


def _recover_publication_receipt(receipt: Path, *, force: bool = False) -> None:
    """Remove an incomplete public pair and delete its retry receipt last."""

    (
        state,
        publisher_pid,
        publisher_started_at_ns,
        staged_artifact,
        published_artifact,
        published_manifest,
        staged_manifest,
        quarantined_artifact,
        quarantined_manifest,
    ) = _load_publication_recovery_receipt(receipt)
    if (
        not force
        and state == "publishing"
        and _process_is_running(publisher_pid, publisher_started_at_ns)
    ):
        return

    pair_complete = published_artifact.is_file() and published_manifest.is_file()
    if not pair_complete:
        for published, quarantined in (
            (published_artifact, quarantined_artifact),
            (published_manifest, quarantined_manifest),
        ):
            if published.exists():
                _durable_replace(published, quarantined)
    _durable_unlink(staged_artifact, missing_ok=True)
    _durable_unlink(staged_manifest, missing_ok=True)
    _durable_unlink(quarantined_artifact, missing_ok=True)
    _durable_unlink(quarantined_manifest, missing_ok=True)
    _durable_unlink(receipt)


def recover_publication_receipts(directory: Path) -> None:
    """Retry interrupted pair publications before starting a new one."""

    if not directory.exists():
        return
    for receipt in sorted(directory.glob(f"{PUBLICATION_RECOVERY_PREFIX}*.json")):
        _recover_publication_receipt(receipt)


def publish_backup_pair(
    staged_artifact: Path,
    published_artifact: Path,
    manifest: dict[str, object],
) -> Path:
    """Publish the manifest last with durable recovery for every half-pair."""

    if staged_artifact.parent.resolve() != published_artifact.parent.resolve():
        raise ValueError("staged and published backup artifacts must share a directory")
    recover_publication_receipts(published_artifact.parent)
    published_manifest = manifest_path_for(published_artifact)
    staged_manifest = published_manifest.parent / (
        f".{published_manifest.name}.pending-{uuid4().hex}.tmp"
    )
    token = uuid4().hex
    quarantined_artifact = published_artifact.parent / (
        f"{PUBLICATION_QUARANTINE_PREFIX}{token}-{published_artifact.name}"
    )
    quarantined_manifest = published_manifest.parent / (
        f"{PUBLICATION_QUARANTINE_PREFIX}{token}-{published_manifest.name}"
    )
    receipt = published_artifact.parent / f"{PUBLICATION_RECOVERY_PREFIX}{token}.json"
    try:
        with staged_manifest.open("wb") as handle:
            handle.write(_json_bytes(manifest) + b"\n")
            handle.flush()
            os.fsync(handle.fileno())
        with staged_artifact.open("rb+") as handle:
            handle.flush()
            os.fsync(handle.fileno())
        _write_publication_recovery_receipt(
            receipt,
            state="publishing",
            staged_artifact=staged_artifact,
            published_artifact=published_artifact,
            published_manifest=published_manifest,
            staged_manifest=staged_manifest,
            quarantined_artifact=quarantined_artifact,
            quarantined_manifest=quarantined_manifest,
        )
        try:
            _durable_replace(staged_artifact, published_artifact)
            _durable_replace(staged_manifest, published_manifest)
        except BaseException:
            try:
                _write_publication_recovery_receipt(
                    receipt,
                    state="recovery_required",
                    staged_artifact=staged_artifact,
                    published_artifact=published_artifact,
                    published_manifest=published_manifest,
                    staged_manifest=staged_manifest,
                    quarantined_artifact=quarantined_artifact,
                    quarantined_manifest=quarantined_manifest,
                )
            except OSError:
                pass
            try:
                _recover_publication_receipt(receipt, force=True)
            except OSError as recovery_error:
                raise OSError(
                    f"backup publication recovery failed; retry receipt: {receipt}"
                ) from recovery_error
            raise
        try:
            _write_publication_recovery_receipt(
                receipt,
                state="cleanup_required",
                staged_artifact=staged_artifact,
                published_artifact=published_artifact,
                published_manifest=published_manifest,
                staged_manifest=staged_manifest,
                quarantined_artifact=quarantined_artifact,
                quarantined_manifest=quarantined_manifest,
            )
        except OSError as exc:
            print(
                f"[BACKUP] WARN publication receipt update pending: {exc}",
                file=sys.stderr,
            )
        try:
            _durable_unlink(receipt, missing_ok=True)
        except OSError as exc:
            print(
                f"[BACKUP] WARN publication receipt cleanup pending: {exc}",
                file=sys.stderr,
            )
            print(
                f"BACKUP_PUBLICATION_RECOVERY_PENDING={receipt}",
                file=sys.stderr,
            )
    finally:
        try:
            staged_manifest.unlink(missing_ok=True)
        except OSError as exc:
            print(
                f"[BACKUP] WARN staged manifest cleanup pending at "
                f"{staged_manifest}: {exc}",
                file=sys.stderr,
            )
    return published_artifact


def create_sqlite_manifest(
    staged_artifact: Path,
    *,
    published_name: str,
    source_snapshot: dict[str, object],
) -> dict[str, object]:
    """Verify one private online snapshot and create its publication receipt."""

    evidence = collect_database_evidence(
        _database_url_for_sqlite(staged_artifact),
        expected_engine="sqlite",
    )
    return build_manifest(
        staged_artifact,
        published_name=published_name,
        evidence=evidence,
        source_snapshot=source_snapshot,
    )


def _load_manifest(path: Path) -> dict[str, object]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise BackupValidationError("manifest JSON is invalid") from exc
    if not isinstance(value, dict):
        raise BackupValidationError("manifest JSON is invalid")
    return value


def _manifest_receipt_errors(
    artifact: Path,
    manifest: dict[str, object],
) -> tuple[str, ...]:
    errors: list[str] = []
    if manifest.get("contract") != MANIFEST_CONTRACT:
        errors.append("manifest contract mismatch")
    artifact_receipt = manifest.get("artifact")
    if not isinstance(artifact_receipt, dict):
        return (*errors, "manifest artifact receipt is missing")
    if artifact_receipt.get("name") != artifact.name:
        errors.append("artifact name mismatch")
    try:
        expected_size = int(artifact_receipt.get("size", -1))
    except (TypeError, ValueError):
        expected_size = -1
    if expected_size != artifact.stat().st_size:
        errors.append("artifact size mismatch")
    if artifact_receipt.get("sha256") != file_sha256(artifact):
        errors.append("artifact SHA-256 mismatch")
    verification = manifest.get("verification")
    if not isinstance(verification, dict) or verification.get("status") not in {
        BackupStatus.PASS.value,
        BackupStatus.STRUCTURAL_ONLY.value,
    }:
        errors.append("manifest verification status is invalid")
    if manifest.get("runtime_recovery") != RUNTIME_RECOVERY_CONTRACT:
        errors.append("runtime recovery contract mismatch")
    database = manifest.get("database")
    engine = database.get("engine") if isinstance(database, dict) else None
    required_database_keys = {
        "engine",
        "alembic_revision",
        "schema_fingerprint",
        "data_revision",
        "snapshot_hash",
        "oracle_hash",
        "snapshot_metadata",
    }
    if (
        not isinstance(database, dict)
        or not required_database_keys.issubset(database)
        or engine not in {"sqlite", "postgresql"}
        or any(
            not isinstance(database.get(key), str)
            or len(str(database[key])) != 64
            or any(
                character not in "0123456789abcdef"
                for character in str(database[key]).lower()
            )
            for key in ("schema_fingerprint", "snapshot_hash", "oracle_hash")
        )
        or not isinstance(database.get("snapshot_metadata"), dict)
    ):
        errors.append("manifest database evidence is incomplete")
    elif isinstance(verification, dict):
        status = verification.get("status")
        inventory = verification.get("inventory")
        if status == BackupStatus.PASS.value:
            data_revision = database.get("data_revision")
            if (
                not isinstance(database.get("alembic_revision"), str)
                or not database["alembic_revision"]
                or not isinstance(data_revision, dict)
                or not isinstance(data_revision.get("revision"), int)
                or not isinstance(data_revision.get("updated_at"), str)
                or verification.get("schema") != "PASS"
                or verification.get("foreign_keys") != "PASS"
                or verification.get("sqlite_integrity")
                != ("PASS" if engine == "sqlite" else "NOT_APPLICABLE")
                or not isinstance(inventory, dict)
                or inventory.get("contract") != INVENTORY_CONTRACT
                or inventory.get("status") not in {"pass", "warning"}
                or inventory.get("blocking_count") != 0
                or not isinstance(inventory.get("warning_count"), int)
                or inventory["warning_count"] < 0
                or (inventory.get("status") == "pass" and inventory["warning_count"] != 0)
                or (inventory.get("status") == "warning" and inventory["warning_count"] == 0)
                or not isinstance(inventory.get("checks"), list)
            ):
                errors.append("manifest PASS evidence is incomplete")
        elif (
            engine != "sqlite"
            or verification.get("schema") != "NOT_VERIFIED"
            or verification.get("sqlite_integrity") != "PASS"
            or verification.get("foreign_keys") != "PASS"
            or not isinstance(inventory, dict)
            or inventory.get("contract") != INVENTORY_CONTRACT
            or inventory.get("status") != "NOT_VERIFIED"
        ):
            errors.append("manifest STRUCTURAL_ONLY evidence is incomplete")
    errors.extend(_source_snapshot_errors(engine, manifest.get("source_snapshot")))
    return tuple(errors)


def _evidence_errors(
    manifest: dict[str, object],
    evidence: dict[str, object],
) -> tuple[str, ...]:
    database = manifest.get("database")
    if not isinstance(database, dict):
        return ("manifest database evidence is missing",)
    errors: list[str] = []
    for key in (
        "engine",
        "alembic_revision",
        "schema_fingerprint",
        "data_revision",
        "snapshot_hash",
        "oracle_hash",
        "snapshot_metadata",
    ):
        if database.get(key) != evidence.get(key):
            errors.append(f"manifest {key} mismatch")
    if manifest.get("verification") != evidence.get("verification"):
        errors.append("manifest verification result mismatch")
    return tuple(errors)


def _source_snapshot_hash(path: Path) -> str:
    with readonly_connection(_database_url_for_sqlite(path)) as connection:
        connection.exec_driver_sql("BEGIN")
        try:
            schema = check_schema(connection=connection)
            if not schema.ready:
                raise BackupValidationError("source schema verification failed")
            return str(_snapshot_identity(connection)["snapshot_hash"])
        finally:
            connection.rollback()


def verify_sqlite_backup(
    artifact: Path,
    *,
    source_path: Path | None = None,
) -> BackupVerification:
    """Verify a SQLite artifact/manifest pair and optionally prove freshness."""

    artifact = artifact.resolve()
    if not artifact.is_file() or artifact.stat().st_size <= 0:
        return BackupVerification(BackupStatus.FAIL, ("backup artifact is missing or empty",))
    manifest_path = manifest_path_for(artifact)
    if not manifest_path.is_file():
        return BackupVerification(
            BackupStatus.LEGACY_UNVERIFIED,
            ("backup manifest is missing",),
        )
    try:
        manifest = _load_manifest(manifest_path)
        receipt_errors = _manifest_receipt_errors(artifact, manifest)
        if receipt_errors:
            return BackupVerification(BackupStatus.FAIL, receipt_errors, manifest)
        database = manifest.get("database")
        if not isinstance(database, dict) or database.get("engine") != "sqlite":
            return BackupVerification(
                BackupStatus.FAIL,
                ("manifest database engine is not sqlite",),
                manifest,
            )
        source_generation_before: str | None = None
        if source_path is not None:
            source_snapshot = manifest["source_snapshot"]
            assert isinstance(source_snapshot, dict)
            expected_generation = str(source_snapshot["physical_generation"])
            source_generation_before = sqlite_file_generation(source_path.resolve())
            if source_generation_before != expected_generation:
                return BackupVerification(
                    BackupStatus.STALE,
                    ("source physical generation changed",),
                    manifest,
                )
        verification = manifest.get("verification")
        if (
            isinstance(verification, dict)
            and verification.get("status") == BackupStatus.STRUCTURAL_ONLY.value
        ):
            return verify_structural_sqlite_candidate(artifact, manifest)
        evidence = collect_database_evidence(
            _database_url_for_sqlite(artifact),
            expected_engine="sqlite",
        )
        evidence_errors = _evidence_errors(manifest, evidence)
        if evidence_errors:
            return BackupVerification(BackupStatus.FAIL, evidence_errors, manifest)
        if source_path is not None:
            current_hash = _source_snapshot_hash(source_path.resolve())
            source_generation_after = sqlite_file_generation(source_path.resolve())
            if (
                source_generation_before is None
                or source_generation_after != source_generation_before
            ):
                return BackupVerification(
                    BackupStatus.STALE,
                    ("source physical generation changed",),
                    manifest,
                )
            if current_hash != database.get("snapshot_hash"):
                return BackupVerification(
                    BackupStatus.STALE,
                    ("source snapshot hash changed",),
                    manifest,
                )
    except BackupValidationError as exc:
        return BackupVerification(BackupStatus.FAIL, (str(exc),))
    except Exception as exc:  # noqa: BLE001 - verifier never emits a traceback contract
        return BackupVerification(
            BackupStatus.FAIL,
            (f"backup verification failed: {type(exc).__name__}: {exc}",),
        )
    return BackupVerification(BackupStatus.PASS, manifest=manifest)


def verify_sqlite_candidate(
    artifact: Path,
    manifest: dict[str, object],
) -> BackupVerification:
    """Verify staged or installed bytes against an already-authenticated manifest."""

    try:
        evidence = collect_database_evidence(
            _database_url_for_sqlite(artifact),
            expected_engine="sqlite",
        )
        errors = _evidence_errors(manifest, evidence)
        if errors:
            return BackupVerification(BackupStatus.FAIL, errors, manifest)
    except BackupValidationError as exc:
        return BackupVerification(BackupStatus.FAIL, (str(exc),), manifest)
    except Exception as exc:  # noqa: BLE001 - normalized operational result
        return BackupVerification(
            BackupStatus.FAIL,
            (f"candidate verification failed: {type(exc).__name__}: {exc}",),
            manifest,
        )
    return BackupVerification(BackupStatus.PASS, manifest=manifest)


def verify_structural_sqlite_candidate(
    artifact: Path,
    manifest: dict[str, object],
) -> BackupVerification:
    """Recompute structural-only SQLite evidence before admitting the bytes."""

    source_snapshot = manifest.get("source_snapshot")
    if not isinstance(source_snapshot, dict):
        return BackupVerification(
            BackupStatus.FAIL,
            ("manifest source snapshot is missing",),
            manifest,
        )
    try:
        rebuilt = build_structural_sqlite_manifest(
            artifact,
            published_name=artifact.name,
            source_snapshot=source_snapshot,
        )
        errors: list[str] = []
        if rebuilt.get("database") != manifest.get("database"):
            errors.append("manifest structural database evidence mismatch")
        if rebuilt.get("verification") != manifest.get("verification"):
            errors.append("manifest structural verification result mismatch")
        if errors:
            return BackupVerification(BackupStatus.FAIL, tuple(errors), manifest)
    except BackupValidationError as exc:
        return BackupVerification(BackupStatus.FAIL, (str(exc),), manifest)
    except Exception as exc:  # noqa: BLE001 - normalized operational result
        return BackupVerification(
            BackupStatus.FAIL,
            (f"structural verification failed: {type(exc).__name__}: {exc}",),
            manifest,
        )
    return BackupVerification(
        BackupStatus.STRUCTURAL_ONLY,
        ("manifest structural evidence was reverified",),
        manifest,
    )


def verify_manifest_receipt(
    artifact: Path,
    *,
    expected_engine: str,
) -> BackupVerification:
    """Verify immutable bytes and manifest shape before engine-specific restore."""

    artifact = artifact.resolve()
    if not artifact.is_file() or artifact.stat().st_size <= 0:
        return BackupVerification(BackupStatus.FAIL, ("backup artifact is missing or empty",))
    companion = manifest_path_for(artifact)
    if not companion.is_file():
        return BackupVerification(
            BackupStatus.LEGACY_UNVERIFIED,
            ("backup manifest is missing",),
        )
    try:
        manifest = _load_manifest(companion)
        errors = list(_manifest_receipt_errors(artifact, manifest))
        database = manifest.get("database")
        if not isinstance(database, dict) or database.get("engine") != expected_engine:
            errors.append(f"manifest database engine is not {expected_engine}")
        if errors:
            return BackupVerification(BackupStatus.FAIL, tuple(errors), manifest)
        verification = manifest.get("verification")
        if (
            isinstance(verification, dict)
            and verification.get("status") == BackupStatus.STRUCTURAL_ONLY.value
        ):
            return BackupVerification(
                BackupStatus.STRUCTURAL_ONLY,
                ("manifest records structural-only verification",),
                manifest,
            )
    except BackupValidationError as exc:
        return BackupVerification(BackupStatus.FAIL, (str(exc),))
    return BackupVerification(BackupStatus.PASS, manifest=manifest)


def verify_database_evidence(
    manifest: dict[str, object],
    evidence: dict[str, object],
) -> BackupVerification:
    """Compare a disposable restore or installed target with its manifest."""

    errors = _evidence_errors(manifest, evidence)
    if errors:
        return BackupVerification(BackupStatus.FAIL, errors, manifest)
    return BackupVerification(BackupStatus.PASS, manifest=manifest)


__all__ = [
    "BackupStatus",
    "BackupValidationError",
    "BackupVerification",
    "MANIFEST_CONTRACT",
    "RUNTIME_RECOVERY_CONTRACT",
    "build_manifest",
    "build_structural_sqlite_manifest",
    "collect_database_evidence",
    "collect_database_evidence_from_connection",
    "create_sqlite_manifest",
    "file_sha256",
    "manifest_path_for",
    "publish_backup_pair",
    "sqlite_file_generation",
    "verify_sqlite_backup",
    "verify_sqlite_candidate",
    "verify_structural_sqlite_candidate",
    "verify_database_evidence",
    "verify_manifest_receipt",
]
