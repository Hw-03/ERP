"""Alembic-based schema bootstrap and fail-closed onboarding checks."""

from __future__ import annotations

import re
import os
import sqlite3
import sys
import warnings
from contextlib import contextmanager
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Callable, Iterator

import sqlalchemy as sa
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

from app import models as _models  # noqa: F401  # register all model tables
from app.models import Base
from bootstrap import legacy_profiles
from migration_type_compare import compare_migration_type


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
VERSION_TABLE = "alembic_version"
SCHEMA_STATE_TABLE = "alembic_schema_state"
LEGACY_PROFILE_REVISION = "20260720_0003"
LEGACY_PROFILE_STAMP_REVISION = "20260720_0002"
ASSEMBLY_CHECKLIST_TABLES = frozenset(
    {
        "assembly_checklists",
        "assembly_checklist_sections",
        "assembly_checklist_items",
    }
)
SCHEMA_STATE_METADATA = sa.MetaData()
SCHEMA_STATE = sa.Table(
    SCHEMA_STATE_TABLE,
    SCHEMA_STATE_METADATA,
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("profile_id", sa.String(length=64), nullable=False),
    sa.Column("revision", sa.String(length=32), nullable=False),
    sa.Column("schema_fingerprint", sa.String(length=64), nullable=False),
    sa.Column(
        "updated_at",
        sa.DateTime(),
        server_default=sa.func.now(),
        nullable=False,
    ),
    sa.CheckConstraint("id = 1", name="ck_alembic_schema_state_singleton"),
)


class SchemaState(str, Enum):
    """Database states accepted by the bootstrap state machine."""

    EMPTY = "empty"
    UNVERSIONED_CURRENT = "unversioned_current"
    UNVERSIONED_LEGACY = "unversioned_legacy"
    UNVERSIONED_MISMATCH = "unversioned_mismatch"
    VERSIONED = "versioned"


class SchemaBootstrapError(RuntimeError):
    """Base error for schema bootstrap failures."""


class RevisionStateError(SchemaBootstrapError):
    """Raised when the Alembic version table cannot be trusted."""


class SchemaMismatchError(SchemaBootstrapError):
    """Raised before an unversioned schema with semantic drift can be stamped."""

    def __init__(self, differences: tuple[str, ...]) -> None:
        self.differences = differences
        detail = "\n  - ".join(differences)
        super().__init__(f"unversioned schema does not match current head:\n  - {detail}")


class DataPreflightError(SchemaBootstrapError):
    """Raised when legacy item data violates the baseline contract."""


class DataFingerprintError(SchemaBootstrapError):
    """Raised when baseline stamping changes application-table data."""


class BackupError(SchemaBootstrapError):
    """Raised when a verified pre-stamp backup receipt cannot be obtained."""


class ReadOnlyConnectionError(SchemaBootstrapError):
    """Raised when a schema check cannot obtain a truly read-only connection."""


@dataclass(frozen=True)
class BackupReceipt:
    """Proof that a pre-stamp backup was verified and published."""

    path: Path
    verified: bool


BackupProvider = Callable[[Connection], BackupReceipt]


@dataclass(frozen=True)
class SchemaInspection:
    """Read-only classification of the current database."""

    state: SchemaState
    revision: str | None = None
    differences: tuple[str, ...] = ()
    profile_id: str | None = None
    schema_fingerprint: str | None = None


@dataclass(frozen=True)
class SchemaCheckResult:
    """Read-only readiness result suitable for server start guards."""

    state: SchemaState
    revision: str | None
    ready: bool
    differences: tuple[str, ...] = ()
    profile_id: str | None = None


@dataclass(frozen=True)
class SchemaEnsureResult:
    """Result of one schema state transition."""

    previous_state: SchemaState
    revision: str
    changed: bool
    backup: BackupReceipt | None = None
    profile_id: str | None = None
    business_data_unchanged: bool | None = None


@dataclass(frozen=True)
class SchemaStateRecord:
    """Persisted proof of the exact schema accepted at one Alembic revision."""

    profile_id: str
    revision: str
    schema_fingerprint: str


