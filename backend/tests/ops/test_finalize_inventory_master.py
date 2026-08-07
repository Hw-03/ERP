from __future__ import annotations

from contextlib import closing
from decimal import Decimal
from datetime import datetime
from pathlib import Path
import sqlite3
from typing import Any

import pytest
from sqlalchemy import select


def _write_employee_db(path: Path, rows: list[dict[str, Any]]) -> None:
    with closing(sqlite3.connect(path)) as connection:
        connection.executescript(
            """
            CREATE TABLE items (
                item_id TEXT PRIMARY KEY,
                mes_code TEXT NOT NULL UNIQUE,
                item_name TEXT NOT NULL,
                model_symbol TEXT NOT NULL,
                process_type_code TEXT NOT NULL,
                serial_no INTEGER NOT NULL,
                deleted_at TEXT
            );
            """
        )
        connection.executemany(
            """
            INSERT INTO items (
                item_id, mes_code, item_name, model_symbol,
                process_type_code, serial_no, deleted_at
            ) VALUES (
                :item_id, :mes_code, :item_name, :model_symbol,
                :process_type_code, :serial_no, :deleted_at
            )
            """,
            rows,
        )
        connection.commit()


def _employee_item(item, *, name: str, deleted: bool = False) -> dict[str, Any]:
    return {
        "item_id": str(item.item_id),
        "mes_code": item.mes_code,
        "item_name": name,
        "model_symbol": item.model_symbol,
        "process_type_code": item.process_type_code,
        "serial_no": item.serial_no,
        "deleted_at": "2026-08-01 00:00:00" if deleted else None,
    }


def _inventory_snapshot(db_session) -> tuple[list[tuple[Any, ...]], list[tuple[Any, ...]]]:
    from app.models import Inventory, InventoryLocation

    inventory = list(
        db_session.execute(
            select(
                Inventory.item_id,
                Inventory.quantity,
                Inventory.warehouse_qty,
                Inventory.pending_quantity,
                Inventory.last_reserver_employee_id,
                Inventory.last_reserver_name,
                Inventory.location,
            ).order_by(Inventory.item_id)
        ).all()
    )
    locations = list(
        db_session.execute(
            select(
                InventoryLocation.item_id,
                InventoryLocation.department,
                InventoryLocation.status,
                InventoryLocation.quantity,
                InventoryLocation.defective_at,
            ).order_by(InventoryLocation.item_id)
        ).all()
    )
    return inventory, locations


def test_run_finalize_changes_only_requested_item_fields(
    tmp_path: Path,
    db_session,
    make_item,
    make_location,
    make_bom,
) -> None:
    from app.models import BOM
    from scripts.ops.finalize_inventory_master import run_finalize

    renamed = make_item(
        name="예전 품명",
        model_symbol="3",
        process_type_code="AA",
        serial_no=16,
        warehouse_qty=Decimal("12"),
        pending=Decimal("2"),
    )
    disposal = make_item(
        name="삭제 이력 품목",
        model_symbol="6",
        process_type_code="NR",
        serial_no=3,
        warehouse_qty=Decimal("70"),
    )
    unrelated = make_item(name="관계없는 품목", warehouse_qty=Decimal("5"))
    make_location(renamed.item_id, quantity=Decimal("4"))
    make_bom(renamed.item_id, unrelated.item_id, Decimal("2"))
    renamed.legacy_item_type = "원자재"
    disposal.legacy_item_type = "원자재"
    db_session.commit()

    employee_db = tmp_path / "employee.db"
    _write_employee_db(
        employee_db,
        [
            _employee_item(renamed, name="현재 품명"),
            _employee_item(disposal, name=disposal.item_name, deleted=True),
        ],
    )
    inventory_before = _inventory_snapshot(db_session)
    bom_before = list(db_session.execute(select(BOM.parent_item_id, BOM.child_item_id, BOM.quantity)).all())

    summary = run_finalize(
        db_session,
        employee_db,
        disposal_codes=(disposal.mes_code,),
        rename_codes=(renamed.mes_code,),
        apply=True,
    )

    db_session.refresh(renamed)
    db_session.refresh(disposal)
    db_session.refresh(unrelated)
    assert summary.applied is True
    assert summary.disposal_items_changed == 1
    assert summary.renamed_items_changed == 1
    assert renamed.item_name == "현재 품명"
    assert renamed.legacy_item_type == "원자재"
    assert disposal.legacy_item_type == "불용"
    assert unrelated.item_name == "관계없는 품목"
    assert _inventory_snapshot(db_session) == inventory_before
    assert list(db_session.execute(select(BOM.parent_item_id, BOM.child_item_id, BOM.quantity)).all()) == bom_before


