from __future__ import annotations

import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine

from app import models as _models  # noqa: F401
from bootstrap.schema import ensure_schema
from scripts.ops import backup_manifest, operational_readiness

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
        ensure_schema(engine=engine)
    finally:
        engine.dispose()


def _copy_verified_backup(source: Path, backup: Path) -> None:
    shutil.copy2(source, backup)
    evidence = backup_manifest.collect_database_evidence(
        f"sqlite:///{backup.as_posix()}",
        expected_engine="sqlite",
    )
    manifest = backup_manifest.build_manifest(
        backup,
        published_name=backup.name,
        evidence=evidence,
        source_snapshot={
            "method": "sqlite3.backup",
            "journal_mode": "delete",
            "wal_included": True,
            "physical_generation": backup_manifest.sqlite_file_generation(source),
        },
    )
    backup_manifest.manifest_path_for(backup).write_text(
        json.dumps(manifest),
        encoding="utf-8",
    )


def test_operational_readiness_fails_when_no_verified_backup_exists(tmp_path):
    db_path = tmp_path / "mes.db"
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    _create_minimal_mes_db(db_path)
    backup_dir.mkdir(parents=True)

    result = _run("--db", str(db_path), env={"MES_RUNTIME_ROOT": str(runtime_root)})

    assert result.returncode == 1
    assert "FAIL latest backup" in result.stdout


@pytest.mark.parametrize("database_state", ["missing", "empty"])
def test_operational_readiness_stops_after_required_database_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    database_state: str,
) -> None:
    db_path = tmp_path / "required.db"
    if database_state == "empty":
        db_path.touch()
    validators: list[str] = []

    monkeypatch.setattr(
        operational_readiness,
        "parse_args",
        lambda: SimpleNamespace(db=str(db_path), max_backup_age_hours=24.0),
    )
    monkeypatch.setattr(
        operational_readiness,
        "check_latest_backup",
        lambda *_args, **_kwargs: validators.append("backup") or True,
    )
    monkeypatch.setattr(
        operational_readiness,
        "check_inventory_integrity",
        lambda *_args, **_kwargs: validators.append("inventory") or True,
    )

    result = operational_readiness.main()

    assert result == 1
    assert validators == []

def test_operational_readiness_fails_when_latest_backup_is_older_than_database(tmp_path):
    db_path = tmp_path / "mes.db"
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    backup_dir.mkdir(parents=True)
    _create_minimal_mes_db(db_path)
    backup_path = backup_dir / "mes_20990101_000000.db"
    _copy_verified_backup(db_path, backup_path)

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
    _copy_verified_backup(db_path, backup_dir / "mes_20990101_000000.db")

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
    _copy_verified_backup(db_path, backup_dir / "mes_20990101_000000.db")

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
