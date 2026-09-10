from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import sqlite3
import subprocess
import sys
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import ModuleType
from typing import Any, Iterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend" / "scripts" / "inventory_location_preflight.py"
TEST_POSTGRES_URL = os.getenv("TEST_POSTGRES_URL")


def _database_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def _create_snapshot_database(path: Path) -> None:
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            CREATE TABLE items (
                item_id TEXT PRIMARY KEY,
                mes_code TEXT,
                item_name TEXT NOT NULL,
                deleted_at TEXT
            );
            CREATE TABLE inventory (
                item_id TEXT PRIMARY KEY,
                warehouse_qty INTEGER NOT NULL
            );
            CREATE TABLE warehouse_angles (id INTEGER PRIMARY KEY);
            CREATE TABLE warehouse_boxes (
                box_id TEXT PRIMARY KEY,
                angle_id INTEGER NOT NULL
            );
            CREATE TABLE warehouse_box_items (
                id TEXT PRIMARY KEY,
                box_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                quantity INTEGER NOT NULL
            );
            CREATE TABLE warehouse_special_zones (
                id INTEGER PRIMARY KEY,
                is_active INTEGER NOT NULL
            );
            CREATE TABLE warehouse_special_zone_items (
                id TEXT PRIMARY KEY,
                zone_id INTEGER NOT NULL,
                item_id TEXT NOT NULL,
                quantity INTEGER NOT NULL
            );
            """
        )
        connection.executemany(
            "INSERT INTO items (item_id, mes_code, item_name, deleted_at) VALUES (?, ?, ?, ?)",
            [
                ("item-a", "A-TR-0001", "A", None),
                ("item-b", "B-TR-0001", "B", None),
                ("item-c", "C-TR-0001", "C", None),
                ("item-d", "D-TR-0001", "D", None),
                ("item-e", "E-TR-0001", "E", None),
                ("item-deleted", "Z-TR-0001", "Deleted", "2026-08-31 01:02:03+00:00"),
            ],
        )
        connection.executemany(
            "INSERT INTO inventory (item_id, warehouse_qty) VALUES (?, ?)",
            [("item-a", 10), ("item-b", 3), ("item-c", -1), ("item-d", 5)],
        )
        connection.execute("INSERT INTO warehouse_angles (id) VALUES (1)")
        connection.executemany(
            "INSERT INTO warehouse_boxes (box_id, angle_id) VALUES (?, ?)",
            [("box-a", 1), ("box-orphan-angle", 99)],
        )
        connection.executemany(
            "INSERT INTO warehouse_box_items (id, box_id, item_id, quantity) VALUES (?, ?, ?, ?)",
            [
                ("box-a-1", "box-a", "item-a", 4),
                ("box-a-2", "box-a", "item-a", 4),
                ("box-b-1", "box-a", "item-b", 4),
                ("box-c-1", "box-a", "item-c", -2),
                ("box-e-1", "box-a", "item-e", 2),
                ("orphan-box", "missing-box", "item-a", 2),
                ("orphan-item", "box-a", "missing-item", 1),
            ],
        )
        connection.executemany(
            "INSERT INTO warehouse_special_zones (id, is_active) VALUES (?, ?)",
            [(1, 1), (2, 0)],
        )
        connection.executemany(
            "INSERT INTO warehouse_special_zone_items (id, zone_id, item_id, quantity) VALUES (?, ?, ?, ?)",
            [
                ("zone-a-1", 1, "item-a", 1),
                ("zone-b-1", 1, "item-b", 1),
                ("zone-c-1", 1, "item-c", -3),
                ("inactive-a", 2, "item-a", 7),
                ("inactive-orphan", 2, "missing-item", 9),
                ("orphan-zone", 99, "item-a", 1),
                ("orphan-zone-negative", 99, "item-a", -1),
            ],
        )


def _run_preflight(path: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--db-url", _database_url(path)],
        cwd=ROOT / "backend",
        check=False,
        text=True,
        capture_output=True,
    )


def _load_preflight_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("inventory_location_preflight", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _postgres_url_for_schema(database_url: str, schema_name: str) -> str:
    parsed = urlsplit(database_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["options"] = f"-csearch_path={schema_name}"
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment))


@contextmanager
def _postgres_fixture_schema() -> Iterator[tuple[Any, str, str]]:
    sqlalchemy = pytest.importorskip("sqlalchemy")
    assert TEST_POSTGRES_URL is not None
    engine = sqlalchemy.create_engine(TEST_POSTGRES_URL)
    assert engine.dialect.name == "postgresql"
    schema_name = f"test_ic06_preflight_{uuid.uuid4().hex}"
    quoted_schema = f'"{schema_name}"'
    schema_created = False
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(f"CREATE SCHEMA {quoted_schema}")
            schema_created = True
            connection.exec_driver_sql(f"SET LOCAL search_path TO {quoted_schema}")
            connection.exec_driver_sql(
                """
                CREATE TABLE items (
                    item_id TEXT PRIMARY KEY,
                    mes_code TEXT,
                    item_name TEXT NOT NULL,
                    deleted_at TIMESTAMPTZ
                );
                CREATE TABLE inventory (item_id TEXT PRIMARY KEY, warehouse_qty NUMERIC NOT NULL);
                CREATE TABLE warehouse_angles (id INTEGER PRIMARY KEY);
                CREATE TABLE warehouse_boxes (box_id TEXT PRIMARY KEY, angle_id INTEGER NOT NULL);
                CREATE TABLE warehouse_box_items (
                    id TEXT PRIMARY KEY,
                    box_id TEXT NOT NULL,
                    item_id TEXT NOT NULL,
                    quantity INTEGER NOT NULL
                );
                CREATE TABLE warehouse_special_zones (id INTEGER PRIMARY KEY, is_active BOOLEAN NOT NULL);
                CREATE TABLE warehouse_special_zone_items (
                    id TEXT PRIMARY KEY,
                    zone_id INTEGER NOT NULL,
                    item_id TEXT NOT NULL,
                    quantity INTEGER NOT NULL
                );
                """
            )
            connection.execute(
                sqlalchemy.text(
                    "INSERT INTO items (item_id, mes_code, item_name, deleted_at) VALUES (:item_id, :mes_code, :item_name, :deleted_at)"
                ),
                [
                    {"item_id": "item-a", "mes_code": "A-TR-0001", "item_name": "A", "deleted_at": None},
                    {"item_id": "item-b", "mes_code": "B-TR-0001", "item_name": "B", "deleted_at": None},
                    {"item_id": "item-c", "mes_code": "C-TR-0001", "item_name": "C", "deleted_at": None},
                    {"item_id": "item-d", "mes_code": "D-TR-0001", "item_name": "D", "deleted_at": None},
                    {"item_id": "item-e", "mes_code": "E-TR-0001", "item_name": "E", "deleted_at": None},
                    {
                        "item_id": "item-deleted",
                        "mes_code": "Z-TR-0001",
                        "item_name": "Deleted",
                        "deleted_at": datetime(2026, 8, 31, 1, 2, 3, tzinfo=timezone.utc),
                    },
                ],
            )
            connection.execute(
                sqlalchemy.text("INSERT INTO inventory (item_id, warehouse_qty) VALUES (:item_id, :warehouse_qty)"),
                [
                    {"item_id": "item-a", "warehouse_qty": 10},
                    {"item_id": "item-b", "warehouse_qty": 3},
                    {"item_id": "item-c", "warehouse_qty": -1},
                    {"item_id": "item-d", "warehouse_qty": 5},
                ],
            )
            connection.execute(sqlalchemy.text("INSERT INTO warehouse_angles (id) VALUES (1)"))
            connection.execute(
                sqlalchemy.text("INSERT INTO warehouse_boxes (box_id, angle_id) VALUES (:box_id, :angle_id)"),
                [{"box_id": "box-a", "angle_id": 1}, {"box_id": "box-orphan-angle", "angle_id": 99}],
            )
            connection.execute(
                sqlalchemy.text(
                    "INSERT INTO warehouse_box_items (id, box_id, item_id, quantity) VALUES (:id, :box_id, :item_id, :quantity)"
                ),
                [
                    {"id": "box-a-1", "box_id": "box-a", "item_id": "item-a", "quantity": 4},
                    {"id": "box-a-2", "box_id": "box-a", "item_id": "item-a", "quantity": 4},
                    {"id": "box-b-1", "box_id": "box-a", "item_id": "item-b", "quantity": 4},
                    {"id": "box-c-1", "box_id": "box-a", "item_id": "item-c", "quantity": -2},
                    {"id": "box-e-1", "box_id": "box-a", "item_id": "item-e", "quantity": 2},
                    {"id": "orphan-box", "box_id": "missing-box", "item_id": "item-a", "quantity": 2},
                    {"id": "orphan-item", "box_id": "box-a", "item_id": "missing-item", "quantity": 1},
                ],
            )
            connection.execute(
                sqlalchemy.text("INSERT INTO warehouse_special_zones (id, is_active) VALUES (:id, :is_active)"),
                [{"id": 1, "is_active": True}, {"id": 2, "is_active": False}],
            )
            connection.execute(
                sqlalchemy.text(
                    "INSERT INTO warehouse_special_zone_items (id, zone_id, item_id, quantity) VALUES (:id, :zone_id, :item_id, :quantity)"
                ),
                [
                    {"id": "zone-a-1", "zone_id": 1, "item_id": "item-a", "quantity": 1},
                    {"id": "zone-b-1", "zone_id": 1, "item_id": "item-b", "quantity": 1},
                    {"id": "zone-c-1", "zone_id": 1, "item_id": "item-c", "quantity": -3},
                    {"id": "inactive-a", "zone_id": 2, "item_id": "item-a", "quantity": 7},
                    {"id": "inactive-orphan", "zone_id": 2, "item_id": "missing-item", "quantity": 9},
                    {"id": "orphan-zone", "zone_id": 99, "item_id": "item-a", "quantity": 1},
                    {"id": "orphan-zone-negative", "zone_id": 99, "item_id": "item-a", "quantity": -1},
                ],
            )
        yield engine, schema_name, _postgres_url_for_schema(TEST_POSTGRES_URL, schema_name)
    finally:
        try:
            if schema_created:
                with engine.begin() as connection:
                    connection.exec_driver_sql(f"DROP SCHEMA IF EXISTS {quoted_schema} CASCADE")
        finally:
            engine.dispose()


def test_cli_reports_canonical_placement_snapshot_and_hashes(tmp_path: Path) -> None:
    database = tmp_path / "placement.db"
    _create_snapshot_database(database)
    before = hashlib.sha256(database.read_bytes()).hexdigest()

    first = _run_preflight(database)
    second = _run_preflight(database)

    assert first.returncode == 0, first.stderr
    assert second.returncode == 0, second.stderr
    assert first.stdout == second.stdout
    assert hashlib.sha256(database.read_bytes()).hexdigest() == before

    report = json.loads(first.stdout)
    assert report["snapshot_sha256"]
    assert report["report_sha256"]
    unsigned_report = dict(report)
    assert unsigned_report.pop("report_sha256") == hashlib.sha256(
        json.dumps(unsigned_report, ensure_ascii=True, separators=(",", ":"), sort_keys=True).encode("utf-8")
    ).hexdigest()
    expected_snapshot = {
        "items": [
            {"deleted_at": None, "item_id": "item-a", "item_name": "A", "mes_code": "A-TR-0001"},
            {"deleted_at": None, "item_id": "item-b", "item_name": "B", "mes_code": "B-TR-0001"},
            {"deleted_at": None, "item_id": "item-c", "item_name": "C", "mes_code": "C-TR-0001"},
            {"deleted_at": None, "item_id": "item-d", "item_name": "D", "mes_code": "D-TR-0001"},
            {
                "deleted_at": "2026-08-31T01:02:03+00:00",
                "item_id": "item-deleted",
                "item_name": "Deleted",
                "mes_code": "Z-TR-0001",
            },
            {"deleted_at": None, "item_id": "item-e", "item_name": "E", "mes_code": "E-TR-0001"},
        ],
        "inventory": [
            {"item_id": "item-a", "warehouse_qty": 10},
            {"item_id": "item-b", "warehouse_qty": 3},
            {"item_id": "item-c", "warehouse_qty": -1},
            {"item_id": "item-d", "warehouse_qty": 5},
        ],
        "warehouse_angles": [{"id": 1}],
        "warehouse_boxes": [
            {"angle_id": 1, "box_id": "box-a"},
            {"angle_id": 99, "box_id": "box-orphan-angle"},
        ],
        "warehouse_box_items": [
            {"box_id": "box-a", "id": "box-a-1", "item_id": "item-a", "quantity": 4},
            {"box_id": "box-a", "id": "box-a-2", "item_id": "item-a", "quantity": 4},
            {"box_id": "box-a", "id": "box-b-1", "item_id": "item-b", "quantity": 4},
            {"box_id": "box-a", "id": "box-c-1", "item_id": "item-c", "quantity": -2},
            {"box_id": "box-a", "id": "box-e-1", "item_id": "item-e", "quantity": 2},
            {"box_id": "missing-box", "id": "orphan-box", "item_id": "item-a", "quantity": 2},
            {"box_id": "box-a", "id": "orphan-item", "item_id": "missing-item", "quantity": 1},
        ],
        "warehouse_special_zones": [{"id": 1, "is_active": True}, {"id": 2, "is_active": False}],
        "warehouse_special_zone_items": [
            {"id": "inactive-a", "item_id": "item-a", "quantity": 7, "zone_id": 2},
            {"id": "inactive-orphan", "item_id": "missing-item", "quantity": 9, "zone_id": 2},
            {"id": "orphan-zone", "item_id": "item-a", "quantity": 1, "zone_id": 99},
            {"id": "orphan-zone-negative", "item_id": "item-a", "quantity": -1, "zone_id": 99},
            {"id": "zone-a-1", "item_id": "item-a", "quantity": 1, "zone_id": 1},
            {"id": "zone-b-1", "item_id": "item-b", "quantity": 1, "zone_id": 1},
            {"id": "zone-c-1", "item_id": "item-c", "quantity": -3, "zone_id": 1},
        ],
    }
    assert report["snapshot_sha256"] == hashlib.sha256(
        json.dumps(expected_snapshot, ensure_ascii=True, separators=(",", ":"), sort_keys=True).encode("utf-8")
    ).hexdigest()
    assert report["inventory_rows"] == [
        {"b": 8, "item_id": "item-a", "mes_code": "A-TR-0001", "u_candidate": 1, "w": 10, "z": 1},
        {"b": 4, "item_id": "item-b", "mes_code": "B-TR-0001", "u_candidate": -2, "w": 3, "z": 1},
        {"b": -2, "item_id": "item-c", "mes_code": "C-TR-0001", "u_candidate": 4, "w": -1, "z": -3},
        {"b": 0, "item_id": "item-d", "mes_code": "D-TR-0001", "u_candidate": 5, "w": 5, "z": 0},
    ]
    assert report["w_only_items"] == [
        {"item_id": "item-d", "mes_code": "D-TR-0001", "w": 5}
    ]
    assert report["overplaced_items"] == [
        {"b_plus_z": 5, "item_id": "item-b", "mes_code": "B-TR-0001", "w": 3},
        {"b_plus_z": 2, "item_id": "item-e", "mes_code": "E-TR-0001", "w": 0},
    ]
    assert report["duplicate_container_items"] == [
        {
            "container_id": "box-a",
            "container_type": "box",
            "item_id": "item-a",
            "row_count": 2,
            "rows": [{"quantity": 4, "row_id": "box-a-1"}, {"quantity": 4, "row_id": "box-a-2"}],
            "total_quantity": 8,
        },
        {
            "container_id": "99",
            "container_type": "special_zone",
            "item_id": "item-a",
            "row_count": 2,
            "rows": [
                {"quantity": 1, "row_id": "orphan-zone"},
                {"quantity": -1, "row_id": "orphan-zone-negative"},
            ],
            "total_quantity": 0,
        },
    ]
    assert report["inactive_zone_quantities"] == [
        {"item_id": "item-a", "quantity": 7, "zone_id": 2},
        {"item_id": "missing-item", "quantity": 9, "zone_id": 2},
    ]
    assert report["orphan_rows"] == [
        {"container_id": "box-a", "container_type": "box", "item_id": "missing-item", "row_id": "orphan-item", "reason": "missing_item"},
        {"container_id": "box-orphan-angle", "container_type": "box", "item_id": "", "row_id": "box-orphan-angle", "reason": "missing_angle"},
        {"container_id": "missing-box", "container_type": "box", "item_id": "item-a", "row_id": "orphan-box", "reason": "missing_container"},
        {"container_id": "", "container_type": "inventory", "item_id": "item-e", "row_id": "item-e", "reason": "missing_inventory"},
        {"container_id": "2", "container_type": "special_zone", "item_id": "missing-item", "row_id": "inactive-orphan", "reason": "missing_item"},
        {"container_id": "99", "container_type": "special_zone", "item_id": "item-a", "row_id": "orphan-zone", "reason": "missing_container"},
        {
            "container_id": "99",
            "container_type": "special_zone",
            "item_id": "item-a",
            "row_id": "orphan-zone-negative",
            "reason": "missing_container",
        },
    ]
    assert report["negative_rows"] == [
        {"item_id": "item-c", "quantity": -3, "row_id": "zone-c-1", "scope": "active_special_zone"},
        {"item_id": "item-c", "quantity": -2, "row_id": "box-c-1", "scope": "box"},
        {"item_id": "item-c", "quantity": -1, "row_id": "item-c", "scope": "inventory"},
        {"item_id": "item-a", "quantity": -1, "row_id": "orphan-zone-negative", "scope": "orphan_special_zone"},
    ]


def test_sqlite_readonly_connection_rejects_actual_write_attempt(tmp_path: Path) -> None:
    database = tmp_path / "readonly.db"
    _create_snapshot_database(database)
    before = hashlib.sha256(database.read_bytes()).hexdigest()
    module = _load_preflight_module()

    with module._readonly_connection(_database_url(database)) as (dialect, connection):
        assert dialect == "sqlite"
        assert connection.execute("PRAGMA query_only").fetchone()[0] == 1
        with pytest.raises(sqlite3.OperationalError, match="readonly|read-only"):
            connection.execute("CREATE TABLE forbidden_write (id INTEGER PRIMARY KEY)")

    assert hashlib.sha256(database.read_bytes()).hexdigest() == before


def test_sqlite_wal_reader_keeps_a_single_snapshot_after_writer_commit(tmp_path: Path) -> None:
    database = tmp_path / "wal-snapshot.db"
    _create_snapshot_database(database)
    with sqlite3.connect(database) as writer:
        assert writer.execute("PRAGMA journal_mode = WAL").fetchone()[0].lower() == "wal"

    module = _load_preflight_module()
    with module._readonly_connection(_database_url(database)) as (dialect, reader):
        assert dialect == "sqlite"
        assert reader.execute("SELECT warehouse_qty FROM inventory WHERE item_id = 'item-a'").fetchone()[0] == 10
        with sqlite3.connect(database) as writer:
            writer.execute("UPDATE inventory SET warehouse_qty = 11 WHERE item_id = 'item-a'")
        assert reader.execute("SELECT warehouse_qty FROM inventory WHERE item_id = 'item-a'").fetchone()[0] == 10


def test_sqlite_preflight_rejects_noncanonical_special_zone_activity(tmp_path: Path) -> None:
    database = tmp_path / "invalid-zone-activity.db"
    _create_snapshot_database(database)
    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE warehouse_special_zones SET is_active = 2 WHERE id = 1")

    module = _load_preflight_module()
    with pytest.raises(module.PreflightError, match="warehouse_special_zones.is_active"):
        module.collect_preflight(_database_url(database))


def test_cli_fails_closed_for_missing_database_and_schema_drift(tmp_path: Path) -> None:
    missing = tmp_path / "missing.db"
    missing_result = _run_preflight(missing)

    assert missing_result.returncode == 2
    assert "failed closed" in missing_result.stderr
    assert not missing.exists()

    drifted = tmp_path / "drifted.db"
    with sqlite3.connect(drifted) as connection:
        connection.execute("CREATE TABLE items (item_id TEXT PRIMARY KEY)")
    before = hashlib.sha256(drifted.read_bytes()).hexdigest()
    drifted_result = _run_preflight(drifted)

    assert drifted_result.returncode == 2
    assert "required columns are missing" in drifted_result.stderr
    assert hashlib.sha256(drifted.read_bytes()).hexdigest() == before


def test_cli_fails_closed_without_traceback_for_postgresql_driver_error() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--db-url", "postgresql+psycopg://user:password@localhost/test_preflight"],
        cwd=ROOT / "backend",
        check=False,
        text=True,
        capture_output=True,
    )

    assert result.returncode == 2
    assert result.stderr == "IC-06 preflight failed closed: database access failed\n"
    assert "Traceback" not in result.stderr
    for secret in ("user", "password", "localhost", "test_preflight", "psycopg"):
        assert secret not in result.stderr


def test_cli_fails_closed_for_noninteger_inactive_zone_id(tmp_path: Path) -> None:
    database = tmp_path / "noninteger-inactive-zone.db"
    with sqlite3.connect(database) as connection:
        connection.executescript(
            """
            CREATE TABLE items (item_id TEXT PRIMARY KEY, mes_code TEXT, item_name TEXT NOT NULL, deleted_at TEXT);
            CREATE TABLE inventory (item_id TEXT PRIMARY KEY, warehouse_qty INTEGER NOT NULL);
            CREATE TABLE warehouse_angles (id INTEGER PRIMARY KEY);
            CREATE TABLE warehouse_boxes (box_id TEXT PRIMARY KEY, angle_id INTEGER NOT NULL);
            CREATE TABLE warehouse_box_items (id TEXT PRIMARY KEY, box_id TEXT NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL);
            CREATE TABLE warehouse_special_zones (id TEXT PRIMARY KEY, is_active INTEGER NOT NULL);
            CREATE TABLE warehouse_special_zone_items (id TEXT PRIMARY KEY, zone_id TEXT NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL);
            INSERT INTO warehouse_special_zones (id, is_active) VALUES ('inactive-zone', 0);
            INSERT INTO warehouse_special_zone_items (id, zone_id, item_id, quantity)
            VALUES ('inactive-row', 'inactive-zone', 'missing-item', 1);
            """
        )

    result = _run_preflight(database)

    assert result.returncode == 2
    assert "warehouse_special_zone_items.zone_id must be an integer" in result.stderr
    assert "Traceback" not in result.stderr


def test_canonical_snapshot_normalizes_postgresql_scalar_values() -> None:
    module = _load_preflight_module()

    assert module._json_value(uuid.UUID("12345678-1234-5678-1234-567812345678")) == "12345678-1234-5678-1234-567812345678"
    assert module._json_value(Decimal("7.00")) == 7
    assert module._json_value(datetime(2026, 8, 31, 1, 2, 3, tzinfo=timezone.utc)) == "2026-08-31T01:02:03+00:00"
    assert module._normalized_deleted_at("2026-08-31T10:02:03+09:00") == "2026-08-31T01:02:03+00:00"
    assert module._normalized_deleted_at("2026-08-31T01:02:03") == "2026-08-31T01:02:03"


def test_sqlite_schema_check_accepts_stored_generated_item_code(tmp_path: Path) -> None:
    database = tmp_path / "generated-column.db"
    with sqlite3.connect(database) as connection:
        connection.executescript(
            """
            CREATE TABLE items (
                item_id TEXT PRIMARY KEY,
                item_name TEXT NOT NULL,
                model_symbol TEXT NOT NULL,
                process_type_code TEXT NOT NULL,
                serial_no INTEGER NOT NULL,
                mes_code TEXT GENERATED ALWAYS AS (model_symbol || '-' || process_type_code || '-' || serial_no) STORED,
                deleted_at TEXT
            );
            CREATE TABLE inventory (item_id TEXT PRIMARY KEY, warehouse_qty INTEGER NOT NULL);
            CREATE TABLE warehouse_angles (id INTEGER PRIMARY KEY);
            CREATE TABLE warehouse_boxes (box_id TEXT PRIMARY KEY, angle_id INTEGER NOT NULL);
            CREATE TABLE warehouse_box_items (id TEXT PRIMARY KEY, box_id TEXT NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL);
            CREATE TABLE warehouse_special_zones (id INTEGER PRIMARY KEY, is_active INTEGER NOT NULL);
            CREATE TABLE warehouse_special_zone_items (id TEXT PRIMARY KEY, zone_id INTEGER NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL);
            """
        )
        module = _load_preflight_module()
        module._assert_schema("sqlite", connection)


@pytest.mark.skipif(not TEST_POSTGRES_URL, reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행")
def test_postgresql_readonly_transaction_rejects_actual_update() -> None:
    sqlalchemy = pytest.importorskip("sqlalchemy")
    module = _load_preflight_module()

    with module._readonly_connection(TEST_POSTGRES_URL) as (dialect, connection):
        assert dialect == "postgresql"
        with pytest.raises(sqlalchemy.exc.DBAPIError):
            connection.exec_driver_sql("UPDATE inventory SET warehouse_qty = warehouse_qty WHERE FALSE")


@pytest.mark.skipif(not TEST_POSTGRES_URL, reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행")
def test_postgresql_repeatable_read_snapshot_survives_writer_commit() -> None:
    module = _load_preflight_module()
    with _postgres_fixture_schema() as (engine, schema_name, schema_url):
        with module._readonly_connection(schema_url) as (dialect, reader):
            assert dialect == "postgresql"
            assert reader.exec_driver_sql("SELECT warehouse_qty FROM inventory WHERE item_id = 'item-a'").scalar_one() == 10
            with engine.begin() as writer:
                writer.exec_driver_sql(f'SET LOCAL search_path TO "{schema_name}"')
                writer.exec_driver_sql("UPDATE inventory SET warehouse_qty = 11 WHERE item_id = 'item-a'")
            assert reader.exec_driver_sql("SELECT warehouse_qty FROM inventory WHERE item_id = 'item-a'").scalar_one() == 10


@pytest.mark.skipif(not TEST_POSTGRES_URL, reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행")
def test_postgresql_collect_and_cli_match_sqlite_canonical_fixture(tmp_path: Path) -> None:
    sqlite_database = tmp_path / "canonical-parity.db"
    _create_snapshot_database(sqlite_database)
    module = _load_preflight_module()
    sqlite_collect = module.collect_preflight(_database_url(sqlite_database))
    sqlite_cli = _run_preflight(sqlite_database)

    with _postgres_fixture_schema() as (_engine, _schema_name, schema_url):
        postgres_collect = module.collect_preflight(schema_url)
        postgres_cli = subprocess.run(
            [sys.executable, str(SCRIPT), "--db-url", schema_url],
            cwd=ROOT / "backend",
            check=False,
            text=True,
            capture_output=True,
        )

    assert sqlite_cli.returncode == 0, sqlite_cli.stderr
    assert postgres_cli.returncode == 0, postgres_cli.stderr
    assert sqlite_collect == postgres_collect
    assert json.loads(sqlite_cli.stdout) == sqlite_collect
    assert json.loads(postgres_cli.stdout) == postgres_collect
    assert sqlite_collect["snapshot_sha256"] == postgres_collect["snapshot_sha256"]
    assert sqlite_collect["report_sha256"] == postgres_collect["report_sha256"]


@pytest.mark.skipif(not TEST_POSTGRES_URL, reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행")
def test_postgresql_cli_fails_closed_without_traceback_for_schema_error() -> None:
    sqlalchemy = pytest.importorskip("sqlalchemy")
    with _postgres_fixture_schema() as (engine, schema_name, schema_url):
        with engine.begin() as writer:
            writer.exec_driver_sql(f'SET LOCAL search_path TO "{schema_name}"')
            writer.execute(sqlalchemy.text("DROP TABLE inventory"))
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--db-url", schema_url],
            cwd=ROOT / "backend",
            check=False,
            text=True,
            capture_output=True,
        )

    assert result.returncode == 2
    assert "IC-06 preflight failed closed:" in result.stderr
    assert "Traceback" not in result.stderr


@pytest.mark.skipif(not TEST_POSTGRES_URL, reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행")
def test_postgresql_cli_rejects_required_view_even_with_matching_columns_and_data() -> None:
    with _postgres_fixture_schema() as (engine, schema_name, schema_url):
        with engine.begin() as writer:
            writer.exec_driver_sql(f'SET LOCAL search_path TO "{schema_name}"')
            writer.exec_driver_sql("ALTER TABLE items RENAME TO items_source")
            writer.exec_driver_sql("CREATE VIEW items AS SELECT item_id, mes_code, item_name, deleted_at FROM items_source")
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--db-url", schema_url],
            cwd=ROOT / "backend",
            check=False,
            text=True,
            capture_output=True,
        )

    assert result.returncode == 2
    assert "required table is not a base table: items" in result.stderr
    assert "Traceback" not in result.stderr


@pytest.mark.skipif(not TEST_POSTGRES_URL, reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행")
def test_postgresql_cli_fails_closed_without_traceback_for_snapshot_query_error() -> None:
    with _postgres_fixture_schema() as (engine, schema_name, schema_url):
        parsed = urlsplit(schema_url)
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        query["options"] = f"-csearch_path={schema_name} -clock_timeout=100ms"
        lock_timeout_url = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment))
        blocker = engine.connect()
        transaction = blocker.begin()
        try:
            blocker.exec_driver_sql(f'SET LOCAL search_path TO "{schema_name}"')
            blocker.exec_driver_sql("LOCK TABLE items IN ACCESS EXCLUSIVE MODE")
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--db-url", lock_timeout_url],
                cwd=ROOT / "backend",
                check=False,
                text=True,
                capture_output=True,
            )
        finally:
            transaction.rollback()
            blocker.close()

    assert result.returncode == 2
    assert result.stderr == "IC-06 preflight failed closed: database access failed\n"
    assert "Traceback" not in result.stderr
