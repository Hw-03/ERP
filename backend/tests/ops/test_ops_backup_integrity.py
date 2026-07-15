from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
import time
from datetime import datetime as real_datetime
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ops import backup_db as backup_db_module
from scripts.ops import restore_db as restore_db_module
from scripts.ops.backup_retention import REGULAR_BACKUP_NAME, retain_latest_backups


VERIFY_BACKUP = ROOT / "scripts" / "ops" / "_verify_backup.py"
CHECK_INTEGRITY = ROOT / "scripts" / "ops" / "check_inventory_integrity.py"
BACKUP_DB = ROOT / "scripts" / "ops" / "backup_db.py"
RESTORE_DB = ROOT / "scripts" / "ops" / "restore_db.py"
CLEANUP_BACKUPS = ROOT / "scripts" / "ops" / "cleanup_backups.py"
BACKUP_DB_BAT = ROOT / "scripts" / "ops" / "backup_db.bat"
RESTORE_DB_BAT = ROOT / "scripts" / "ops" / "restore_db.bat"


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


def _backup_path_from_stdout(stdout: str) -> Path:
    paths = [
        Path(line.removeprefix("BACKUP_PATH="))
        for line in stdout.splitlines()
        if line.startswith("BACKUP_PATH=")
    ]
    assert len(paths) == 1, stdout
    return paths[0]


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
                    request_id TEXT REFERENCES stock_requests(request_id),
                    item_id TEXT REFERENCES items(item_id),
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
            CREATE TABLE warehouse_angles (id INTEGER PRIMARY KEY);
            CREATE TABLE warehouse_boxes (
                box_id TEXT PRIMARY KEY,
                angle_id INTEGER REFERENCES warehouse_angles(id)
            );
            CREATE TABLE warehouse_box_items (
                id INTEGER PRIMARY KEY,
                box_id TEXT NOT NULL REFERENCES warehouse_boxes(box_id),
                item_id TEXT NOT NULL REFERENCES items(item_id)
            );
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
    assert "foreign_key_check: ok" in result.stdout
    assert "warehouse_box_items" in result.stdout

def test_verify_backup_rejects_missing_stock_request_lines(tmp_path: Path) -> None:
    db_path = tmp_path / "missing-lines.db"
    _create_ops_schema_db(db_path, omit_stock_request_lines=True)

    result = _run_script(VERIFY_BACKUP, str(db_path))

    assert result.returncode == 1
    assert "stock_request_lines" in result.stdout


def test_verify_backup_rejects_missing_warehouse_box_table(tmp_path: Path) -> None:
    db_path = tmp_path / "missing-box-items.db"
    _create_ops_schema_db(db_path)
    con = sqlite3.connect(db_path)
    try:
        con.execute("DROP TABLE warehouse_box_items")
        con.commit()
    finally:
        con.close()

    result = _run_script(VERIFY_BACKUP, str(db_path))

    assert result.returncode == 1
    assert "warehouse_box_items" in result.stdout


@pytest.mark.parametrize(
    "missing_table",
    [
        "io_batches",
        "io_bundles",
        "io_lines",
        "shipping_requests",
        "shipping_request_bom_lines",
        "shipping_request_companion_lines",
        "shipping_allocations",
        "shipping_request_checklist_lines",
        "shipping_request_events",
    ],
)
def test_verify_backup_rejects_missing_io_or_shipping_table(tmp_path: Path, missing_table: str) -> None:
    db_path = tmp_path / f"missing-{missing_table}.db"
    _create_ops_schema_db(db_path)
    with sqlite3.connect(db_path) as con:
        con.execute(f'DROP TABLE "{missing_table}"')

    result = _run_script(VERIFY_BACKUP, str(db_path))

    assert result.returncode == 1
    assert missing_table in result.stdout


