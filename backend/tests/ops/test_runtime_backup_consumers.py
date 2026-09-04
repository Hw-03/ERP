from __future__ import annotations

import importlib.util
import inspect
import sqlite3
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bootstrap.schema import ensure_schema  # noqa: E402
from scripts.ops import backup_manifest  # noqa: E402
from scripts.ops.maintenance_backup import create_sqlite_snapshot  # noqa: E402


def _load_module(relative_path: str):
    path = ROOT / relative_path
    name = "runtime_contract_" + "_".join(path.parts[-3:]).replace(".", "_").replace("-", "_")
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules.pop(name, None)
    return module


def _create_sqlite(path: Path, *, operational_schema: bool = False) -> None:
    if operational_schema:
        engine = create_engine(f"sqlite:///{path.as_posix()}")
        try:
            ensure_schema(engine=engine)
        finally:
            engine.dispose()
        return
    with sqlite3.connect(path) as connection:
        connection.execute("CREATE TABLE marker (id INTEGER PRIMARY KEY)")


@pytest.mark.parametrize(
    ("relative_path", "function_name", "extra_args"),
    [
        ("scripts/dev/register_blue_items.py", "create_db_backup", ()),
        ("scripts/dev/fix_serial_conflicts.py", "create_db_backup", ()),
        ("scripts/dev/restore_item_codes_from_backup.py", "create_current_db_backup", ()),
        ("scripts/dev/renumber_gap_item_codes.py", "_create_backup", ("contract",)),
        ("scripts/dev/replenish_department_safety_stock.py", "_create_backup", ()),
        ("backend/scripts/repair_item_codes.py", "create_db_backup", ()),
        ("_attic/backend-scripts/import_emp_io_history.py", "backup_dev_db", ()),
    ],
)
def test_maintenance_script_backup_is_created_under_runtime_root(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    relative_path: str,
    function_name: str,
    extra_args: tuple[str, ...],
) -> None:
    runtime_root = tmp_path / "runtime"
    source = tmp_path / "source.db"
    _create_sqlite(source, operational_schema=True)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{source.as_posix()}")
    module = _load_module(relative_path)

    created = Path(getattr(module, function_name)(source, *extra_args))

    assert created.is_file()
    assert created.parent == runtime_root / "backups" / "sqlite"
    assert created.name.startswith("mes_PRE-")
    assert backup_manifest.manifest_path_for(created).is_file()
    assert (
        backup_manifest.verify_sqlite_backup(created).status
        is backup_manifest.BackupStatus.PASS
    )
    assert not list(tmp_path.glob("source.db.backup-*"))
    assert not (tmp_path / "_backup").exists()


@pytest.mark.parametrize(
    ("relative_path", "function_name"),
    [
        ("scripts/dev/renumber_gap_item_codes.py", "renumber_database"),
        ("scripts/dev/replenish_department_safety_stock.py", "replenish_database"),
    ],
)
def test_active_maintenance_api_has_no_arbitrary_backup_directory_override(
    relative_path: str, function_name: str
) -> None:
    module = _load_module(relative_path)

    assert "backup_dir" not in inspect.signature(getattr(module, function_name)).parameters


def test_attic_backup_wrapper_creates_verified_regular_runtime_backup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    runtime_root = tmp_path / "runtime"
    source = tmp_path / "source.db"
    _create_sqlite(source, operational_schema=True)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    module = _load_module("_attic/backend-scripts/backup_db.py")

    created = Path(module.backup(db_src=source))

    assert created.is_file()
    assert created.parent == runtime_root / "backups" / "sqlite"
    assert created.name.startswith("mes_")
    assert "PRE-" not in created.name
    assert (
        backup_manifest.verify_sqlite_backup(created).status
        is backup_manifest.BackupStatus.PASS
    )


def test_failed_maintenance_snapshot_leaves_no_runtime_artifact(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    runtime_root = tmp_path / "runtime"
    corrupt = tmp_path / "corrupt.db"
    corrupt.write_bytes(b"not a sqlite database")
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))

    with pytest.raises(sqlite3.DatabaseError):
        create_sqlite_snapshot(corrupt, "corrupt-contract")

    assert not list((runtime_root / "backups" / "sqlite").glob("*.db"))


def test_maintenance_snapshot_records_generation_and_detects_wal_round_trip(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime_root = tmp_path / "runtime"
    source = tmp_path / "maintenance-source.db"
    _create_sqlite(source, operational_schema=True)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))

    writer = sqlite3.connect(source)
    try:
        assert writer.execute("PRAGMA journal_mode=WAL").fetchone() == ("wal",)
        writer.execute("PRAGMA wal_autocheckpoint=0")
        created = create_sqlite_snapshot(source, "generation-contract")
        manifest = backup_manifest.verify_manifest_receipt(
            created,
            expected_engine="sqlite",
        ).manifest
        assert manifest is not None
        assert len(str(manifest["source_snapshot"]["physical_generation"])) == 64

        writer.execute(
            "INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)",
            ("maintenance-round-trip", "temporary"),
        )
        writer.commit()
        writer.execute(
            "DELETE FROM system_settings WHERE setting_key = ?",
            ("maintenance-round-trip",),
        )
        writer.commit()

        result = backup_manifest.verify_sqlite_backup(created, source_path=source)
    finally:
        writer.close()

    assert result.status is backup_manifest.BackupStatus.STALE
    assert "source physical generation changed" in result.errors