def _alembic_config(connection: Connection) -> Config:
    config = Config(str(ALEMBIC_INI))
    url = connection.engine.url.render_as_string(hide_password=False).replace("%", "%%")
    config.set_main_option("sqlalchemy.url", url)
    config.attributes["connection"] = connection
    return config


def _revision_contract(connection: Connection) -> tuple[str, frozenset[str]]:
    script = ScriptDirectory.from_config(_alembic_config(connection))
    head = script.get_current_head()
    if head is None:
        raise RevisionStateError("Alembic has no head revision")
    known = frozenset(revision.revision for revision in script.walk_revisions())
    return head, known


def _known_profile_ids() -> frozenset[str]:
    """Return profile identifiers trusted by the current bootstrap code."""

    return frozenset(
        {"canonical"}
        | {
            profile.profile_id
            for profile in legacy_profiles.LEGACY_SQLITE_PROFILES.values()
        }
    )


def _read_schema_state(connection: Connection) -> SchemaStateRecord | None:
    """Read and validate the singleton schema fingerprint checkpoint."""

    if SCHEMA_STATE_TABLE not in sa.inspect(connection).get_table_names():
        return None
    rows = connection.execute(
        sa.select(
            SCHEMA_STATE.c.id,
            SCHEMA_STATE.c.profile_id,
            SCHEMA_STATE.c.revision,
            SCHEMA_STATE.c.schema_fingerprint,
        )
    ).all()
    if not rows:
        return None
    if len(rows) != 1 or rows[0].id != 1:
        raise RevisionStateError("schema state table must contain exactly id=1")
    profile_id = str(rows[0].profile_id)
    revision = str(rows[0].revision)
    schema_fingerprint = str(rows[0].schema_fingerprint)
    if profile_id not in _known_profile_ids():
        raise RevisionStateError(
            f"unknown schema state profile: {profile_id}"
        )
    return SchemaStateRecord(
        profile_id=profile_id,
        revision=revision,
        schema_fingerprint=schema_fingerprint,
    )


def _legacy_profile_baseline_difference(
    state_record: SchemaStateRecord,
) -> str | None:
    """Return why a baseline profile/fingerprint pair is not approved."""

    if (
        state_record.profile_id == "canonical"
        or state_record.revision != LEGACY_PROFILE_REVISION
    ):
        return None
    approved_profile = next(
        (
            profile
            for profile in legacy_profiles.LEGACY_SQLITE_PROFILES.values()
            if profile.profile_id == state_record.profile_id
        ),
        None,
    )
    if (
        approved_profile is not None
        and approved_profile.schema_fingerprint == state_record.schema_fingerprint
    ):
        return None
    return (
        "schema state profile does not match approved baseline: "
        f"profile={state_record.profile_id} revision={state_record.revision}"
    )


def _write_schema_state(
    connection: Connection,
    *,
    profile_id: str,
    revision: str,
    schema_fingerprint: str,
) -> None:
    """Replace the singleton checkpoint after a successful stamp or upgrade."""

    if profile_id not in _known_profile_ids():
        raise RevisionStateError(f"unknown schema state profile: {profile_id}")
    SCHEMA_STATE.create(connection, checkfirst=True)
    connection.execute(sa.delete(SCHEMA_STATE))
    connection.execute(
        sa.insert(SCHEMA_STATE).values(
            id=1,
            profile_id=profile_id,
            revision=revision,
            schema_fingerprint=schema_fingerprint,
        )
    )


def _sqlite_schema_fingerprint(connection: Connection) -> str | None:
    """Return a SQLite application-schema fingerprint, or None for other DBs."""

    if connection.dialect.name != "sqlite":
        return None
    return legacy_profiles.sqlite_schema_fingerprint(connection)


