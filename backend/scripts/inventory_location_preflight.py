"""Read-only physical-placement preflight for the IC-06 approval gate."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys
import uuid
from collections import defaultdict
from contextlib import contextmanager
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import unquote, urlsplit

from sqlalchemy.exc import SQLAlchemyError


REQUIRED_COLUMNS = {
    "items": {"item_id", "mes_code", "item_name", "deleted_at"},
    "inventory": {"item_id", "warehouse_qty"},
    "warehouse_angles": {"id"},
    "warehouse_boxes": {"box_id", "angle_id"},
    "warehouse_box_items": {"id", "box_id", "item_id", "quantity"},
    "warehouse_special_zones": {"id", "is_active"},
    "warehouse_special_zone_items": {"id", "zone_id", "item_id", "quantity"},
}


class PreflightError(RuntimeError):
    """The snapshot cannot be read safely enough to produce an audit report."""


def _canonical_bytes(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _canonical_sha256(value: object) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _integer(value: object, *, field: str) -> int:
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError) as error:
        raise PreflightError(f"{field} must be an integer") from error
    if parsed != parsed.to_integral_value():
        raise PreflightError(f"{field} must be an integer")
    return int(parsed)


def _json_value(value: object) -> object:
    """Normalize DBAPI values before they enter the canonical snapshot JSON."""
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else str(value)
    if isinstance(value, (uuid.UUID, date, datetime)):
        return str(value) if isinstance(value, uuid.UUID) else value.isoformat()
    raise PreflightError(f"unsupported database value type: {type(value).__name__}")


def _normalized_zone_activity(value: object) -> bool:
    """Accept only the SQLite integer and PostgreSQL boolean activity representations."""
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in {0, 1}:
        return bool(value)
    raise PreflightError("warehouse_special_zones.is_active must be false, true, 0, or 1")


def _normalized_deleted_at(value: object) -> str | None:
    """Make SQLite text and PostgreSQL datetime soft-deletion values canonical."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.astimezone(timezone.utc).isoformat() if parsed.tzinfo is not None else parsed.isoformat()
        except ValueError as error:
            raise PreflightError("items.deleted_at must be an ISO datetime") from error
    raise PreflightError("items.deleted_at must be an ISO datetime")


def _sqlite_path(database_url: str) -> Path:
    parsed = urlsplit(database_url)
    if parsed.scheme not in {"sqlite", "sqlite+pysqlite"}:
        raise PreflightError("unsupported database URL")
    if parsed.netloc not in {"", "localhost"}:
        raise PreflightError("SQLite URL must name a local file")
    path_text = unquote(parsed.path)
    if os.name == "nt" and len(path_text) >= 3 and path_text[0] == "/" and path_text[2] == ":":
        path_text = path_text[1:]
    path = Path(path_text)
    if not path_text or str(path) in {".", ":memory:"} or not path.is_file():
        raise PreflightError("SQLite database file is missing or not a regular file")
    return path.resolve()


