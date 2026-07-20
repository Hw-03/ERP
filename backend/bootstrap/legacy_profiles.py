"""Known SQLite legacy profiles accepted for one-time Alembic onboarding."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy.engine import Connection


ALEMBIC_INFRASTRUCTURE_TABLES: frozenset[str] = frozenset(
    {"alembic_version", "alembic_schema_state"}
)


@dataclass(frozen=True)
class LegacySQLiteProfile:
    """One exact, reviewed SQLite schema allowed to receive a baseline stamp."""

    profile_id: str
    schema_fingerprint: str


LEGACY_SQLITE_PROFILES: dict[str, LegacySQLiteProfile] = {
    "6b928be4909dedb8710baace333a3c322ca13be61cbf678ad007aa7cbab56839": LegacySQLiteProfile(
        profile_id="dev_legacy_20260720",
        schema_fingerprint="6b928be4909dedb8710baace333a3c322ca13be61cbf678ad007aa7cbab56839",
    ),
    "336f8abcaaea28b7b99bb56afe911728854696c1b208ac9d3a289e77110eae76": LegacySQLiteProfile(
        profile_id="employee_legacy_20260720",
        schema_fingerprint="336f8abcaaea28b7b99bb56afe911728854696c1b208ac9d3a289e77110eae76",
    ),
}


def sqlite_schema_fingerprint(connection: Connection) -> str:
    """Hash application schema objects while excluding Alembic infrastructure."""

    if connection.dialect.name != "sqlite":
        raise ValueError("SQLite schema fingerprint requires a SQLite connection")
    rows = connection.exec_driver_sql(
        "SELECT type, name, tbl_name, COALESCE(sql, '') "
        "FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' "
        "ORDER BY type, name"
    ).all()
    manifest = [
        list(row)
        for row in rows
        if not _is_alembic_infrastructure_object(row)
    ]
    return _json_sha256(manifest)


def sqlite_business_data_fingerprint(connection: Connection) -> str:
    """Hash every application-table value without exposing row contents."""

    if connection.dialect.name != "sqlite":
        raise ValueError("SQLite data fingerprint requires a SQLite connection")
    preparer = connection.dialect.identifier_preparer
    tables = [
        str(row[0])
        for row in connection.exec_driver_sql(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        if str(row[0]) not in ALEMBIC_INFRASTRUCTURE_TABLES
    ]
    manifest: list[list[Any]] = []
    for table_name in tables:
        quoted_table = preparer.quote(table_name)
        column_rows = connection.exec_driver_sql(
            f"PRAGMA table_xinfo({quoted_table})"
        ).mappings()
        column_names = [
            str(row["name"])
            for row in column_rows
            if int(row.get("hidden") or 0) != 1
        ]
        quoted_columns = ", ".join(preparer.quote(name) for name in column_names)
        encoded_rows = sorted(
            _encoded_row(row)
            for row in connection.exec_driver_sql(
                f"SELECT {quoted_columns} FROM {quoted_table}"
            )
        )
        manifest.append([table_name, column_names, encoded_rows])
    return _json_sha256(manifest)


def find_sqlite_legacy_profile(connection: Connection) -> LegacySQLiteProfile | None:
    """Return the approved profile matching this exact SQLite schema, if any."""

    if connection.dialect.name != "sqlite":
        return None
    return LEGACY_SQLITE_PROFILES.get(sqlite_schema_fingerprint(connection))


def _is_alembic_infrastructure_object(row: Any) -> bool:
    """Exclude only Alembic tables and indexes/triggers owned by those tables."""

    object_type, name, table_name, _sql = row
    if str(object_type) == "table":
        return str(name) in ALEMBIC_INFRASTRUCTURE_TABLES
    if str(object_type) in {"index", "trigger"}:
        return str(table_name) in ALEMBIC_INFRASTRUCTURE_TABLES
    return False


def _encoded_row(row: Any) -> str:
    """Encode one SQLite row with stable value type tags before hashing."""

    encoded = [_encoded_value(value) for value in row]
    return json.dumps(encoded, ensure_ascii=True, separators=(",", ":"))


def _encoded_value(value: Any) -> list[str]:
    """Preserve SQLite storage-class distinctions in the private digest input."""

    if value is None:
        return ["null", ""]
    if isinstance(value, bytes):
        return ["blob", value.hex()]
    if isinstance(value, float):
        return ["real", value.hex()]
    if isinstance(value, int):
        return ["integer", str(value)]
    return ["text", str(value)]


def _json_sha256(value: Any) -> str:
    """Return a deterministic SHA-256 over compact ASCII JSON."""

    payload = json.dumps(value, ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


__all__ = [
    "LEGACY_SQLITE_PROFILES",
    "ALEMBIC_INFRASTRUCTURE_TABLES",
    "LegacySQLiteProfile",
    "find_sqlite_legacy_profile",
    "sqlite_business_data_fingerprint",
    "sqlite_schema_fingerprint",
]