def _normalize_sql(value: object | None) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip().lower()
    normalized = re.sub(r"[`\"\[\]]", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    while normalized.startswith("(") and normalized.endswith(")"):
        normalized = normalized[1:-1].strip()
    if len(normalized) >= 2 and normalized[0] == normalized[-1] == "'":
        normalized = normalized[1:-1]
    return re.sub(r"\s*([(),=<>|+\-])\s*", r"\1", normalized)


def _compiled_sql(expression: object, connection: Connection) -> str | None:
    if hasattr(expression, "compile"):
        expression = expression.compile(
            dialect=connection.dialect,
            compile_kwargs={"literal_binds": True},
        )
    return _normalize_sql(expression)


def _compiled_default(column: sa.Column, connection: Connection) -> str | None:
    if column.server_default is None or isinstance(column.server_default, sa.Computed):
        return None
    return _compiled_sql(column.server_default.arg, connection)


def _sqlite_computed_sql(
    connection: Connection,
    table_name: str,
    column_name: str,
) -> str | None:
    """Read a generated expression when SQLAlchemy's SQLite parser returns empty."""
    if connection.dialect.name != "sqlite":
        return None
    table_sql = connection.scalar(
        sa.text(
            "SELECT sql FROM sqlite_master "
            "WHERE type='table' AND name=:table_name"
        ),
        {"table_name": table_name},
    )
    if not table_sql:
        return None
    match = re.search(
        rf"\b{re.escape(column_name)}\b[^,]*?generated\s+always\s+as\s*\(",
        str(table_sql),
        flags=re.IGNORECASE | re.DOTALL,
    )
    if match is None:
        return None

    start = match.end()
    depth = 1
    in_quote = False
    index = start
    while index < len(table_sql):
        character = table_sql[index]
        if character == "'":
            if in_quote and index + 1 < len(table_sql) and table_sql[index + 1] == "'":
                index += 2
                continue
            in_quote = not in_quote
        elif not in_quote:
            if character == "(":
                depth += 1
            elif character == ")":
                depth -= 1
                if depth == 0:
                    return _normalize_sql(table_sql[start:index])
        index += 1
    return None


def _constraint_signature(constraints: list[dict[str, object]]) -> frozenset[tuple[str, str]]:
    return frozenset(
        (
            str(constraint.get("name") or ""),
            _normalize_sql(constraint.get("sqltext")) or "",
        )
        for constraint in constraints
    )


def _metadata_check_signature(table: sa.Table) -> frozenset[tuple[str, str]]:
    return frozenset(
        (str(constraint.name or ""), _normalize_sql(constraint.sqltext) or "")
        for constraint in table.constraints
        if isinstance(constraint, sa.CheckConstraint)
    )


def _is_sqlite_pk_nullable_artifact(
    difference: object,
    inspector: sa.Inspector,
) -> bool:
    """Ignore SQLite's nullable reflection quirk only when PK identity is exact."""
    if not isinstance(difference, list) or len(difference) != 1:
        return False
    operation = difference[0]
    if not isinstance(operation, tuple) or len(operation) < 7:
        return False
    if operation[0] != "modify_nullable" or operation[-2:] != (True, False):
        return False
    table_name = operation[2]
    column_name = operation[3]
    table = Base.metadata.tables.get(table_name)
    if table is None or column_name not in table.primary_key.columns:
        return False
    actual_primary_key = tuple(
        inspector.get_pk_constraint(table_name).get("constrained_columns") or ()
    )
    return column_name in actual_primary_key


def _sqlite_fk_signature(
    connection: Connection,
    table_name: str,
) -> frozenset[tuple[tuple[str, ...], str, tuple[str, ...], str, str]]:
    quoted_table = connection.dialect.identifier_preparer.quote(table_name)
    rows = connection.exec_driver_sql(
        f"PRAGMA foreign_key_list({quoted_table})"
    ).mappings()
    grouped: dict[int, list[sa.RowMapping]] = {}
    for row in rows:
        grouped.setdefault(int(row["id"]), []).append(row)
    return frozenset(
        (
            tuple(str(row["from"]) for row in sorted(group, key=lambda row: row["seq"])),
            str(group[0]["table"]),
            tuple(str(row["to"]) for row in sorted(group, key=lambda row: row["seq"])),
            str(group[0]["on_update"]).upper(),
            str(group[0]["on_delete"]).upper(),
        )
        for group in grouped.values()
    )


def _metadata_fk_signature(
    table: sa.Table,
) -> frozenset[tuple[tuple[str, ...], str, tuple[str, ...], str, str]]:
    return frozenset(
        (
            tuple(element.parent.name for element in constraint.elements),
            constraint.elements[0].column.table.name,
            tuple(element.column.name for element in constraint.elements),
            (constraint.onupdate or "NO ACTION").upper(),
            (constraint.ondelete or "NO ACTION").upper(),
        )
        for constraint in table.foreign_key_constraints
    )


def schema_differences(connection: Connection) -> tuple[str, ...]:
    """Return semantic drift evidence for an unversioned database."""
    inspector = sa.inspect(connection)
    context = MigrationContext.configure(
        connection,
        opts={
            "compare_type": compare_migration_type,
            "include_object": (
                lambda obj, name, type_, reflected, compare_to: name
                not in {VERSION_TABLE, SCHEMA_STATE_TABLE}
            ),
        },
    )
    # Alembic only warns for computed-expression drift; the explicit comparison
    # below turns that condition into fail-closed evidence.
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message=r"Computed default .* cannot be modified",
            category=UserWarning,
        )
        metadata_differences = compare_metadata(context, Base.metadata)
    if connection.dialect.name == "sqlite":
        metadata_differences = [
            difference
            for difference in metadata_differences
            if not (
                isinstance(difference, tuple)
                and difference
                and difference[0] in {"add_fk", "remove_fk"}
            )
            and not _is_sqlite_pk_nullable_artifact(difference, inspector)
        ]
    differences = [f"Alembic metadata diff: {diff!r}" for diff in metadata_differences]
    actual_tables = set(inspector.get_table_names())

    for table_name, table in sorted(Base.metadata.tables.items()):
        if table_name not in actual_tables:
            continue
        expected_primary_key = tuple(column.name for column in table.primary_key.columns)
        actual_primary_key = tuple(
            inspector.get_pk_constraint(table_name).get("constrained_columns") or ()
        )
        if expected_primary_key != actual_primary_key:
            differences.append(
                f"primary key mismatch: {table_name} "
                f"expected={expected_primary_key!r} actual={actual_primary_key!r}"
            )
        actual_columns = {column["name"]: column for column in inspector.get_columns(table_name)}
        for column in table.columns:
            actual = actual_columns.get(column.name)
            if actual is None:
                continue
            expected_default = _compiled_default(column, connection)
            actual_default = _normalize_sql(actual.get("default"))
            if expected_default != actual_default:
                differences.append(
                    f"server default mismatch: {table_name}.{column.name} "
                    f"expected={expected_default!r} actual={actual_default!r}"
                )

            expected_computed = column.computed
            actual_computed = actual.get("computed")
            if expected_computed is None and actual_computed is None:
                continue
            if expected_computed is None or actual_computed is None:
                differences.append(f"computed column mismatch: {table_name}.{column.name}")
                continue
            expected_sql = _compiled_sql(expected_computed.sqltext, connection)
            actual_sql = _normalize_sql(actual_computed.get("sqltext"))
            if not actual_sql:
                actual_sql = _sqlite_computed_sql(
                    connection,
                    table_name,
                    column.name,
                )
            expected_persisted = expected_computed.persisted
            actual_persisted = actual_computed.get("persisted")
            if expected_sql != actual_sql or expected_persisted != actual_persisted:
                differences.append(
                    f"computed column mismatch: {table_name}.{column.name} "
                    f"expected={expected_sql!r}/{expected_persisted!r} "
                    f"actual={actual_sql!r}/{actual_persisted!r}"
                )

        expected_checks = _metadata_check_signature(table)
        actual_checks = _constraint_signature(inspector.get_check_constraints(table_name))
        if expected_checks != actual_checks:
            differences.append(
                f"check constraint mismatch: {table_name} "
                f"expected={sorted(expected_checks)!r} actual={sorted(actual_checks)!r}"
            )
        if connection.dialect.name == "sqlite":
            expected_foreign_keys = _metadata_fk_signature(table)
            actual_foreign_keys = _sqlite_fk_signature(connection, table_name)
            if expected_foreign_keys != actual_foreign_keys:
                differences.append(
                    f"foreign key mismatch: {table_name} "
                    f"expected={sorted(expected_foreign_keys)!r} "
                    f"actual={sorted(actual_foreign_keys)!r}"
                )

    return tuple(differences)


