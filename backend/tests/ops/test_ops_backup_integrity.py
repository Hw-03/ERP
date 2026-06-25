from __future__ import annotations

import sqlite3
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
VERIFY_BACKUP = ROOT / "scripts" / "ops" / "_verify_backup.py"
CHECK_INTEGRITY = ROOT / "scripts" / "ops" / "check_inventory_integrity.py"
BACKUP_DB = ROOT / "scripts" / "ops" / "backup_db.py"
RESTORE_DB = ROOT / "scripts" / "ops" / "restore_db.py"


def _run_script(script: Path, *args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    import os

    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    return subprocess.run(
        [sys.executable, str(script), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
        env=merged_env,
    )


def _create_ops_schema_db(
    path: Path,
    *,
    mismatch: bool = False,
    orphan_location: bool = False,
    orphan_inventory: bool = False,
    orphan_transaction: bool = False,
    omit_stock_request_lines: bool = False,
) -> None:
    con = sqlite3.connect(path)
    try:
        con.executescript(
            """
            CREATE TABLE items (
                item_id TEXT PRIMARY KEY,
                mes_code TEXT,
                item_name TEXT
            );
            CREATE TABLE inventory (
                item_id TEXT PRIMARY KEY,
                quantity NUMERIC NOT NULL,
                warehouse_qty NUMERIC NOT NULL,
                pending_quantity NUMERIC NOT NULL
            );
            CREATE TABLE inventory_locations (
                item_id TEXT NOT NULL,
                department TEXT NOT NULL,
                status TEXT NOT NULL,
                quantity NUMERIC NOT NULL
            );
            CREATE TABLE stock_requests (
                request_id TEXT PRIMARY KEY,
                request_code TEXT,
                status TEXT,
                created_at TEXT
            );
            """
        )
        if not omit_stock_request_lines:
            con.executescript(
                """
                CREATE TABLE stock_request_lines (
                    line_id TEXT PRIMARY KEY,
                    request_id TEXT,
                    item_id TEXT,
                    quantity NUMERIC NOT NULL,
                    from_bucket TEXT,
                    status TEXT
                );
                """
            )
        con.executescript(
            """
            CREATE TABLE transaction_logs (log_id TEXT PRIMARY KEY, item_id TEXT, transaction_type TEXT, inventory_effect TEXT);
            CREATE TABLE bom (bom_id TEXT PRIMARY KEY);
            CREATE TABLE admin_audit_logs (id TEXT PRIMARY KEY);
            """
        )
        con.execute("INSERT INTO items VALUES ('item-1', 'AA-0001', 'Part A')")
        total = 8 if mismatch else 7
        if not orphan_location:
            con.execute("INSERT INTO inventory VALUES ('item-1', ?, 5, 0)", (total,))
        if orphan_inventory:
            con.execute("INSERT INTO inventory VALUES ('missing-item', 1, 1, 0)")
        con.execute("INSERT INTO inventory_locations VALUES ('item-1', '조립', 'PRODUCTION', 2)")
        if orphan_transaction:
            con.execute("INSERT INTO transaction_logs VALUES ('tx-1', 'missing-item', 'RECEIVE', '[{}]')")
        con.commit()
    finally:
        con.close()


def test_verify_backup_rejects_empty_sqlite_file(tmp_path: Path) -> None:
    db_path = tmp_path / "empty.db"
    sqlite3.connect(db_path).close()

    result = _run_script(VERIFY_BACKUP, str(db_path))

    assert result.returncode == 1
    assert "missing required table" in result.stdout


def test_verify_backup_accepts_current_schema_backup(tmp_path: Path) -> None:
    db_path = tmp_path / "valid.db"
    _create_ops_schema_db(db_path)

    result = _run_script(VERIFY_BACKUP, str(db_path))

    assert result.returncode == 0, result.stdout + result.stderr
    assert "items" in result.stdout
    assert "inventory_locations" in result.stdout

def test_verify_backup_rejects_missing_stock_request_lines(tmp_path: Path) -> None:
    db_path = tmp_path / "missing-lines.db"
    _create_ops_schema_db(db_path, omit_stock_request_lines=True)

    result = _run_script(VERIFY_BACKUP, str(db_path))

    assert result.returncode == 1
    assert "stock_request_lines" in result.stdout


def test_check_inventory_integrity_accepts_current_schema(tmp_path: Path) -> None:
    db_path = tmp_path / "valid.db"
    _create_ops_schema_db(db_path)

    result = _run_script(CHECK_INTEGRITY, "--db-url", f"sqlite:///{db_path.as_posix()}")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "PASS" in result.stdout


def test_check_inventory_integrity_rejects_total_mismatch(tmp_path: Path) -> None:
    db_path = tmp_path / "mismatch.db"
    _create_ops_schema_db(db_path, mismatch=True)

    result = _run_script(CHECK_INTEGRITY, "--db-url", f"sqlite:///{db_path.as_posix()}")

    assert result.returncode == 1
    assert "total mismatch" in result.stdout

def test_check_inventory_integrity_rejects_pending_not_matching_reserved_lines(tmp_path: Path) -> None:
    db_path = tmp_path / "pending-mismatch.db"
    _create_ops_schema_db(db_path)
    con = sqlite3.connect(db_path)
    try:
        con.execute("UPDATE inventory SET pending_quantity = 5 WHERE item_id = 'item-1'")
        con.execute("INSERT INTO stock_requests VALUES ('req-1', 'SR-1', 'reserved', '2099-01-01')")
        con.execute("INSERT INTO stock_request_lines VALUES ('line-1', 'req-1', 'item-1', 3, 'warehouse', 'reserved')")
        con.commit()
    finally:
        con.close()

    result = _run_script(CHECK_INTEGRITY, "--db-url", f"sqlite:///{db_path.as_posix()}")

    assert result.returncode == 1
    assert "pending reservation mismatch" in result.stdout

def test_check_inventory_integrity_rejects_orphan_location_without_inventory_row(tmp_path: Path) -> None:
    db_path = tmp_path / "orphan-location.db"
    _create_ops_schema_db(db_path, orphan_location=True)

    result = _run_script(CHECK_INTEGRITY, "--db-url", f"sqlite:///{db_path.as_posix()}")

    assert result.returncode == 1
    assert "orphan locations" in result.stdout


def test_check_inventory_integrity_rejects_inventory_without_item_master(tmp_path: Path) -> None:
    db_path = tmp_path / "orphan-inventory.db"
    _create_ops_schema_db(db_path, orphan_inventory=True)

    result = _run_script(CHECK_INTEGRITY, "--db-url", f"sqlite:///{db_path.as_posix()}")

    assert result.returncode == 1
    assert "orphan inventory" in result.stdout


def test_check_inventory_integrity_rejects_transaction_without_item_master(tmp_path: Path) -> None:
    db_path = tmp_path / "orphan-transaction.db"
    _create_ops_schema_db(db_path, orphan_transaction=True)

    result = _run_script(CHECK_INTEGRITY, "--db-url", f"sqlite:///{db_path.as_posix()}")

    assert result.returncode == 1
    assert "orphan transactions" in result.stdout

def test_check_inventory_integrity_warns_for_transaction_without_inventory_effect(tmp_path: Path) -> None:
    db_path = tmp_path / "missing-effect.db"
    _create_ops_schema_db(db_path)
    con = sqlite3.connect(db_path)
    try:
        con.execute("INSERT INTO transaction_logs VALUES ('tx-2', 'item-1', 'RECEIVE', NULL)")
        con.commit()
    finally:
        con.close()

    result = _run_script(CHECK_INTEGRITY, "--db-url", f"sqlite:///{db_path.as_posix()}")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "WARN missing transaction effects" in result.stdout


def test_check_inventory_integrity_warns_for_zero_delta_inventory_effect(tmp_path: Path) -> None:
    db_path = tmp_path / "zero-effect.db"
    _create_ops_schema_db(db_path)
    con = sqlite3.connect(db_path)
    try:
        con.execute(
            "INSERT INTO transaction_logs VALUES ('tx-3', 'item-1', 'RECEIVE', '[{\"scope\":\"warehouse\",\"delta\":0}]')"
        )
        con.commit()
    finally:
        con.close()

    result = _run_script(CHECK_INTEGRITY, "--db-url", f"sqlite:///{db_path.as_posix()}")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "WARN ineffective transaction effects" in result.stdout


def test_backup_db_py_creates_verified_backup_in_backend_backup(tmp_path: Path) -> None:
    src = tmp_path / "source.db"
    _create_ops_schema_db(src)

    backup_dir = tmp_path / "backups"
    before = set(backup_dir.glob("mes_*.db"))
    result = _run_script(BACKUP_DB, "--sqlite", str(src), env={"MES_SQLITE_BACKUP_DIR": str(backup_dir)})
    after = set(backup_dir.glob("mes_*.db"))
    created = sorted(after - before, key=lambda path: path.stat().st_mtime)

    try:
        assert result.returncode == 0, result.stdout + result.stderr
        assert created, result.stdout
        verify = _run_script(VERIFY_BACKUP, str(created[-1]))
        assert verify.returncode == 0, verify.stdout + verify.stderr
    finally:
        for path in created:
            path.unlink(missing_ok=True)


def test_restore_db_py_rejects_invalid_sqlite_backup(tmp_path: Path) -> None:
    invalid_backup = tmp_path / "invalid.db"
    sqlite3.connect(invalid_backup).close()
    target = tmp_path / "target.db"
    _create_ops_schema_db(target)

    result = _run_script(RESTORE_DB, "--sqlite", str(invalid_backup), "--target", str(target), "--check")

    assert result.returncode == 1
    verify_target = _run_script(VERIFY_BACKUP, str(target))
    assert verify_target.returncode == 0, verify_target.stdout + verify_target.stderr
