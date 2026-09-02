from __future__ import annotations

import os
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

from sqlalchemy import create_engine

from app import models as _models  # noqa: F401
from app.database import Base

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "ops" / "operational_readiness.py"
CURRENT_ITEM_ID = "00000000000000000000000000000001"


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
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    try:
        Base.metadata.create_all(engine)
    finally:
        engine.dispose()


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
        conn.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) "
            "VALUES ('TR', 'T', 'R', 0)"
        )
        conn.execute(
            "INSERT INTO items "
            "(item_id, item_name, unit, model_symbol, process_type_code, serial_no) "
            "VALUES (?, 'Part A', 'EA', '9', 'TR', 1)",
            (CURRENT_ITEM_ID,),
        )
        conn.execute(
            "INSERT INTO inventory "
            "(inventory_id, item_id, quantity, warehouse_qty, pending_quantity) "
            "VALUES ('inventory-1', ?, 1, 1, 0)",
            (CURRENT_ITEM_ID,),
        )
        conn.execute(
            "INSERT INTO warehouse_unplaced_items (id, item_id, quantity) "
            "VALUES ('unplaced-1', ?, 1)",
            (CURRENT_ITEM_ID,),
        )
        conn.execute(
            "INSERT INTO transaction_logs "
            "(log_id, item_id, transaction_type, quantity_change, created_at, inventory_effect) "
            "VALUES ('tx-1', ?, 'RECEIVE', 1, '2099-01-01', NULL)",
            (CURRENT_ITEM_ID,),
        )
        conn.commit()
    finally:
        conn.close()
    shutil.copy2(db_path, backup_dir / "mes_20990101_000000.db")

    result = _run("--db", str(db_path), env={"MES_RUNTIME_ROOT": str(runtime_root)})

    assert result.returncode == 0, result.stdout + result.stderr
    assert "WARN OPERATION_V1_EFFECT_MISSING" in result.stdout
    assert "PASS operational readiness" in result.stdout


def test_operational_readiness_does_not_accept_arbitrary_backup_directory(tmp_path):
    db_path = tmp_path / "mes.db"
    _create_minimal_mes_db(db_path)

    result = _run("--db", str(db_path), "--backup-dir", str(tmp_path / "other"))

    assert result.returncode == 2
    assert "unrecognized arguments: --backup-dir" in result.stderr