def validate_unversioned_data(connection: Connection) -> None:
    """Validate legacy item rows without mutating them."""
    null_count = connection.scalar(
        sa.text(
            "SELECT COUNT(*) FROM items WHERE model_symbol IS NULL "
            "OR process_type_code IS NULL OR serial_no IS NULL"
        )
    )
    if null_count:
        raise DataPreflightError(
            f"items decomposition fields contain null values ({null_count} row(s))"
        )

    model_9_count = connection.scalar(
        sa.text(
            "SELECT COUNT(*) FROM items "
            "WHERE mes_code LIKE '9-TR-%' AND model_symbol <> '9'"
        )
    )
    if model_9_count:
        raise DataPreflightError(
            f"9-TR-* rows must have model_symbol='9' ({model_9_count} invalid row(s))"
        )


def _is_pre_assembly_checklist_schema(
    tables: set[str],
    differences: tuple[str, ...],
) -> bool:
    """Recognize the exact pre-checklist schema for safe Alembic onboarding."""

    missing_tables = set(Base.metadata.tables) - tables
    return (
        missing_tables == ASSEMBLY_CHECKLIST_TABLES
        and all("assembly_checklist" in str(difference) for difference in differences)
    )


def inspect_schema(connection: Connection) -> SchemaInspection:
    """Classify a database without changing schema or data."""
    head, known_revisions = _revision_contract(connection)
    tables = set(sa.inspect(connection).get_table_names())
    if VERSION_TABLE in tables:
        rows = list(connection.scalars(sa.text(f"SELECT version_num FROM {VERSION_TABLE}")))
        if not rows:
            raise RevisionStateError("Alembic version table is empty")
        if len(rows) != 1:
            raise RevisionStateError("Alembic version table must contain exactly one revision")
        revision = rows[0]
        if revision not in known_revisions:
            raise RevisionStateError(f"unknown Alembic revision: {revision}")
        state_record = _read_schema_state(connection)
        profile_id = state_record.profile_id if state_record is not None else None
        schema_fingerprint = _sqlite_schema_fingerprint(connection)
        if state_record is not None and state_record.revision != revision:
            raise RevisionStateError(
                "schema state revision does not match Alembic revision: "
                f"state={state_record.revision} alembic={revision}"
            )
        differences: tuple[str, ...] = ()
        if (
            connection.dialect.name == "sqlite"
            and revision == head
            and state_record is None
        ):
            differences = (
                "schema state checkpoint is missing for the current SQLite revision",
            )
        elif state_record is not None and schema_fingerprint is not None:
            if state_record.schema_fingerprint != schema_fingerprint:
                differences = (
                    "schema fingerprint mismatch: "
                    f"expected={state_record.schema_fingerprint} "
                    f"actual={schema_fingerprint}",
                )
            elif baseline_difference := _legacy_profile_baseline_difference(
                state_record
            ):
                differences = (baseline_difference,)
            elif profile_id == "canonical" and revision == head:
                differences = schema_differences(connection)
        elif revision == head:
            differences = schema_differences(connection)
        return SchemaInspection(
            SchemaState.VERSIONED,
            revision=revision,
            differences=differences,
            profile_id=profile_id,
            schema_fingerprint=schema_fingerprint,
        )

    if not tables - {SCHEMA_STATE_TABLE}:
        return SchemaInspection(SchemaState.EMPTY)

    differences = schema_differences(connection)
    if differences:
        if _is_pre_assembly_checklist_schema(tables, differences):
            validate_unversioned_data(connection)
            return SchemaInspection(
                SchemaState.UNVERSIONED_CURRENT,
                profile_id="canonical",
                schema_fingerprint=_sqlite_schema_fingerprint(connection),
            )
        profile = legacy_profiles.find_sqlite_legacy_profile(connection)
        if profile is not None:
            return SchemaInspection(
                SchemaState.UNVERSIONED_LEGACY,
                differences=differences,
                profile_id=profile.profile_id,
                schema_fingerprint=profile.schema_fingerprint,
            )
        return SchemaInspection(
            SchemaState.UNVERSIONED_MISMATCH,
            differences=differences,
        )
    validate_unversioned_data(connection)
    return SchemaInspection(
        SchemaState.UNVERSIONED_CURRENT,
        profile_id="canonical",
        schema_fingerprint=_sqlite_schema_fingerprint(connection),
    )