def test_run_finalize_dry_run_does_not_mutate(tmp_path: Path, db_session, make_item) -> None:
    from scripts.ops.finalize_inventory_master import run_finalize

    item = make_item(
        name="예전 품명",
        model_symbol="6",
        process_type_code="NR",
        serial_no=9,
    )
    item.legacy_item_type = "원자재"
    db_session.commit()
    employee_db = tmp_path / "employee.db"
    _write_employee_db(employee_db, [_employee_item(item, name="현재 품명")])

    summary = run_finalize(
        db_session,
        employee_db,
        disposal_codes=(item.mes_code,),
        rename_codes=(item.mes_code,),
        apply=False,
    )

    db_session.refresh(item)
    assert summary.applied is False
    assert summary.disposal_items_changed == 1
    assert summary.renamed_items_changed == 1
    assert item.item_name == "예전 품명"
    assert item.legacy_item_type == "원자재"


@pytest.mark.parametrize(
    ("employee_item_id", "employee_deleted", "error"),
    [
        ("00000000-0000-0000-0000-000000000001", False, "item_id mismatch"),
        (None, True, "rename source is deleted"),
    ],
)
def test_run_finalize_rejects_unsafe_employee_master(
    tmp_path: Path,
    db_session,
    make_item,
    employee_item_id: str | None,
    employee_deleted: bool,
    error: str,
) -> None:
    from scripts.ops.finalize_inventory_master import FinalizeInventoryMasterError, run_finalize

    item = make_item(
        name="예전 품명",
        model_symbol="8",
        process_type_code="HR",
        serial_no=55,
    )
    item.legacy_item_type = "원자재"
    db_session.commit()
    row = _employee_item(item, name="현재 품명", deleted=employee_deleted)
    if employee_item_id is not None:
        row["item_id"] = employee_item_id
    employee_db = tmp_path / "employee.db"
    _write_employee_db(employee_db, [row])

    with pytest.raises(FinalizeInventoryMasterError, match=error):
        run_finalize(
            db_session,
            employee_db,
            disposal_codes=(item.mes_code,),
            rename_codes=(item.mes_code,),
            apply=True,
        )

    db_session.refresh(item)
    assert item.item_name == "예전 품명"
    assert item.legacy_item_type == "원자재"


def test_execute_finalize_requires_confirmation_before_backup(
    tmp_path: Path,
) -> None:
    from scripts.ops.finalize_inventory_master import FinalizeInventoryMasterError, execute_finalize

    dev_db = tmp_path / "dev.db"
    employee_db = tmp_path / "employee.db"
    dev_db.touch()
    employee_db.touch()
    backups: list[str] = []

    with pytest.raises(FinalizeInventoryMasterError, match="FINALIZE-INVENTORY-MASTER"):
        execute_finalize(
            dev_db_path=dev_db,
            employee_db_path=employee_db,
            apply=True,
            confirm="wrong",
            backup_fn=backups.append,
        )

    assert backups == []


