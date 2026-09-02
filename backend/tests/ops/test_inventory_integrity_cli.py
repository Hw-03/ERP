"""IC-17 CLI JSON·종료 코드·SQLite read-only 경계."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sqlite3
import subprocess
import sys
import uuid
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app import models as _models  # noqa: F401
from app.database import Base
from app.models import (
    Inventory,
    InventoryOperation,
    InventoryOperationKindEnum,
    InventoryOperationStatusEnum,
    Item,
    WarehouseUnplacedItem,
)


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "ops" / "check_inventory_integrity.py"


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def _database_url(path: Path) -> str:
    return f"sqlite:///{path.resolve().as_posix()}"


def _load_script_module():
    spec = importlib.util.spec_from_file_location("check_inventory_integrity", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _create_database(path: Path, *, warehouse_quantity: int = 4) -> None:
    engine = create_engine(_database_url(path))
    try:
        Base.metadata.create_all(engine)
        with Session(engine) as session:
            item = Item(
                item_name="IC-17 CLI",
                unit="EA",
                model_symbol="9",
                process_type_code="TR",
                serial_no=99001,
            )
            session.add(item)
            session.flush()
            session.add_all(
                [
                    Inventory(
                        item_id=item.item_id,
                        quantity=warehouse_quantity,
                        warehouse_qty=warehouse_quantity,
                        pending_quantity=0,
                    ),
                    WarehouseUnplacedItem(
                        item_id=item.item_id,
                        quantity=warehouse_quantity,
                    ),
                ]
            )
            session.commit()
    finally:
        engine.dispose()


def test_cli_json_pass_and_blocking_exit_codes(tmp_path: Path) -> None:
    database = tmp_path / "integrity.db"
    _create_database(database)
    before_hash = hashlib.sha256(database.read_bytes()).hexdigest()

    passing = _run("--db-url", _database_url(database), "--json")

    assert passing.returncode == 0, passing.stdout + passing.stderr
    assert hashlib.sha256(database.read_bytes()).hexdigest() == before_hash
    payload = json.loads(passing.stdout)
    assert payload["contract"] == "inventory-integrity/v1"
    assert payload["status"] == "pass"
    assert payload["blocking_count"] == 0
    assert all(
        set(check) == {"check_id", "severity", "count", "samples"}
        for check in payload["checks"]
    )

    engine = create_engine(_database_url(database))
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql("UPDATE warehouse_unplaced_items SET quantity = 1")
    finally:
        engine.dispose()

    blocking = _run("--db-url", _database_url(database), "--json")

    assert blocking.returncode == 1, blocking.stdout + blocking.stderr
    blocked_payload = json.loads(blocking.stdout)
    assert blocked_payload["status"] == "fail"
    assert next(
        check for check in blocked_payload["checks"]
        if check["check_id"] == "WAREHOUSE_PHYSICAL_MISMATCH"
    )["count"] == 1


def test_cli_warning_only_contract_v1_exits_zero(tmp_path: Path) -> None:
    database = tmp_path / "legacy-warning.db"
    _create_database(database)
    engine = create_engine(_database_url(database))
    try:
        with Session(engine) as session:
            session.add(
                InventoryOperation(
                    kind=InventoryOperationKindEnum.BUSINESS,
                    domain="legacy",
                    action="missing-effect",
                    status=InventoryOperationStatusEnum.COMMITTED,
                    display_label="레거시 효과 누락",
                    actor_name="IC-17 CLI",
                    contract_version=1,
                )
            )
            session.commit()
    finally:
        engine.dispose()

    result = _run("--db-url", _database_url(database), "--json")

    assert result.returncode == 0, result.stdout + result.stderr
    payload = json.loads(result.stdout)
    assert payload["status"] == "warning"
    assert payload["blocking_count"] == 0
    assert payload["warning_count"] == 1


def test_cli_usage_or_configuration_error_exits_two_without_secret_echo() -> None:
    secret_url = "mysql://secret-user:secret-pass@private-host/private-db"

    result = _run("--db-url", secret_url, "--json")

    assert result.returncode == 2
    assert "configuration error" in result.stderr
    for secret in ("secret-user", "secret-pass", "private-host", "private-db"):
        assert secret not in result.stdout
        assert secret not in result.stderr


def test_cli_missing_sqlite_path_exits_three_without_creating_file(tmp_path: Path) -> None:
    missing = tmp_path / "missing.db"

    result = _run("--db-url", _database_url(missing), "--json")

    assert result.returncode == 3
    assert "database check error" in result.stderr
    assert not missing.exists()


def test_cli_schema_or_tool_error_exits_three(tmp_path: Path) -> None:
    drifted = tmp_path / "drifted.db"
    drifted.touch()

    result = _run("--db-url", _database_url(drifted), "--json")

    assert result.returncode == 3
    assert "database check error" in result.stderr
    assert "Traceback" not in result.stderr


def test_sqlite_diagnostic_session_keeps_one_wal_snapshot(tmp_path: Path) -> None:
    database = tmp_path / "wal-snapshot.db"
    _create_database(database)
    writer = create_engine(_database_url(database))
    with writer.begin() as connection:
        connection.exec_driver_sql("PRAGMA journal_mode = WAL")

    module = _load_script_module()
    reader, backend = module._engine_for_url(_database_url(database))
    try:
        with module._diagnostic_session(reader, backend) as session:
            before = session.execute(
                text("SELECT warehouse_qty FROM inventory")
            ).scalar_one()
            with writer.begin() as connection:
                connection.exec_driver_sql(
                    "UPDATE inventory SET warehouse_qty = 9, quantity = 9"
                )
                connection.exec_driver_sql(
                    "UPDATE warehouse_unplaced_items SET quantity = 9"
                )
            during = session.execute(
                text("SELECT warehouse_qty FROM inventory")
            ).scalar_one()

        with writer.connect() as connection:
            after = connection.execute(
                text("SELECT warehouse_qty FROM inventory")
            ).scalar_one()
    finally:
        reader.dispose()
        writer.dispose()

    assert before == during == 4
    assert after == 9


def test_sqlite_cli_blocks_box_with_missing_angle(tmp_path: Path) -> None:
    database = tmp_path / "box-angle-orphan.db"
    _create_database(database)
    with sqlite3.connect(database) as connection:
        connection.execute("PRAGMA foreign_keys = OFF")
        connection.execute(
            "INSERT INTO warehouse_boxes "
            "(box_id, angle_id, row_no, layer_no, jari_index, size, stack_order) "
            "VALUES (?, ?, 1, 1, 0, 'SMALL', 0)",
            (str(uuid.uuid4()), 404),
        )

    result = _run("--db-url", _database_url(database), "--json")

    assert result.returncode == 1, result.stdout + result.stderr
    payload = json.loads(result.stdout)
    orphan = next(
        check
        for check in payload["checks"]
        if check["check_id"] == "ORPHAN_REFERENCE"
    )
    assert any(
        sample.get("reason") == "missing_angle"
        for sample in orphan["samples"]
    )


def test_sqlite_cli_blocks_negative_unplaced_quantity(tmp_path: Path) -> None:
    database = tmp_path / "negative-unplaced.db"
    _create_database(database)
    with sqlite3.connect(database) as connection:
        connection.execute("PRAGMA ignore_check_constraints = ON")
        connection.execute("UPDATE warehouse_unplaced_items SET quantity = -1")

    result = _run("--db-url", _database_url(database), "--json")

    assert result.returncode == 1, result.stdout + result.stderr
    payload = json.loads(result.stdout)
    physical = next(
        check
        for check in payload["checks"]
        if check["check_id"] == "WAREHOUSE_PHYSICAL_MISMATCH"
    )
    assert any(
        sample.get("reason") == "negative_quantity"
        for sample in physical["samples"]
    )
