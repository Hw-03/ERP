from __future__ import annotations

from datetime import datetime
import os
from pathlib import Path
import sqlite3
from typing import Any
import uuid

from openpyxl import Workbook
import pytest


def _employee_item(
    *,
    item_id: str,
    mes_code: str,
    item_name: str,
    deleted_at: str | None = None,
) -> dict[str, Any]:
    model_symbol, process_type_code, serial_text = mes_code.split("-")
    return {
        "item_id": item_id,
        "mes_code": mes_code,
        "item_name": item_name,
        "sort_order": 1,
        "unit": "EA",
        "legacy_part": "생산부",
        "legacy_item_type": "원자재",
        "supplier": None,
        "min_stock": 0,
        "model_symbol": model_symbol,
        "process_type_code": process_type_code,
        "serial_no": int(serial_text),
        "bom_completed_at": None,
        "sales_review_required": 0,
        "deleted_at": deleted_at,
    }


def _write_employee_db(path: Path, rows: list[dict[str, Any]]) -> None:
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            CREATE TABLE items (
                item_id TEXT PRIMARY KEY,
                mes_code TEXT NOT NULL UNIQUE,
                item_name TEXT NOT NULL,
                sort_order INTEGER,
                unit TEXT NOT NULL,
                legacy_part TEXT,
                legacy_item_type TEXT,
                supplier TEXT,
                min_stock INTEGER,
                model_symbol TEXT NOT NULL,
                process_type_code TEXT NOT NULL,
                serial_no INTEGER NOT NULL,
                bom_completed_at TEXT,
                sales_review_required INTEGER NOT NULL DEFAULT 0,
                deleted_at TEXT
            );
            """
        )
        connection.executemany(
            """
            INSERT INTO items (
                item_id, mes_code, item_name, sort_order, unit, legacy_part,
                legacy_item_type, supplier, min_stock, model_symbol,
                process_type_code, serial_no, bom_completed_at,
                sales_review_required, deleted_at
            ) VALUES (
                :item_id, :mes_code, :item_name, :sort_order, :unit, :legacy_part,
                :legacy_item_type, :supplier, :min_stock, :model_symbol,
                :process_type_code, :serial_no, :bom_completed_at,
                :sales_review_required, :deleted_at
            )
            """,
            rows,
        )


def _row(
    *,
    row_number: int,
    code: str,
    name: str,
    quantity: object,
    confirmation: str = "O",
    department: str | None = None,
    source: str = "assembly",
) -> Any:
    from scripts.ops.sync_department_inventory import SourceRow

    return SourceRow(
        source=source,
        sheet_name="재고",
        row_number=row_number,
        department=department,
        original_name=name,
        mes_name=name,
        mes_code=code,
        confirmation=confirmation,
        quantity=quantity,
    )


def _save_source_workbook(path: Path, sheet_name: str, values: dict[str, object]) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = sheet_name
    for cell, value in values.items():
        sheet[cell] = value
    workbook.save(path)
    workbook.close()


def test_console_json_is_safe_for_cp949_terminals() -> None:
    from scripts.ops.sync_department_inventory import _console_json

    payload = _console_json({"name": "튜브 ɸ"})

    assert "\\u0278" in payload
    payload.encode("ascii")


@pytest.mark.skipif(os.name != "nt", reason="Microsoft Excel COM is Windows-only")
def test_extract_source_rows_reads_calculated_current_stock_without_changing_sources(
    tmp_path: Path,
) -> None:
    from scripts.ops.sync_department_inventory import extract_source_rows

    files = {
        "2026.08_생산부 자재_고압,진공,튜닝파트.xlsx": (
            "고압",
            {
                "B2": "부서", "E2": "품목", "J2": "현재고", "K2": "MES 품목명",
                "M2": "MES 코드", "N2": "담당자 확인", "B3": "고압", "E3": "고압 원본",
                "J3": "=2+3", "K3": "고압 품목", "M3": "3-HR-0001", "N3": "o",
            },
        ),
        "2026.08_생산부 자재_조립,출하파트.xlsx": (
            "조립 자재",
            {
                "D2": "품 목", "I2": "현재고", "J2": "MES 품목명", "L2": "MES 코드",
                "M2": "담당자 확인", "D3": "조립 원본", "I3": "=4+3", "J3": "조립 품목",
                "L3": "3-AR-0002", "M3": "O",
            },
        ),
        "2026.08_생산부 자재_튜브 파트.xlsx": (
            "튜브",
            {
                "C2": "품목", "H2": "현재고", "I2": "MES 품목명", "K2": "MES 코드",
                "L2": "담당자 확인", "C3": "튜브 원본", "H3": "=5+4", "I3": "튜브 품목",
                "K3": "8-TR-0003", "L3": "O",
            },
        ),
        "2026.08_출하_완제품.xlsx": (
            "완제품",
            {
                "B2": "품 목", "L2": "총 합", "V2": "MES 품목명", "X2": "MES 코드",
                "Y2": "담당자 확인", "B3": "완제품 원본", "I3": "=6", "J3": 5,
                "L3": "=I3+J3", "V3": "완제품", "X3": "3-AF-0004", "Y3": "O",
            },
        ),
    }
    for filename, (sheet_name, values) in files.items():
        _save_source_workbook(tmp_path / filename, sheet_name, values)
    before = {path.name: path.read_bytes() for path in tmp_path.glob("*.xlsx")}

    snapshot = extract_source_rows(tmp_path)

    assert [row.quantity for row in snapshot.rows] == [5, 7, 9, 11]
    assert [row.department for row in snapshot.rows] == [None, None, None, None]
    assert snapshot.source_hashes
    assert {path.name: path.read_bytes() for path in tmp_path.glob("*.xlsx")} == before


@pytest.mark.parametrize("quantity", [-1, 1.5, "오류"])
def test_run_sync_rejects_invalid_current_stock(
    tmp_path: Path,
    db_session,
    quantity: object,
) -> None:
    from scripts.ops.sync_department_inventory import DepartmentSnapshot, DepartmentSyncError, run_sync

    employee_db = tmp_path / "employee.db"
    _write_employee_db(employee_db, [])
    snapshot = DepartmentSnapshot(rows=(_row(row_number=3, code="3-AR-0001", name="품목", quantity=quantity),), source_hashes={})

    with pytest.raises(DepartmentSyncError, match="현재고"):
        run_sync(db_session, employee_db, snapshot, apply=False)


def test_run_sync_applies_confirmed_groups_protects_unconfirmed_and_zeroes_absent(
    tmp_path: Path,
    db_session,
    make_item,
) -> None:
    from app.models import Inventory, InventoryLocation, LocationStatusEnum, TransactionLog, TransactionTypeEnum
    from scripts.ops.sync_department_inventory import DepartmentSnapshot, run_sync

    applied = make_item(name="예전 품명", process_type_code="AR", warehouse_qty=5, model_symbol="3", serial_no=1)
    protected = make_item(name="보호 품목", process_type_code="AR", warehouse_qty=2, model_symbol="3", serial_no=2)
    absent = make_item(name="미포함 품목", process_type_code="AR", warehouse_qty=1, model_symbol="3", serial_no=3)
    db_session.add_all(
        [
            InventoryLocation(item_id=applied.item_id, department="조립", status=LocationStatusEnum.PRODUCTION, quantity=4),
            InventoryLocation(item_id=applied.item_id, department="조립", status=LocationStatusEnum.DEFECTIVE, quantity=2),
            InventoryLocation(item_id=protected.item_id, department="조립", status=LocationStatusEnum.PRODUCTION, quantity=20),
            InventoryLocation(item_id=absent.item_id, department="조립", status=LocationStatusEnum.PRODUCTION, quantity=30),
            TransactionLog(item_id=applied.item_id, transaction_type=TransactionTypeEnum.RECEIVE, quantity_change=5),
        ]
    )
    db_session.commit()
    employee_db = tmp_path / "employee.db"
    _write_employee_db(
        employee_db,
        [
            _employee_item(item_id=str(applied.item_id), mes_code=applied.mes_code, item_name="현재 품명"),
            _employee_item(item_id=str(protected.item_id), mes_code=protected.mes_code, item_name=protected.item_name),
        ],
    )
    snapshot = DepartmentSnapshot(
        rows=(
            _row(row_number=3, code=applied.mes_code, name="현재 품명", quantity=7),
            _row(row_number=4, code=applied.mes_code, name="현재 품명", quantity=5, confirmation="o"),
            _row(row_number=5, code=protected.mes_code, name=protected.item_name, quantity=9, confirmation=""),
        ),
        source_hashes={},
    )
    history_before = db_session.query(TransactionLog).count()

    summary = run_sync(db_session, employee_db, snapshot, apply=True)

    assert summary.applied is True
    assert summary.duplicate_groups == 1
    assert summary.applied_groups == 1
    assert summary.protected_groups == 1
    assert summary.absent_locations_zeroed == 1
    assert summary.absent_quantity_zeroed == 30
    production = {
        str(location.item_id): int(location.quantity)
        for location in db_session.query(InventoryLocation).filter_by(status=LocationStatusEnum.PRODUCTION)
    }
    assert production[str(applied.item_id)] == 12
    assert production[str(protected.item_id)] == 20
    assert production[str(absent.item_id)] == 0
    db_session.refresh(applied)
    assert applied.item_name == "현재 품명"
    applied_inventory = db_session.query(Inventory).filter_by(item_id=applied.item_id).one()
    assert (int(applied_inventory.warehouse_qty), int(applied_inventory.quantity)) == (5, 19)
    assert db_session.query(InventoryLocation).filter_by(item_id=applied.item_id, status=LocationStatusEnum.DEFECTIVE).one().quantity == 2
    assert db_session.query(TransactionLog).count() == history_before


def test_run_sync_protects_entire_duplicate_group_when_one_row_is_unconfirmed(
    tmp_path: Path,
    db_session,
    make_item,
) -> None:
    from app.models import InventoryLocation, LocationStatusEnum
    from scripts.ops.sync_department_inventory import DepartmentSnapshot, run_sync

    item = make_item(name="중복 품목", process_type_code="AR", model_symbol="3", serial_no=1)
    db_session.add(InventoryLocation(item_id=item.item_id, department="조립", status=LocationStatusEnum.PRODUCTION, quantity=40))
    db_session.commit()
    employee_db = tmp_path / "employee.db"
    _write_employee_db(employee_db, [_employee_item(item_id=str(item.item_id), mes_code=item.mes_code, item_name=item.item_name)])
    snapshot = DepartmentSnapshot(
        rows=(
            _row(row_number=3, code=item.mes_code, name=item.item_name, quantity=5),
            _row(row_number=4, code=item.mes_code, name=item.item_name, quantity=7, confirmation=""),
        ),
        source_hashes={},
    )

    summary = run_sync(db_session, employee_db, snapshot, apply=True)

    assert summary.applied_groups == 0
    assert summary.protected_groups == 1
    assert db_session.query(InventoryLocation).filter_by(item_id=item.item_id).one().quantity == 40


def test_run_sync_allows_blank_current_stock_only_for_unconfirmed_protected_rows(
    tmp_path: Path,
    db_session,
    make_item,
) -> None:
    from app.models import InventoryLocation, LocationStatusEnum
    from scripts.ops.sync_department_inventory import DepartmentSnapshot, run_sync

    item = make_item(name="참고 품목", process_type_code="NR", model_symbol="6", serial_no=3)
    db_session.add(
        InventoryLocation(
            item_id=item.item_id,
            department="튜닝",
            status=LocationStatusEnum.PRODUCTION,
            quantity=14,
        )
    )
    db_session.commit()
    employee_db = tmp_path / "employee.db"
    _write_employee_db(
        employee_db,
        [_employee_item(item_id=str(item.item_id), mes_code=item.mes_code, item_name=item.item_name)],
    )
    snapshot = DepartmentSnapshot(
        rows=(
            _row(
                row_number=200,
                code=item.mes_code,
                name=item.item_name,
                quantity=None,
                confirmation="",
                source="high_vacuum_tuning",
            ),
        ),
        source_hashes={},
    )

    summary = run_sync(db_session, employee_db, snapshot, apply=True)

    assert summary.applied_groups == 0
    assert summary.protected_groups == 1
    assert db_session.query(InventoryLocation).filter_by(item_id=item.item_id).one().quantity == 14


def test_run_sync_adds_current_employee_item_and_rejects_code_collision(
    tmp_path: Path,
    db_session,
    make_item,
) -> None:
    from app.models import InventoryLocation, LocationStatusEnum
    from scripts.ops.sync_department_inventory import DepartmentSnapshot, DepartmentSyncError, run_sync

    collision = make_item(name="코드 소유자", process_type_code="AR", model_symbol="3", serial_no=9)
    employee_db = tmp_path / "employee.db"
    new_id = uuid.uuid4().hex
    _write_employee_db(employee_db, [_employee_item(item_id=new_id, mes_code=collision.mes_code, item_name="신규 품목")])
    snapshot = DepartmentSnapshot(rows=(_row(row_number=3, code=collision.mes_code, name="신규 품목", quantity=3),), source_hashes={})

    with pytest.raises(DepartmentSyncError, match="collision"):
        run_sync(db_session, employee_db, snapshot, apply=True)

    assert db_session.query(InventoryLocation).count() == 0


def test_run_sync_reuses_existing_dev_item_for_identical_code_and_name(
    tmp_path: Path,
    db_session,
    make_item,
) -> None:
    from app.models import InventoryLocation, Item, LocationStatusEnum
    from scripts.ops.sync_department_inventory import DepartmentSnapshot, run_sync

    existing = make_item(
        name="동일 품목",
        process_type_code="VF",
        model_symbol="3",
        serial_no=8,
    )
    db_session.add(
        InventoryLocation(
            item_id=existing.item_id,
            department="진공",
            status=LocationStatusEnum.PRODUCTION,
            quantity=0,
        )
    )
    db_session.commit()
    employee_item_id = uuid.uuid4().hex
    employee_db = tmp_path / "employee.db"
    _write_employee_db(
        employee_db,
        [
            _employee_item(
                item_id=employee_item_id,
                mes_code=existing.mes_code,
                item_name=existing.item_name,
            )
        ],
    )
    snapshot = DepartmentSnapshot(
        rows=(
            _row(
                row_number=3,
                code=existing.mes_code,
                name=existing.item_name,
                quantity=18,
            ),
        ),
        source_hashes={},
    )

    summary = run_sync(db_session, employee_db, snapshot, apply=True)

    assert summary.master_items_added == 0
    assert db_session.query(Item).filter_by(mes_code=existing.mes_code).one().item_id == existing.item_id
    assert db_session.query(Item).filter_by(item_id=employee_item_id).count() == 0
    location = db_session.query(InventoryLocation).filter_by(
        item_id=existing.item_id,
        department="진공",
        status=LocationStatusEnum.PRODUCTION,
    ).one()
    assert location.quantity == 18


def test_run_sync_adds_missing_current_employee_item_with_same_item_id(
    tmp_path: Path,
    db_session,
) -> None:
    from app.models import Inventory, InventoryLocation, Item
    from scripts.ops.sync_department_inventory import DepartmentSnapshot, run_sync

    employee_db = tmp_path / "employee.db"
    new_id = uuid.uuid4().hex
    _write_employee_db(employee_db, [_employee_item(item_id=new_id, mes_code="3-AR-0082", item_name="신규 품목")])
    snapshot = DepartmentSnapshot(
        rows=(
            _row(
                row_number=3,
                code="3-AR-0082",
                name="신규 품목",
                quantity=3,
                department="출하",
                source="finished",
            ),
        ),
        source_hashes={},
    )

    summary = run_sync(db_session, employee_db, snapshot, apply=True)

    item = db_session.query(Item).filter_by(item_id=new_id).one()
    inventory = db_session.query(Inventory).filter_by(item_id=new_id).one()
    location = db_session.query(InventoryLocation).filter_by(item_id=new_id, department="조립").one()
    assert db_session.query(InventoryLocation).filter_by(item_id=new_id, department="출하").count() == 0
    assert summary.master_items_added == 1
    assert item.item_name == "신규 품목"
    assert (int(location.quantity), int(inventory.quantity)) == (3, 3)


def test_execute_sync_is_dry_run_by_default_and_requires_confirmation_for_apply(
    tmp_path: Path,
    db_session,
    make_item,
) -> None:
    from scripts.ops.sync_department_inventory import DepartmentSnapshot, DepartmentSyncError, execute_sync

    item = make_item(name="품목", process_type_code="AR", model_symbol="3", serial_no=1)
    db_session.commit()
    dev_db = tmp_path / "dev.db"
    with sqlite3.connect(dev_db) as target:
        db_session.connection().connection.driver_connection.backup(target)
    employee_db = tmp_path / "employee.db"
    _write_employee_db(employee_db, [_employee_item(item_id=str(item.item_id), mes_code=item.mes_code, item_name=item.item_name)])
    snapshot = DepartmentSnapshot(rows=(_row(row_number=3, code=item.mes_code, name=item.item_name, quantity=8),), source_hashes={})
    backup_calls: list[str] = []
    extractor = lambda _path: snapshot
    before = dev_db.read_bytes()

    preview = execute_sync(
        source_dir=tmp_path,
        dev_db_path=dev_db,
        employee_db_path=employee_db,
        apply=False,
        confirm=None,
        backup_fn=backup_calls.append,
        extractor=extractor,
    )

    assert preview.applied is False
    assert dev_db.read_bytes() == before
    assert backup_calls == []
    with pytest.raises(DepartmentSyncError, match="SYNC-DEPARTMENT-INVENTORY"):
        execute_sync(
            source_dir=tmp_path,
            dev_db_path=dev_db,
            employee_db_path=employee_db,
            apply=True,
            confirm="WRONG",
            backup_fn=backup_calls.append,
            extractor=extractor,
        )
    assert backup_calls == []

    applied = execute_sync(
        source_dir=tmp_path,
        dev_db_path=dev_db,
        employee_db_path=employee_db,
        apply=True,
        confirm="SYNC-DEPARTMENT-INVENTORY",
        backup_fn=backup_calls.append,
        extractor=extractor,
    )

    assert applied.applied is True
    assert backup_calls == [str(dev_db.resolve())]
    with sqlite3.connect(dev_db) as connection:
        row = connection.execute(
            "SELECT quantity FROM inventory_locations WHERE item_id = ? AND department = '조립' AND status = 'PRODUCTION'",
            (item.item_id.hex,),
        ).fetchone()
    assert row == (8,)
