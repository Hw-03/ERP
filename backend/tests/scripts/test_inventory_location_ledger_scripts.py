"""실행 가능한 legacy/운영 스크립트도 W=B+Z+U 원장을 우회하지 않는다."""

from __future__ import annotations

import ast
import importlib.util
from pathlib import Path
import sqlite3

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
ATTIC_SCRIPTS = REPO_ROOT / "_attic" / "backend-scripts"


def _function_source(path: Path, function_name: str) -> str:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source)
    function = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == function_name
    )
    assert function.end_lineno is not None
    return "\n".join(source.splitlines()[function.lineno - 1 : function.end_lineno])


def _load_import_history_module():
    path = ATTIC_SCRIPTS / "import_emp_io_history.py"
    spec = importlib.util.spec_from_file_location("import_emp_io_history_contract", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _ledger_connection(
    *,
    warehouse: int,
    box: int,
    zone: int,
    unplaced: int,
    deleted_at: str | None = None,
):
    connection = sqlite3.connect(":memory:")
    connection.executescript(
        """
        CREATE TABLE inventory (item_id TEXT PRIMARY KEY, warehouse_qty INTEGER NOT NULL);
        CREATE TABLE items (item_id TEXT PRIMARY KEY, deleted_at TEXT);
        CREATE TABLE warehouse_box_items (
            id TEXT PRIMARY KEY, item_id TEXT NOT NULL, quantity INTEGER NOT NULL
        );
        CREATE TABLE warehouse_special_zones (
            id INTEGER PRIMARY KEY, is_active INTEGER NOT NULL
        );
        CREATE TABLE warehouse_special_zone_items (
            id TEXT PRIMARY KEY, zone_id INTEGER NOT NULL,
            item_id TEXT NOT NULL, quantity INTEGER NOT NULL
        );
        CREATE TABLE warehouse_unplaced_items (
            id TEXT PRIMARY KEY, item_id TEXT NOT NULL UNIQUE, quantity INTEGER NOT NULL
        );
        """
    )
    connection.execute(
        "INSERT INTO items (item_id, deleted_at) VALUES ('item-a', ?)",
        (deleted_at,),
    )
    connection.execute(
        "INSERT INTO inventory (item_id, warehouse_qty) VALUES ('item-a', ?)",
        (warehouse,),
    )
    connection.execute(
        "INSERT INTO warehouse_box_items (id, item_id, quantity) "
        "VALUES ('box-row', 'item-a', ?)",
        (box,),
    )
    connection.execute(
        "INSERT INTO warehouse_special_zones (id, is_active) VALUES (1, 1)"
    )
    connection.execute(
        "INSERT INTO warehouse_special_zone_items "
        "(id, zone_id, item_id, quantity) VALUES ('zone-row', 1, 'item-a', ?)",
        (zone,),
    )
    connection.execute(
        "INSERT INTO warehouse_unplaced_items (id, item_id, quantity) "
        "VALUES ('unplaced-row', 'item-a', ?)",
        (unplaced,),
    )
    connection.commit()
    return connection


def test_employee_history_import_reconciles_target_unplaced_residual() -> None:
    module = _load_import_history_module()
    connection = _ledger_connection(warehouse=10, box=3, zone=2, unplaced=99)
    try:
        assert module.sync_warehouse_unplaced(connection) == 1
        assert connection.execute(
            "SELECT quantity FROM warehouse_unplaced_items WHERE item_id = 'item-a'"
        ).fetchone() == (5,)
    finally:
        connection.close()


def test_employee_history_import_fails_closed_when_target_is_overplaced() -> None:
    module = _load_import_history_module()
    connection = _ledger_connection(warehouse=4, box=3, zone=2, unplaced=0)
    try:
        with pytest.raises(RuntimeError, match=r"B\+Z>W"):
            module.sync_warehouse_unplaced(connection)
    finally:
        connection.close()


def test_employee_history_import_fails_closed_on_inactive_zone_stock() -> None:
    module = _load_import_history_module()
    connection = _ledger_connection(warehouse=5, box=0, zone=0, unplaced=5)
    connection.execute(
        "INSERT INTO warehouse_special_zones (id, is_active) VALUES (2, 0)"
    )
    connection.execute(
        "INSERT INTO warehouse_special_zone_items "
        "(id, zone_id, item_id, quantity) VALUES ('inactive-zone-row', 2, 'item-a', 1)"
    )
    connection.commit()
    try:
        with pytest.raises(RuntimeError, match="비활성 특수구역"):
            module.sync_warehouse_unplaced(connection)
    finally:
        connection.close()


def test_employee_history_import_creates_unplaced_for_deleted_items() -> None:
    module = _load_import_history_module()
    connection = _ledger_connection(
        warehouse=10,
        box=3,
        zone=2,
        unplaced=99,
        deleted_at="2026-08-31 00:00:00",
    )
    try:
        assert module.sync_warehouse_unplaced(connection) == 1
        assert connection.execute(
            "SELECT quantity FROM warehouse_unplaced_items WHERE item_id = 'item-a'"
        ).fetchone() == (5,)
    finally:
        connection.close()


def test_legacy_seed_creates_unplaced_row_with_each_inventory() -> None:
    source = (ATTIC_SCRIPTS / "seed.py").read_text(encoding="utf-8")

    assert source.count("WarehouseUnplacedItem(") >= 2


def test_legacy_seed_commits_each_rebuild_as_one_transaction() -> None:
    path = ATTIC_SCRIPTS / "seed.py"

    assert ".commit()" not in _function_source(path, "reset_core_tables")
    assert ".commit()" not in _function_source(path, "seed_employees")
    assert _function_source(path, "seed_from_legacy_html").count(".commit()") == 1
    assert _function_source(path, "seed").count(".commit()") == 1


def test_full_warehouse_seed_moves_unplaced_through_ledger_service() -> None:
    source = (ATTIC_SCRIPTS / "seed_all_warehouse_items.py").read_text(
        encoding="utf-8"
    )

    assert "WarehouseUnplacedItem" in source
    assert "_replace_box_items(" in source
    assert "WarehouseBoxItem(" not in source


def test_full_warehouse_seed_rolls_back_and_closes_on_failure() -> None:
    source = (ATTIC_SCRIPTS / "seed_all_warehouse_items.py").read_text(
        encoding="utf-8"
    )

    assert "except Exception:" in source
    assert "db.rollback()" in source
    assert "finally:" in source
    assert "db.close()" in source


def test_distribution_seed_preserves_box_total_through_ledger_service() -> None:
    source = (ATTIC_SCRIPTS / "distribute_warehouse_boxes.py").read_text(
        encoding="utf-8"
    )

    assert "_replace_box_items(" in source
    assert "reconcile_inventory(" in source
    assert "WarehouseBoxItem(" not in source
    assert "divmod(placed_total," in source


def test_box_cleanup_fails_closed_instead_of_rewriting_physical_rows() -> None:
    source = (ATTIC_SCRIPTS / "fix_warehouse_box_items.py").read_text(
        encoding="utf-8"
    )

    assert "reconcile_inventory(" in source
    assert 'report["ledger_mismatch_count"]' in source
    assert "WarehouseBoxItem).filter" not in source
    assert 'update({"quantity"' not in source


def test_box_depletion_qa_verifies_full_bzu_priority_and_warehouse_limit() -> None:
    source = (ATTIC_SCRIPTS / "verify_box_depletion.py").read_text(
        encoding="utf-8"
    )

    assert "WarehouseSpecialZone" in source
    assert "WarehouseUnplacedItem" in source
    assert '"warehouse_zone"' in source
    assert '"warehouse_unplaced"' in source
    assert "warehouse_quantity + 1" in source
    assert "total + 1" not in source