def take_verified_backup(
    connection: Connection,
    backup_provider: BackupProvider | None,
) -> BackupReceipt:
    """Obtain a published, verified receipt before an unversioned stamp."""
    provider = backup_provider
    if provider is None:
        if connection.dialect.name != "sqlite":
            raise BackupError(
                "PostgreSQL unversioned onboarding requires an injected verified backup provider"
            )
        database = connection.engine.url.database
        if not database or database == ":memory:":
            raise BackupError("SQLite unversioned onboarding requires a file database")
        if str(PROJECT_ROOT) not in sys.path:
            sys.path.insert(0, str(PROJECT_ROOT))
        from scripts.ops.backup_db import backup_sqlite

        def provider(_connection: Connection) -> BackupReceipt:
            try:
                path = backup_sqlite(str(Path(database).resolve()))
            except SystemExit as exc:
                raise BackupError(f"SQLite backup failed with exit code {exc.code}") from exc
            return BackupReceipt(path=path, verified=True)

    try:
        receipt = provider(connection)
    except BackupError:
        raise
    except Exception as exc:
        raise BackupError(f"verified backup failed: {exc}") from exc
    if not isinstance(receipt, BackupReceipt):
        raise BackupError("backup provider did not return a BackupReceipt")
    if not receipt.verified:
        raise BackupError("backup receipt is not verified")
    if not receipt.path.is_file():
        raise BackupError(f"backup receipt path does not exist: {receipt.path}")
    return receipt


