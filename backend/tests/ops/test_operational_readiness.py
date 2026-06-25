from __future__ import annotations

import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "ops" / "operational_readiness.py"


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
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
            CREATE TABLE transaction_logs (log_id TEXT PRIMARY KEY, item_id TEXT, transaction_type TEXT, quantity_change NUMERIC NOT NULL DEFAULT 0, created_at TEXT);
            CREATE TABLE bom (bom_id TEXT PRIMARY KEY);
            CREATE TABLE admin_audit_logs (audit_id TEXT PRIMARY KEY);
            """
        )
        conn.commit()
    finally:
        conn.close()


def test_operational_readiness_fails_when_no_verified_backup_exists(tmp_path):
    db_path = tmp_path / "mes.db"
    backup_dir = tmp_path / "_backup"
    _create_minimal_mes_db(db_path)
    backup_dir.mkdir()

    result = _run("--db", str(db_path), "--backup-dir", str(backup_dir))

    assert result.returncode == 1
    assert "FAIL latest backup" in result.stdout


def test_operational_readiness_passes_with_valid_backup_and_integrity(tmp_path):
    db_path = tmp_path / "mes.db"
    backup_dir = tmp_path / "_backup"
    backup_dir.mkdir()
    _create_minimal_mes_db(db_path)
    shutil.copy2(db_path, backup_dir / "mes_20990101_000000.db")

    result = _run("--db", str(db_path), "--backup-dir", str(backup_dir))

    assert result.returncode == 0, result.stdout + result.stderr
    assert "PASS database file" in result.stdout
    assert "PASS latest backup" in result.stdout
    assert "PASS inventory integrity" in result.stdout
    assert "PASS operational readiness" in result.stdout