def test_verify_backup_rejects_arbitrary_corrupt_bytes(tmp_path: Path) -> None:
    db_path = tmp_path / "corrupt.db"
    db_path.write_bytes(b"\x00DEXCOWIN-not-a-sqlite-database\xff")

    result = _run_script(VERIFY_BACKUP, str(db_path))

    assert result.returncode == 1
    assert "failed" in (result.stdout + result.stderr).lower()


def test_verify_latest_ignores_newer_pre_maintenance_snapshot(tmp_path: Path) -> None:
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    backup_dir.mkdir(parents=True)
    regular = backup_dir / "mes_20990101_000000.db"
    pre_snapshot = backup_dir / "mes_PRE-maintenance_20990101_000001.db"
    _create_ops_schema_db(regular)
    pre_snapshot.write_bytes(b"not a database")

    result = _run_script(VERIFY_BACKUP, "--latest", env={"MES_RUNTIME_ROOT": str(runtime_root)})

    assert result.returncode == 0, result.stdout + result.stderr
    assert f"latest backup : {regular}" in result.stdout


def test_verify_backup_rejects_foreign_key_violations(tmp_path: Path) -> None:
    db_path = tmp_path / "foreign-key-violation.db"
    _create_ops_schema_db(db_path)
    con = sqlite3.connect(db_path)
    try:
        con.execute("INSERT INTO warehouse_box_items VALUES (1, 'missing-box', 'missing-item')")
        con.commit()
    finally:
        con.close()

    result = _run_script(VERIFY_BACKUP, str(db_path))

    assert result.returncode == 1
    assert "foreign_key_check: failed" in result.stdout


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
    assert "transaction_type=RECEIVE" in result.stdout
    assert "count=1" in result.stdout
    assert "sample_log_id=tx-2" in result.stdout
    assert "sample_mes_code=AA-0001" in result.stdout


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


def test_backup_db_py_creates_verified_backup_under_runtime_root(tmp_path: Path) -> None:
    src = tmp_path / "source.db"
    _create_ops_schema_db(src)

    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    before = set(backup_dir.glob("mes_*.db"))
    result = _run_script(BACKUP_DB, "--sqlite", str(src), env={"MES_RUNTIME_ROOT": str(runtime_root)})
    after = set(backup_dir.glob("mes_*.db"))
    created = sorted(after - before, key=lambda path: path.stat().st_mtime)

    try:
        assert result.returncode == 0, result.stdout + result.stderr
        assert created, result.stdout
        backup_path_lines = [line for line in result.stdout.splitlines() if line.startswith("BACKUP_PATH=")]
        assert backup_path_lines == [f"BACKUP_PATH={created[-1].resolve()}"]
        verify = _run_script(VERIFY_BACKUP, str(created[-1]))
        assert verify.returncode == 0, verify.stdout + verify.stderr
    finally:
        for path in created:
            path.unlink(missing_ok=True)


def test_sqlite_backup_is_verified_under_a_private_non_regular_name(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "source.db"
    _create_ops_schema_db(source)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime"))
    observed: list[Path] = []
    original_verify = backup_db_module._verify_sqlite_backup

    def record_verification_path(path: Path) -> None:
        observed.append(path)
        original_verify(path)

    monkeypatch.setattr(backup_db_module, "_verify_sqlite_backup", record_verification_path)

    published = backup_db_module.backup_sqlite(str(source))

    assert len(observed) == 1
    assert not REGULAR_BACKUP_NAME.fullmatch(observed[0].name)
    assert not observed[0].exists()
    assert REGULAR_BACKUP_NAME.fullmatch(published.name)
    assert published.exists()


def test_failed_sqlite_verification_cannot_expose_a_file_to_retention(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "source.db"
    _create_ops_schema_db(source)
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    backup_dir.mkdir(parents=True)
    existing = []
    for index in range(10):
        backup = backup_dir / f"mes_20000101_0000{index:02d}.db"
        backup.write_bytes(f"existing-{index}".encode())
        os.utime(backup, (index + 1, index + 1))
        existing.append(backup)
    expected = {path.name: path.read_bytes() for path in existing}
    observed: list[Path] = []
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))

    def fail_after_competing_retention(path: Path) -> None:
        observed.append(path)
        retain_latest_backups(backup_dir, suffix=".db", keep=10)
        raise SystemExit(91)

    monkeypatch.setattr(backup_db_module, "_verify_sqlite_backup", fail_after_competing_retention)

    with pytest.raises(SystemExit):
        backup_db_module.backup_sqlite(str(source))

    assert len(observed) == 1
    assert not REGULAR_BACKUP_NAME.fullmatch(observed[0].name)
    assert {path.name: path.read_bytes() for path in backup_dir.iterdir()} == expected