@contextmanager
def _readonly_connection(database_url: str) -> Iterator[tuple[str, Any]]:
    scheme = urlsplit(database_url).scheme
    if scheme in {"sqlite", "sqlite+pysqlite"}:
        path = _sqlite_path(database_url)
        connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
        try:
            connection.execute("PRAGMA query_only = ON")
            connection.execute("BEGIN")
            yield "sqlite", connection
        finally:
            try:
                connection.rollback()
            finally:
                connection.close()
        return

    if scheme in {"postgresql", "postgres", "postgresql+psycopg", "postgresql+psycopg2"}:
        try:
            from sqlalchemy import create_engine
        except ImportError as error:  # pragma: no cover - dependency is installed for the backend
            raise PreflightError("PostgreSQL read-only support requires SQLAlchemy") from error
        engine = create_engine(database_url)
        postgres_connection: Any | None = None
        try:
            postgres_connection = engine.connect()
            try:
                postgres_connection.exec_driver_sql("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
                yield "postgresql", postgres_connection
            finally:
                postgres_connection.rollback()
        finally:
            try:
                if postgres_connection is not None:
                    postgres_connection.close()
            finally:
                engine.dispose()
        return

    raise PreflightError("unsupported database URL")


def _rows(dialect: str, connection: Any, query: str) -> list[dict[str, object]]:
    if dialect == "sqlite":
        cursor = connection.execute(query)
        columns = [column[0] for column in cursor.description]
        return [
            {column: _json_value(value) for column, value in zip(columns, row, strict=True)}
            for row in cursor.fetchall()
        ]
    return [
        {column: _json_value(value) for column, value in row.items()}
        for row in connection.exec_driver_sql(query).mappings().all()
    ]


def _assert_schema(dialect: str, connection: Any) -> None:
    if dialect == "sqlite":
        table_rows = _rows(dialect, connection, "SELECT name FROM sqlite_master WHERE type = 'table'")
        present_tables = {str(row["name"]) for row in table_rows}
        for table, required in REQUIRED_COLUMNS.items():
            if table not in present_tables:
                raise PreflightError(f"required table is missing: {table}")
            columns = _rows(dialect, connection, f"PRAGMA table_xinfo({table})")
            present_columns = {str(row["name"]) for row in columns}
            missing = sorted(required - present_columns)
            if missing:
                raise PreflightError(f"required columns are missing from {table}: {', '.join(missing)}")
        return

    rows = _rows(
        dialect,
        connection,
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()",
    )
    table_rows = _rows(
        dialect,
        connection,
        "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = current_schema()",
    )
    columns_by_table: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        columns_by_table[str(row["table_name"])].add(str(row["column_name"]))
    table_types = {str(row["table_name"]): str(row["table_type"]) for row in table_rows}
    for table, required in REQUIRED_COLUMNS.items():
        table_type = table_types.get(table)
        if table_type is None:
            raise PreflightError(f"required table is missing: {table}")
        if table_type != "BASE TABLE":
            raise PreflightError(f"required table is not a base table: {table}")
        missing = sorted(required - columns_by_table.get(table, set()))
        if missing:
            raise PreflightError(f"required columns are missing from {table}: {', '.join(missing)}")


def _snapshot(dialect: str, connection: Any) -> dict[str, list[dict[str, object]]]:
    items = _rows(dialect, connection, "SELECT item_id, mes_code, item_name, deleted_at FROM items ORDER BY item_id")
    for row in items:
        row["deleted_at"] = _normalized_deleted_at(row["deleted_at"])
    zones = _rows(dialect, connection, "SELECT id, is_active FROM warehouse_special_zones ORDER BY id")
    for row in zones:
        row["is_active"] = _normalized_zone_activity(row["is_active"])
    return {
        "items": items,
        "inventory": _rows(dialect, connection, "SELECT item_id, warehouse_qty FROM inventory ORDER BY item_id"),
        "warehouse_angles": _rows(dialect, connection, "SELECT id FROM warehouse_angles ORDER BY id"),
        "warehouse_boxes": _rows(dialect, connection, "SELECT box_id, angle_id FROM warehouse_boxes ORDER BY box_id"),
        "warehouse_box_items": _rows(dialect, connection, "SELECT id, box_id, item_id, quantity FROM warehouse_box_items ORDER BY id"),
        "warehouse_special_zones": zones,
        "warehouse_special_zone_items": _rows(dialect, connection, "SELECT id, zone_id, item_id, quantity FROM warehouse_special_zone_items ORDER BY id"),
    }


def _report(snapshot: dict[str, list[dict[str, object]]]) -> dict[str, object]:
    items = {str(row["item_id"]): row for row in snapshot["items"]}
    active_items = {item_id for item_id, row in items.items() if row["deleted_at"] is None}
    box_ids = {str(row["box_id"]) for row in snapshot["warehouse_boxes"]}
    angle_ids = {str(row["id"]) for row in snapshot["warehouse_angles"]}
    zones = {str(row["id"]): row["is_active"] for row in snapshot["warehouse_special_zones"]}
    inventory = {
        str(row["item_id"]): _integer(row["warehouse_qty"], field="inventory.warehouse_qty")
        for row in snapshot["inventory"]
    }
    box_total: dict[str, int] = defaultdict(int)
    zone_total: dict[str, int] = defaultdict(int)
    orphan_rows: list[dict[str, str]] = []
    inactive_zone_quantities: list[dict[str, object]] = []
    negative_rows: list[dict[str, object]] = []
    duplicate_rows: dict[tuple[str, str, str], list[dict[str, object]]] = defaultdict(list)

    for item_id, quantity in inventory.items():
        if quantity < 0:
            negative_rows.append({"scope": "inventory", "row_id": item_id, "item_id": item_id, "quantity": quantity})
        if item_id not in active_items:
            orphan_rows.append({"container_type": "inventory", "container_id": "", "row_id": item_id, "item_id": item_id, "reason": "missing_or_deleted_item"})

    for box in snapshot["warehouse_boxes"]:
        box_id = str(box["box_id"])
        if str(box["angle_id"]) not in angle_ids:
            orphan_rows.append(
                {"container_type": "box", "container_id": box_id, "row_id": box_id, "item_id": "", "reason": "missing_angle"}
            )

    for row in snapshot["warehouse_box_items"]:
        row_id = str(row["id"])
        box_id = str(row["box_id"])
        item_id = str(row["item_id"])
        quantity = _integer(row["quantity"], field="warehouse_box_items.quantity")
        if quantity < 0:
            negative_rows.append({"scope": "box", "row_id": row_id, "item_id": item_id, "quantity": quantity})
        duplicate_rows[("box", box_id, item_id)].append({"row_id": row_id, "quantity": quantity})
        if box_id not in box_ids:
            orphan_rows.append({"container_type": "box", "container_id": box_id, "row_id": row_id, "item_id": item_id, "reason": "missing_container"})
        elif item_id not in active_items:
            orphan_rows.append({"container_type": "box", "container_id": box_id, "row_id": row_id, "item_id": item_id, "reason": "missing_item"})
        else:
            box_total[item_id] += quantity

    for row in snapshot["warehouse_special_zone_items"]:
        row_id = str(row["id"])
        zone_id = str(row["zone_id"])
        item_id = str(row["item_id"])
        quantity = _integer(row["quantity"], field="warehouse_special_zone_items.quantity")
        active = zones.get(zone_id)
        if quantity < 0:
            if active is True:
                scope = "active_special_zone"
            elif active is False:
                scope = "inactive_special_zone"
            else:
                scope = "orphan_special_zone"
            negative_rows.append({"scope": scope, "row_id": row_id, "item_id": item_id, "quantity": quantity})
        duplicate_rows[("special_zone", zone_id, item_id)].append({"row_id": row_id, "quantity": quantity})
        if active is False:
            inactive_zone_quantities.append(
                {
                    "zone_id": _integer(row["zone_id"], field="warehouse_special_zone_items.zone_id"),
                    "item_id": item_id,
                    "quantity": quantity,
                }
            )
        if active is None:
            orphan_rows.append({"container_type": "special_zone", "container_id": zone_id, "row_id": row_id, "item_id": item_id, "reason": "missing_container"})
        elif item_id not in active_items:
            orphan_rows.append({"container_type": "special_zone", "container_id": zone_id, "row_id": row_id, "item_id": item_id, "reason": "missing_item"})
        elif active:
            zone_total[item_id] += quantity

    inventory_rows: list[dict[str, object]] = []
    for item_id in sorted(active_items & set(inventory), key=lambda value: (str(items[value]["mes_code"] or ""), value)):
        warehouse_qty = inventory[item_id]
        box_qty = box_total[item_id]
        special_zone_qty = zone_total[item_id]
        inventory_rows.append(
            {
                "item_id": item_id,
                "mes_code": str(items[item_id]["mes_code"] or ""),
                "w": warehouse_qty,
                "b": box_qty,
                "z": special_zone_qty,
                "u_candidate": warehouse_qty - box_qty - special_zone_qty,
            }
        )

    for item_id in sorted(active_items - set(inventory), key=lambda value: (str(items[value]["mes_code"] or ""), value)):
        orphan_rows.append(
            {
                "container_type": "inventory",
                "container_id": "",
                "row_id": item_id,
                "item_id": item_id,
                "reason": "missing_inventory",
            }
        )

    overplaced_items = []
    for item_id in sorted(active_items & (set(inventory) | set(box_total) | set(zone_total)), key=lambda value: (str(items[value]["mes_code"] or ""), value)):
        warehouse_qty = inventory.get(item_id, 0)
        placed_total = box_total[item_id] + zone_total[item_id]
        if placed_total > warehouse_qty:
            overplaced_items.append(
                {
                    "item_id": item_id,
                    "mes_code": str(items[item_id]["mes_code"] or ""),
                    "w": warehouse_qty,
                    "b_plus_z": placed_total,
                }
            )

    return {
        "inventory_rows": inventory_rows,
        "w_only_items": [
            {"item_id": row["item_id"], "mes_code": row["mes_code"], "w": row["w"]}
            for row in inventory_rows
            if row["w"] != 0 and row["b"] == 0 and row["z"] == 0
        ],
        "inactive_zone_quantities": sorted(inactive_zone_quantities, key=lambda row: (row["zone_id"], row["item_id"])),
        "duplicate_container_items": [
            {
                "container_type": kind,
                "container_id": container_id,
                "item_id": item_id,
                "row_count": len(values),
                "rows": sorted(values, key=lambda row: str(row["row_id"])),
                "total_quantity": sum(_integer(row["quantity"], field="duplicate_container_items.quantity") for row in values),
            }
            for (kind, container_id, item_id), values in sorted(duplicate_rows.items())
            if len(values) > 1
        ],
        "orphan_rows": sorted(orphan_rows, key=lambda row: (row["container_type"], row["container_id"], row["item_id"], row["row_id"])),
        "negative_rows": sorted(negative_rows, key=lambda row: (row["scope"], row["item_id"], row["row_id"])),
        "overplaced_items": overplaced_items,
    }


def collect_preflight(database_url: str) -> dict[str, object]:
    """Read the placement snapshot and return a deterministic, mutation-free report."""
    with _readonly_connection(database_url) as (dialect, connection):
        _assert_schema(dialect, connection)
        snapshot = _snapshot(dialect, connection)
        report = _report(snapshot)
    report["snapshot_sha256"] = _canonical_sha256(snapshot)
    report["report_sha256"] = _canonical_sha256(report)
    return report


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db-url", required=True, help="SQLite or PostgreSQL database URL")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    try:
        report = collect_preflight(parse_args(argv).db_url)
    except PreflightError as error:
        print(f"IC-06 preflight failed closed: {error}", file=sys.stderr)
        return 2
    except (ImportError, SQLAlchemyError):
        print("IC-06 preflight failed closed: database access failed", file=sys.stderr)
        return 2
    except (sqlite3.Error, OSError) as error:
        print(f"IC-06 preflight failed closed: {error}", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=True, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