def _assert_head_schema(connection: Connection) -> None:
    differences = schema_differences(connection)
    if differences:
        raise SchemaMismatchError(differences)


def _assert_managed_head(connection: Connection, head: str) -> None:
    """Require the version, checkpoint, and current schema to agree at head."""

    inspection = inspect_schema(connection)
    if inspection.revision != head or inspection.differences:
        differences = inspection.differences or (
            f"Alembic revision mismatch: expected={head} actual={inspection.revision}",
        )
        raise SchemaMismatchError(differences)


def _record_sqlite_schema_state(
    connection: Connection,
    *,
    profile_id: str,
    revision: str,
) -> None:
    """Record the exact SQLite application schema accepted at this revision."""

    fingerprint = _sqlite_schema_fingerprint(connection)
    if fingerprint is None:
        return
    _write_schema_state(
        connection,
        profile_id=profile_id,
        revision=revision,
        schema_fingerprint=fingerprint,
    )


def _begin_sqlite_immediate_transaction(connection: Connection) -> None:
    """Start a real SQLite transaction before transactional DDL is attempted."""

    if connection.dialect.name != "sqlite":
        return
    driver_connection = connection.connection.driver_connection
    if not driver_connection.in_transaction:
        connection.exec_driver_sql("BEGIN IMMEDIATE")