def test_postgres_dump_is_written_privately_before_publication(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime_root = tmp_path / "runtime"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    written: list[Path] = []
    original_write_text = Path.write_text

    def fake_pg_dump(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(command, 0, stdout="-- dump\n", stderr="")

    def record_write(path: Path, data: str, **kwargs: object) -> int:
        written.append(path)
        return original_write_text(path, data, **kwargs)

    monkeypatch.setattr(backup_db_module.subprocess, "run", fake_pg_dump)
    monkeypatch.setattr(Path, "write_text", record_write)

    published = backup_db_module.backup_postgres(None, "localhost", 5432, "mes_user", "mes_db")

    assert len(written) == 1
    assert not REGULAR_BACKUP_NAME.fullmatch(written[0].name)
    assert not written[0].exists()
    assert REGULAR_BACKUP_NAME.fullmatch(published.name)
    assert published.read_text(encoding="utf-8") == "-- dump\n"


def test_failed_postgres_temp_write_leaves_regular_backups_unchanged(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "postgres"
    backup_dir.mkdir(parents=True)
    existing = []
    for index in range(10):
        backup = backup_dir / f"mes_20000101_0000{index:02d}.sql"
        backup.write_bytes(f"existing-{index}".encode())
        existing.append(backup)
    expected = {path.name: path.read_bytes() for path in existing}
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))

    def fake_pg_dump(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(command, 0, stdout="-- partial dump\n", stderr="")

    def fail_partial_write(path: Path, data: str, **kwargs: object) -> int:
        path.write_bytes(data.encode())
        raise OSError("injected dump write failure")

    monkeypatch.setattr(backup_db_module.subprocess, "run", fake_pg_dump)
    monkeypatch.setattr(Path, "write_text", fail_partial_write)

    with pytest.raises((OSError, SystemExit)):
        backup_db_module.backup_postgres(None, "localhost", 5432, "mes_user", "mes_db")

    assert {path.name: path.read_bytes() for path in backup_dir.iterdir()} == expected


def test_concurrent_sqlite_backup_processes_create_distinct_verified_files(tmp_path: Path) -> None:
    src = tmp_path / "source.db"
    _create_ops_schema_db(src)
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    backup_dir.mkdir(parents=True)
    for index in range(11):
        old_backup = backup_dir / f"mes_20000101_0000{index:02d}.db"
        old_backup.touch()
        os.utime(old_backup, (index + 1, index + 1))
    env = os.environ.copy()
    env["MES_RUNTIME_ROOT"] = str(runtime_root)
    command = [sys.executable, str(BACKUP_DB), "--sqlite", str(src)]

    while time.time() % 1 > 0.2:
        time.sleep(0.01)
    processes = [
        subprocess.Popen(
            command,
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
        )
        for _ in range(2)
    ]
    results = [process.communicate(timeout=30) for process in processes]

    for process, (stdout, stderr) in zip(processes, results, strict=True):
        assert process.returncode == 0, stdout + stderr
    paths = [_backup_path_from_stdout(stdout) for stdout, _ in results]
    assert paths[0] != paths[1]
    for path in paths:
        assert path.exists()
        verify = _run_script(VERIFY_BACKUP, str(path))
        assert verify.returncode == 0, verify.stdout + verify.stderr


def test_failed_sqlite_backup_cannot_delete_an_existing_normal_backup(
    tmp_path: Path,
) -> None:
    valid = tmp_path / "valid.db"
    corrupt = tmp_path / "corrupt.db"
    _create_ops_schema_db(valid)
    corrupt.write_bytes(b"not a sqlite database")
    env = {"MES_RUNTIME_ROOT": str(tmp_path / "runtime")}

    for _ in range(4):
        while time.time() % 1 > 0.1:
            time.sleep(0.01)
        successful = _run_script(BACKUP_DB, "--sqlite", str(valid), env=env)
        assert successful.returncode == 0, successful.stdout + successful.stderr
        successful_backup = _backup_path_from_stdout(successful.stdout)
        backup_second = successful_backup.name[4:19]
        if backup_second != real_datetime.now().strftime("%Y%m%d_%H%M%S") or time.time() % 1 > 0.75:
            continue

        failed = _run_script(BACKUP_DB, "--sqlite", str(corrupt), env=env)

        assert failed.returncode != 0
        assert successful_backup.exists()
        verify = _run_script(VERIFY_BACKUP, str(successful_backup))
        assert verify.returncode == 0, verify.stdout + verify.stderr
        return

    pytest.fail("could not execute both backup subprocesses within one timestamp second")


def test_backup_db_py_rejects_legacy_backup_directory_override(tmp_path: Path) -> None:
    src = tmp_path / "source.db"
    _create_ops_schema_db(src)
    runtime_root = tmp_path / "runtime"
    legacy_dir = tmp_path / "legacy-backups"

    result = _run_script(
        BACKUP_DB,
        "--sqlite",
        str(src),
        env={
            "MES_RUNTIME_ROOT": str(runtime_root),
            "MES_SQLITE_BACKUP_DIR": str(legacy_dir),
        },
    )

    assert result.returncode != 0
    assert "MES_SQLITE_BACKUP_DIR" in result.stderr
    assert not legacy_dir.exists()


def test_backup_db_keeps_latest_ten_regular_sqlite_backups_and_preserves_pre_snapshots(tmp_path: Path) -> None:
    src = tmp_path / "source.db"
    _create_ops_schema_db(src)
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    backup_dir.mkdir(parents=True)
    old_backups = []
    for index in range(11):
        backup = backup_dir / f"mes_20000101_0000{index:02d}.db"
        backup.touch()
        old_backups.append(backup)
        timestamp = time.time() - (100 - index)
        os.utime(backup, (timestamp, timestamp))
    pre_snapshot = backup_dir / "mes_PRE-RESTORE_20000101_000000.db"
    pre_snapshot.touch()

    result = _run_script(BACKUP_DB, "--sqlite", str(src), env={"MES_RUNTIME_ROOT": str(runtime_root)})

    regular = sorted(backup_dir.glob("mes_[0-9]*.db"), key=lambda path: path.stat().st_mtime, reverse=True)
    assert result.returncode == 0, result.stdout + result.stderr
    assert len(regular) == 10
    assert pre_snapshot.exists()
    assert not old_backups[0].exists()
    assert not old_backups[1].exists()


def test_restore_db_py_keeps_pre_restore_snapshot_under_runtime_root(tmp_path: Path) -> None:
    backup = tmp_path / "backup.db"
    target = tmp_path / "target.db"
    _create_ops_schema_db(backup)
    _create_ops_schema_db(target)
    runtime_root = tmp_path / "runtime"

    result = _run_script(
        RESTORE_DB,
        "--sqlite",
        str(backup),
        "--target",
        str(target),
        env={"MES_RUNTIME_ROOT": str(runtime_root)},
    )

    snapshots = list((runtime_root / "backups" / "sqlite").glob("mes_PRE-RESTORE_*.db"))
    assert result.returncode == 0, result.stdout + result.stderr
    assert len(snapshots) == 1
    assert not list(tmp_path.glob("target.pre-restore.*.db"))


def test_pre_restore_snapshot_includes_wal_commit_and_never_collides(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target = tmp_path / "target.db"
    _create_ops_schema_db(target)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime"))

    connection = sqlite3.connect(target)
    try:
        assert connection.execute("PRAGMA journal_mode=WAL").fetchone()[0] == "wal"
        connection.execute("PRAGMA wal_autocheckpoint=0")
        connection.execute("INSERT INTO items VALUES ('wal-item', 'AA-0002', 'WAL Part')")
        connection.commit()
        assert Path(f"{target}-wal").exists()

        first = restore_db_module._create_pre_restore_snapshot(target)
        second = restore_db_module._create_pre_restore_snapshot(target)

        assert first != second
        for snapshot in (first, second):
            verify = _run_script(VERIFY_BACKUP, str(snapshot))
            assert verify.returncode == 0, verify.stdout + verify.stderr
            with sqlite3.connect(snapshot) as snapshot_db:
                assert snapshot_db.execute(
                    "SELECT item_name FROM items WHERE item_id = 'wal-item'"
                ).fetchone() == ("WAL Part",)
    finally:
        connection.close()


def test_restore_rolls_back_when_quarantining_a_sidecar_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "backup.db"
    target = tmp_path / "mes.db"
    _create_ops_schema_db(source)
    _create_ops_schema_db(target)
    sidecar_bytes = {
        "-wal": b"old wal",
        "-shm": b"old shm",
        "-journal": b"old journal",
    }
    for suffix, content in sidecar_bytes.items():
        Path(f"{target}{suffix}").write_bytes(content)
    target_bytes = target.read_bytes()
    original_replace = restore_db_module.os.replace

    def fail_second_sidecar_move(src: str | Path, dst: str | Path) -> None:
        if Path(src) == Path(f"{target}-shm"):
            raise OSError("injected sidecar quarantine failure")
        original_replace(src, dst)

    monkeypatch.setattr(restore_db_module.os, "replace", fail_second_sidecar_move)

    with pytest.raises(OSError):
        restore_db_module._replace_sqlite_atomically(source, target)

    assert target.read_bytes() == target_bytes
    for suffix, content in sidecar_bytes.items():
        assert Path(f"{target}{suffix}").read_bytes() == content
    assert not list(tmp_path.glob(".mes.db.quarantine-*"))
    assert not list(tmp_path.glob(".mes.db.restore-*.tmp"))


def test_restore_rolls_back_after_main_quarantine_when_install_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "backup.db"
    target = tmp_path / "mes.db"
    _create_ops_schema_db(source)
    _create_ops_schema_db(target)
    Path(f"{target}-wal").write_bytes(b"old wal")
    target_bytes = target.read_bytes()
    original_replace = restore_db_module.os.replace
    main_quarantined = False

    def fail_staged_install(src: str | Path, dst: str | Path) -> None:
        nonlocal main_quarantined
        source_path = Path(src)
        destination_path = Path(dst)
        if source_path == target and ".quarantine-" in destination_path.name:
            main_quarantined = True
        if destination_path == target and ".restore-" in source_path.name:
            raise OSError("injected staged install failure")
        original_replace(src, dst)

    monkeypatch.setattr(restore_db_module.os, "replace", fail_staged_install)

    with pytest.raises(OSError):
        restore_db_module._replace_sqlite_atomically(source, target)

    assert main_quarantined
    assert target.read_bytes() == target_bytes
    assert Path(f"{target}-wal").read_bytes() == b"old wal"
    assert not list(tmp_path.glob(".mes.db.quarantine-*"))
    assert not list(tmp_path.glob(".mes.db.restore-*.tmp"))


def test_restore_cleanup_failure_leaves_new_target_active_without_stale_sidecars(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    source = tmp_path / "backup.db"
    target = tmp_path / "mes.db"
    _create_ops_schema_db(source)
    _create_ops_schema_db(target)
    with sqlite3.connect(source) as source_db:
        source_db.execute("UPDATE items SET item_name = 'Restored Part' WHERE item_id = 'item-1'")
    sidecar_bytes = {
        "-wal": b"old wal",
        "-shm": b"old shm",
        "-journal": b"old journal",
    }
    for suffix, content in sidecar_bytes.items():
        Path(f"{target}{suffix}").write_bytes(content)
    original_unlink = Path.unlink

    def fail_quarantine_wal_cleanup(path: Path, missing_ok: bool = False) -> None:
        if ".quarantine-" in path.name and path.name.endswith("-wal"):
            raise PermissionError("injected quarantine cleanup failure")
        original_unlink(path, missing_ok=missing_ok)

    monkeypatch.setattr(Path, "unlink", fail_quarantine_wal_cleanup)

    restore_db_module._replace_sqlite_atomically(source, target)

    for suffix in sidecar_bytes:
        assert not Path(f"{target}{suffix}").exists()
    with sqlite3.connect(target) as restored:
        assert restored.execute("SELECT item_name FROM items WHERE item_id = 'item-1'").fetchone() == (
            "Restored Part",
        )
    leftovers = list(tmp_path.glob(".mes.db.quarantine-*-wal"))
    assert len(leftovers) == 1
    assert list(tmp_path.glob(".mes.db.quarantine-*")) == leftovers
    assert leftovers[0].read_bytes() == b"old wal"
    assert str(leftovers[0]) in capsys.readouterr().err


@pytest.mark.parametrize("failure_stage", ["copy", "verify", "replace"])
def test_restore_staging_failure_preserves_target_and_sidecars(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    failure_stage: str,
) -> None:
    source_dir = tmp_path / "source"
    target_dir = tmp_path / "target"
    source_dir.mkdir()
    target_dir.mkdir()
    source = source_dir / "backup.db"
    target = target_dir / "mes.db"
    _create_ops_schema_db(source)
    _create_ops_schema_db(target)
    with sqlite3.connect(source) as source_db:
        source_db.execute("UPDATE items SET item_name = 'Restored Part' WHERE item_id = 'item-1'")
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime"))

    target_db = sqlite3.connect(target)
    try:
        assert target_db.execute("PRAGMA journal_mode=WAL").fetchone()[0] == "wal"
        target_db.execute("PRAGMA wal_autocheckpoint=0")
        target_db.execute("INSERT INTO items VALUES ('wal-item', 'AA-0002', 'WAL Part')")
        target_db.commit()
        staged_boundary: dict[str, bytes] = {}
        original_snapshot = restore_db_module._create_pre_restore_snapshot

        def capture_staging_boundary(path: Path) -> Path:
            snapshot = original_snapshot(path)
            staged_boundary[""] = target.read_bytes()
            for suffix in ("-wal", "-shm"):
                staged_boundary[suffix] = Path(f"{target}{suffix}").read_bytes()
            return snapshot

        monkeypatch.setattr(restore_db_module, "_create_pre_restore_snapshot", capture_staging_boundary)

        if failure_stage == "copy":
            original_copy2 = restore_db_module.shutil.copy2

            def fail_staging_copy(src: str | Path, dst: str | Path, *args: object, **kwargs: object) -> Path:
                destination = Path(dst)
                if destination.parent == target.parent:
                    destination.write_bytes(b"partial staged copy")
                    raise OSError("injected staging copy failure")
                return Path(original_copy2(src, dst, *args, **kwargs))

            monkeypatch.setattr(restore_db_module.shutil, "copy2", fail_staging_copy)
        elif failure_stage == "verify":
            original_verify = restore_db_module._verify_sqlite_backup

            def fail_staging_verify(path: Path) -> None:
                if path.parent == target.parent and path not in {source, target}:
                    raise SystemExit(91)
                original_verify(path)

            monkeypatch.setattr(restore_db_module, "_verify_sqlite_backup", fail_staging_verify)
        else:
            def fail_replace(src: str | Path, dst: str | Path) -> None:
                raise OSError("injected atomic replace failure")

            monkeypatch.setattr(restore_db_module.os, "replace", fail_replace)

        with pytest.raises((OSError, SystemExit)):
            restore_db_module.restore_sqlite(str(source), str(target), run_check=False)

        assert target.read_bytes() == staged_boundary[""]
        for suffix in ("-wal", "-shm"):
            sidecar = Path(f"{target}{suffix}")
            assert sidecar.exists()
            assert sidecar.read_bytes() == staged_boundary[suffix]
        assert not list(target.parent.glob(f".{target.name}.restore-*.tmp"))
    finally:
        target_db.close()


def test_successful_restore_removes_stale_sqlite_sidecars(tmp_path: Path) -> None:
    source = tmp_path / "backup.db"
    target = tmp_path / "target" / "mes.db"
    _create_ops_schema_db(source)
    target.parent.mkdir()
    Path(f"{target}-wal").write_bytes(b"stale wal")
    Path(f"{target}-shm").write_bytes(b"stale shm")

    restore_db_module.restore_sqlite(str(source), str(target), run_check=False)

    assert target.exists()
    assert not Path(f"{target}-wal").exists()
    assert not Path(f"{target}-shm").exists()
    verify = _run_script(VERIFY_BACKUP, str(target))
    assert verify.returncode == 0, verify.stdout + verify.stderr


def test_restore_db_py_rejects_invalid_sqlite_backup(tmp_path: Path) -> None:
    invalid_backup = tmp_path / "invalid.db"
    sqlite3.connect(invalid_backup).close()
    target = tmp_path / "target.db"
    _create_ops_schema_db(target)

    result = _run_script(RESTORE_DB, "--sqlite", str(invalid_backup), "--target", str(target), "--check")

    assert result.returncode == 1
    verify_target = _run_script(VERIFY_BACKUP, str(target))
    assert verify_target.returncode == 0, verify_target.stdout + verify_target.stderr


def test_cleanup_backups_keeps_latest_ten_regular_runtime_backups(tmp_path: Path) -> None:
    runtime_root = tmp_path / "runtime"
    backup_dir = runtime_root / "backups" / "sqlite"
    backup_dir.mkdir(parents=True)
    regular = []
    for index in range(12):
        backup = backup_dir / f"mes_20000101_0000{index:02d}.db"
        backup.touch()
        timestamp = time.time() - (100 - index)
        os.utime(backup, (timestamp, timestamp))
        regular.append(backup)
    pre_snapshot = backup_dir / "mes_PRE-maintenance_20000101_000000.db"
    pre_snapshot.touch()
    legacy_dir = tmp_path / "backend" / "_backup"
    legacy_dir.mkdir(parents=True)
    legacy = legacy_dir / "mes_legacy.db"
    legacy.touch()

    result = _run_script(
        CLEANUP_BACKUPS,
        env={"MES_RUNTIME_ROOT": str(runtime_root)},
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert not regular[0].exists()
    assert not regular[1].exists()
    assert all(path.exists() for path in regular[2:])
    assert pre_snapshot.exists()
    assert legacy.exists()


def test_backup_batch_propagates_python_failure_exit_code(tmp_path: Path) -> None:
    missing = tmp_path / "missing.db"

    result = subprocess.run(
        ["cmd.exe", "/c", str(BACKUP_DB_BAT), "--sqlite", str(missing)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode != 0
    assert "not found" in (result.stdout + result.stderr).lower()


def test_restore_batch_propagates_python_failure_exit_code(tmp_path: Path) -> None:
    missing = tmp_path / "missing.db"

    result = subprocess.run(
        ["cmd.exe", "/c", str(RESTORE_DB_BAT), str(missing)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode != 0
    assert "not found" in (result.stdout + result.stderr).lower()
