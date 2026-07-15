from __future__ import annotations

import importlib.util
import inspect
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ops.maintenance_backup import create_sqlite_snapshot


REQUIRED_TABLES = (
    "items",
    "inventory",
    "inventory_locations",
    "stock_requests",
    "stock_request_lines",
    "transaction_logs",
    "bom",
    "admin_audit_logs",
    "warehouse_angles",
    "warehouse_boxes",
    "warehouse_box_items",
    "io_batches",
    "io_bundles",
    "io_lines",
    "shipping_requests",
    "shipping_request_bom_lines",
    "shipping_request_companion_lines",
    "shipping_allocations",
    "shipping_request_checklist_lines",
    "shipping_request_events",
)


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
    with sqlite3.connect(path) as connection:
        connection.execute("CREATE TABLE marker (id INTEGER PRIMARY KEY)")
        if operational_schema:
            for table in REQUIRED_TABLES:
                connection.execute(f'CREATE TABLE "{table}" (id INTEGER PRIMARY KEY)')


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
    _create_sqlite(source)
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{source.as_posix()}")
    module = _load_module(relative_path)

    created = Path(getattr(module, function_name)(source, *extra_args))

    assert created.is_file()
    assert created.parent == runtime_root / "backups" / "sqlite"
    assert created.name.startswith("mes_PRE-")
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