def _stamp_unversioned_schema(
    connection: Connection,
    *,
    inspection: SchemaInspection,
    config: Config,
    head: str,
    backup_provider: BackupProvider | None,
) -> tuple[BackupReceipt, bool | None]:
    """Back up and stamp one approved unversioned schema without touching app data."""

    receipt = take_verified_backup(connection, backup_provider)
    if connection.dialect.name == "sqlite":
        current_fingerprint = legacy_profiles.sqlite_schema_fingerprint(connection)
        if current_fingerprint != inspection.schema_fingerprint:
            raise SchemaMismatchError(
                (
                    "schema fingerprint changed during verified backup: "
                    f"expected={inspection.schema_fingerprint} "
                    f"actual={current_fingerprint}",
                )
            )
        if inspection.state is SchemaState.UNVERSIONED_LEGACY:
            validate_unversioned_data(connection)
    before_data = (
        legacy_profiles.sqlite_business_data_fingerprint(connection)
        if connection.dialect.name == "sqlite"
        else None
    )
    if connection.dialect.name == "sqlite":
        SCHEMA_STATE.create(connection, checkfirst=True)
    command.stamp(config, LEGACY_PROFILE_STAMP_REVISION)
    after_data = (
        legacy_profiles.sqlite_business_data_fingerprint(connection)
        if connection.dialect.name == "sqlite"
        else None
    )
    if before_data != after_data:
        raise DataFingerprintError(
            "business data fingerprint changed during Alembic baseline stamp"
        )
    command.upgrade(config, "head")
    profile_id = inspection.profile_id or "canonical"
    _record_sqlite_schema_state(
        connection,
        profile_id=profile_id,
        revision=head,
    )
    if connection.dialect.name == "sqlite":
        _assert_managed_head(connection, head)
    else:
        _assert_head_schema(connection)
    return receipt, before_data == after_data if before_data is not None else None


@contextmanager
def readonly_connection(database_url: str | None = None) -> Iterator[Connection]:
    """Open one check-only connection without using application engine hooks."""
    load_dotenv(BACKEND_DIR / ".env", override=False)
    configured_url = database_url or os.getenv(
        "DATABASE_URL",
        f"sqlite:///{(BACKEND_DIR / 'mes.db').as_posix()}",
    )
    try:
        url = sa.engine.make_url(configured_url)
    except sa.exc.ArgumentError as exc:
        raise ReadOnlyConnectionError(f"invalid DATABASE_URL: {exc}") from exc

    engine: Engine | None = None
    try:
        if url.get_backend_name() == "sqlite":
            database = url.database
            if not database or database == ":memory:":
                raise ReadOnlyConnectionError(
                    "read-only schema check requires an existing SQLite file"
                )
            path = Path(database).expanduser()
            if not path.is_absolute():
                path = Path.cwd() / path
            path = path.resolve()
            if not path.is_file():
                raise ReadOnlyConnectionError(f"SQLite database file does not exist: {path}")
            uri = f"{path.as_uri()}?mode=ro"
            engine = sa.create_engine(
                "sqlite+pysqlite://",
                creator=lambda: sqlite3.connect(uri, uri=True),
                poolclass=NullPool,
            )
        elif url.get_backend_name() == "postgresql":
            engine = sa.create_engine(url, poolclass=NullPool)
        else:
            raise ReadOnlyConnectionError(
                f"unsupported read-only database dialect: {url.get_backend_name()}"
            )

        with engine.connect() as connection:
            if connection.dialect.name == "postgresql":
                connection.exec_driver_sql("SET TRANSACTION READ ONLY")
            yield connection
    except SchemaBootstrapError:
        raise
    except (OSError, sqlite3.Error, sa.exc.SQLAlchemyError) as exc:
        raise ReadOnlyConnectionError(f"read-only database check failed: {exc}") from exc
    finally:
        if engine is not None:
            engine.dispose()


@contextmanager
def _ensure_connection(
    *,
    connection: Connection | None,
    engine: Engine | None,
    write: bool,
) -> Iterator[Connection]:
    if connection is not None and engine is not None:
        raise ValueError("pass either connection or engine, not both")
    if connection is not None:
        if write and not connection.in_transaction():
            with connection.begin():
                yield connection
        else:
            yield connection
        return
    if engine is None:
        from app.database import engine as default_engine

        engine = default_engine
    if write:
        with engine.begin() as opened:
            yield opened
    else:
        with engine.connect() as opened:
            yield opened


