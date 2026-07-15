from __future__ import annotations

import os
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "ops" / "operational_readiness.py"


def _run(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
        env=merged_env,
    )


def _create_minimal_mes_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.executescript(
            """
            CREATE TABLE items (item_id TEXT PRIMARY KEY, mes_code TEXT, item_name TEXT);
            CREATE TABLE inventory (item_id TEXT PRIMARY KEY, quantity NUMERIC NOT NULL DEFAULT 0, warehouse_qty NUMERIC NOT NULL DEFAULT 0, pending_quantity NUMERIC NOT NULL DEFAULT 0);
            CREATE TABLE inventory_locations (item_id TEXT, department TEXT, status TEXT, quantity NUMERIC NOT NULL DEFAULT 0);
            CREATE TABLE stock_requests (request_id TEXT PRIMARY KEY, request_code TEXT, status TEXT, created_at TEXT);
            CREATE TABLE stock_request_lines (line_id TEXT PRIMARY KEY, request_id TEXT, item_id TEXT, quantity NUMERIC NOT NULL DEFAULT 0, from_bucket TEXT, status TEXT);
            CREATE TABLE transaction_logs (log_id TEXT PRIMARY KEY, item_id TEXT, transaction_type TEXT, quantity_change NUMERIC NOT NULL DEFAULT 0, created_at TEXT, inventory_effect TEXT);
            CREATE TABLE bom (bom_id TEXT PRIMARY KEY);
            CREATE TABLE admin_audit_logs (audit_id TEXT PRIMARY KEY);
            CREATE TABLE warehouse_angles (id INTEGER PRIMARY KEY);
            CREATE TABLE warehouse_boxes (box_id TEXT PRIMARY KEY, angle_id INTEGER REFERENCES warehouse_angles(id));
            CREATE TABLE warehouse_box_items (id INTEGER PRIMARY KEY, box_id TEXT REFERENCES warehouse_boxes(box_id), item_id TEXT REFERENCES items(item_id));
            CREATE TABLE io_batches (batch_id TEXT PRIMARY KEY);
            CREATE TABLE io_bundles (bundle_id TEXT PRIMARY KEY);
            CREATE TABLE io_lines (line_id TEXT PRIMARY KEY);
            CREATE TABLE shipping_requests (request_id TEXT PRIMARY KEY);
            CREATE TABLE shipping_request_bom_lines (line_id TEXT PRIMARY KEY);
            CREATE TABLE shipping_request_companion_lines (line_id TEXT PRIMARY KEY);
            CREATE TABLE shipping_allocations (allocation_id TEXT PRIMARY KEY);
            CREATE TABLE shipping_request_checklist_lines (line_id TEXT PRIMARY KEY);
            CREATE TABLE shipping_request_events (event_id TEXT PRIMARY KEY);
            """
        )
        conn.commit()
    finally:
        conn.close()


def test_operational_readiness_fails_when_no_verified_backup_exists(tmp_path):
    db_path = tmp_path / "mes.db"
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    _create_minimal_mes_db(db_path)
    backup_dir.mkdir(parents=True)

    result = _run("--db", str(db_path), env={"MES_RUNTIME_ROOT": str(runtime_root)})

    assert result.returncode == 1
    assert "FAIL latest backup" in result.stdout

def test_operational_readiness_fails_when_latest_backup_is_older_than_database(tmp_path):
    db_path = tmp_path / "mes.db"
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    backup_dir.mkdir(parents=True)
    _create_minimal_mes_db(db_path)
    backup_path = backup_dir / "mes_20990101_000000.db"
    shutil.copy2(db_path, backup_path)

    old = time.time() - 120
    new = time.time()
    os.utime(backup_path, (old, old))
    os.utime(db_path, (new, new))

    result = _run("--db", str(db_path), env={"MES_RUNTIME_ROOT": str(runtime_root)})

    assert result.returncode == 1
    assert "FAIL latest backup" in result.stdout
    assert "older than database" in result.stdout


def test_operational_readiness_passes_with_valid_backup_and_integrity(tmp_path):
    db_path = tmp_path / "mes.db"
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    backup_dir.mkdir(parents=True)
    _create_minimal_mes_db(db_path)
    shutil.copy2(db_path, backup_dir / "mes_20990101_000000.db")

    result = _run("--db", str(db_path), env={"MES_RUNTIME_ROOT": str(runtime_root)})

    assert result.returncode == 0, result.stdout + result.stderr
    assert "PASS database file" in result.stdout
    assert "PASS latest backup" in result.stdout
    assert "PASS inventory integrity" in result.stdout
    assert "PASS operational readiness" in result.stdout

def test_operational_readiness_surfaces_inventory_integrity_warnings(tmp_path):
    db_path = tmp_path / "mes.db"
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    backup_dir.mkdir(parents=True)
    _create_minimal_mes_db(db_path)
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("INSERT INTO items VALUES ('item-1', 'AA-0001', 'Part A')")
        conn.execute("INSERT INTO inventory VALUES ('item-1', 1, 1, 0)")
        conn.execute("INSERT INTO transaction_logs VALUES ('tx-1', 'item-1', 'RECEIVE', 1, '2099-01-01', NULL)")
        conn.commit()
    finally:
        conn.close()
    shutil.copy2(db_path, backup_dir / "mes_20990101_000000.db")

    result = _run("--db", str(db_path), env={"MES_RUNTIME_ROOT": str(runtime_root)})

    assert result.returncode == 0, result.stdout + result.stderr
    assert "WARN missing transaction effects" in result.stdout
    assert "PASS operational readiness" in result.stdout


def test_operational_readiness_does_not_accept_arbitrary_backup_directory(tmp_path):
    db_path = tmp_path / "mes.db"
    _create_minimal_mes_db(db_path)

    result = _run("--db", str(db_path), "--backup-dir", str(tmp_path / "other"))

    assert result.returncode == 2
    assert "unrecognized arguments: --backup-dir" in result.stderr