def test_employee_sqlite_connections_are_closed_after_read_and_copy(tmp_path: Path) -> None:
    from scripts.ops.finalize_inventory_master import (
        _copy_read_only_sqlite,
        _load_employee_items,
    )

    source = tmp_path / "employee.db"
    copied = tmp_path / "employee-copy.db"
    _write_employee_db(
        source,
        [
            {
                "item_id": "00000000-0000-0000-0000-000000000001",
                "mes_code": "6-NR-0003",
                "item_name": "품목",
                "model_symbol": "6",
                "process_type_code": "NR",
                "serial_no": 3,
                "deleted_at": None,
            }
        ],
    )

    assert set(_load_employee_items(source, {"6-NR-0003"})) == {"6-NR-0003"}
    _copy_read_only_sqlite(source, copied)

    source.unlink()
    copied.unlink()
    assert not source.exists()
    assert not copied.exists()


def test_run_employee_disposal_sync_changes_only_status_and_classification(
    tmp_path: Path,
    db_session,
    make_item,
    make_location,
) -> None:
    from scripts.ops.finalize_inventory_master import run_employee_disposal_sync

    restored = make_item(
        name="복귀 품목",
        model_symbol="6",
        process_type_code="NR",
        serial_no=3,
        warehouse_qty=Decimal("0"),
    )
    solo = make_item(
        name="SOLO MAIN BD",
        model_symbol="8",
        process_type_code="AR",
        serial_no=300,
        warehouse_qty=Decimal("190"),
    )
    restored.deleted_at = datetime(2026, 8, 1)
    restored.legacy_item_type = "원자재"
    solo.legacy_item_type = "원자재"
    make_location(restored.item_id, quantity=Decimal("300"))
    db_session.commit()

    dev_db = tmp_path / "dev.db"
    _write_employee_db(
        dev_db,
        [
            _employee_item(restored, name=restored.item_name),
            _employee_item(solo, name=solo.item_name),
        ],
    )
    inventory_before = _inventory_snapshot(db_session)

    summary = run_employee_disposal_sync(
        db_session,
        dev_db,
        restore_codes=(restored.mes_code,),
        disposal_codes=(restored.mes_code, solo.mes_code),
        apply=True,
    )

    db_session.refresh(restored)
    db_session.refresh(solo)
    assert summary.applied is True
    assert summary.items_restored == 1
    assert summary.disposal_items_changed == 2
    assert restored.deleted_at is None
    assert restored.legacy_item_type == "불용"
    assert solo.legacy_item_type == "불용"
    assert _inventory_snapshot(db_session) == inventory_before


def test_run_sort_order_normalization_uses_existing_default_rule_without_touching_stock(
    db_session,
    make_item,
) -> None:
    from scripts.ops.finalize_inventory_master import run_sort_order_normalization

    tr_second = make_item(
        name="튜브 두 번째",
        model_symbol="8",
        process_type_code="TR",
        serial_no=2,
    )
    nr_first = make_item(
        name="튜닝 첫 번째",
        model_symbol="6",
        process_type_code="NR",
        serial_no=1,
    )
    tr_first = make_item(
        name="튜브 첫 번째",
        model_symbol="8",
        process_type_code="TR",
        serial_no=1,
    )
    tr_second.sort_order = 0
    nr_first.sort_order = 0
    tr_first.sort_order = 50
    db_session.commit()
    inventory_before = _inventory_snapshot(db_session)

    preview = run_sort_order_normalization(db_session, apply=False)
    assert preview.changed_items == 3
    assert preview.duplicate_sort_orders == 1
    assert tr_first.sort_order == 50

    result = run_sort_order_normalization(db_session, apply=True)

    assert result.applied is True
    ordered = (
        db_session.query(type(tr_first))
        .filter(type(tr_first).item_id.in_([tr_first.item_id, tr_second.item_id, nr_first.item_id]))
        .order_by(type(tr_first).sort_order)
        .all()
    )
    assert [item.item_id for item in ordered] == [tr_first.item_id, tr_second.item_id, nr_first.item_id]
    assert [item.sort_order for item in ordered] == [0, 1, 2]
    assert _inventory_snapshot(db_session) == inventory_before