def check_schema(
    *,
    connection: Connection | None = None,
    engine: Engine | None = None,
) -> SchemaCheckResult:
    """Report readiness without upgrading or stamping the database."""
    with _ensure_connection(connection=connection, engine=engine, write=False) as active:
        inspection = inspect_schema(active)
        head, _ = _revision_contract(active)
        return SchemaCheckResult(
            state=inspection.state,
            revision=inspection.revision,
            ready=(
                inspection.state is SchemaState.VERSIONED
                and inspection.revision == head
                and not inspection.differences
            ),
            differences=inspection.differences,
            profile_id=inspection.profile_id,
        )


def ensure_schema(
    *,
    connection: Connection | None = None,
    engine: Engine | None = None,
    backup_provider: BackupProvider | None = None,
) -> SchemaEnsureResult:
    """Upgrade, or safely onboard, one database through the Alembic path."""
    with _ensure_connection(connection=connection, engine=engine, write=True) as active:
        _begin_sqlite_immediate_transaction(active)
        inspection = inspect_schema(active)
        config = _alembic_config(active)
        head, _ = _revision_contract(active)

        if inspection.state is SchemaState.UNVERSIONED_MISMATCH:
            raise SchemaMismatchError(inspection.differences)
        if inspection.state is SchemaState.EMPTY:
            command.upgrade(config, "head")
            _assert_head_schema(active)
            _record_sqlite_schema_state(
                active,
                profile_id="canonical",
                revision=head,
            )
            if active.dialect.name == "sqlite":
                _assert_managed_head(active, head)
            return SchemaEnsureResult(
                previous_state=inspection.state,
                revision=head,
                changed=True,
                profile_id="canonical",
            )
        if inspection.state in {
            SchemaState.UNVERSIONED_CURRENT,
            SchemaState.UNVERSIONED_LEGACY,
        }:
            if inspection.state is SchemaState.UNVERSIONED_LEGACY:
                validate_unversioned_data(active)
            receipt, business_data_unchanged = _stamp_unversioned_schema(
                active,
                inspection=inspection,
                config=config,
                head=head,
                backup_provider=backup_provider,
            )
            return SchemaEnsureResult(
                previous_state=inspection.state,
                revision=head,
                changed=True,
                backup=receipt,
                profile_id=inspection.profile_id or "canonical",
                business_data_unchanged=business_data_unchanged,
            )

        if inspection.revision == head:
            if inspection.differences:
                raise SchemaMismatchError(inspection.differences)
            if inspection.profile_id is not None:
                return SchemaEnsureResult(
                    previous_state=inspection.state,
                    revision=head,
                    changed=False,
                    profile_id=inspection.profile_id,
                )

        command.upgrade(config, "head")
        profile_id = inspection.profile_id or "canonical"
        if profile_id == "canonical":
            _assert_head_schema(active)
        _record_sqlite_schema_state(
            active,
            profile_id=profile_id,
            revision=head,
        )
        if active.dialect.name == "sqlite":
            _assert_managed_head(active, head)
        else:
            _assert_head_schema(active)
        return SchemaEnsureResult(
            previous_state=inspection.state,
            revision=head,
            changed=inspection.revision != head,
            profile_id=profile_id,
        )


__all__ = [
    "BackupError",
    "BackupReceipt",
    "DataFingerprintError",
    "DataPreflightError",
    "RevisionStateError",
    "ReadOnlyConnectionError",
    "SchemaBootstrapError",
    "SchemaCheckResult",
    "SchemaEnsureResult",
    "SchemaMismatchError",
    "SchemaState",
    "check_schema",
    "ensure_schema",
    "inspect_schema",
    "readonly_connection",
    "schema_differences",
    "take_verified_backup",
    "validate_unversioned_data",
]
