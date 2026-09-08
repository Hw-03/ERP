"""세라믹튜브 하우징 주간 스냅샷 백필의 안전 계약 테스트."""

from __future__ import annotations

import importlib.util
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session


ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = ROOT / "_attic" / "backend-scripts" / "backfill_weekly_high_voltage_tube_housing_snapshot.py"
if str(ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(ROOT / "backend"))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.models import (  # noqa: E402
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    ProcessType,
    TransactionLog,
    TransactionTypeEnum,
    WeeklyInventorySnapshot,
    WeeklyInventorySnapshotItem,
)
from app.models.base import Base  # noqa: E402


WEEK_END = date(2026, 9, 6)
CUTOFF = datetime(2026, 9, 6, 14, 59, 59, 999999)


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "backfill_weekly_high_voltage_tube_housing_snapshot",
        SCRIPT_PATH,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def snapshot_db(tmp_path: Path) -> Path:
    path = tmp_path / "mes.db"
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([
            ProcessType(code="HA", prefix="H", suffix="A", stage_order=30),
            ProcessType(code="HF", prefix="H", suffix="F", stage_order=35),
        ])
        db.flush()
        existing = Item(
            item_name="기존 고압 완료품",
            process_type_code="HF",
            unit="EA",
            model_symbol="8",
            serial_no=1,
            created_at=datetime(2026, 8, 1),
            updated_at=datetime(2026, 8, 1),
        )
        target = Item(
            item_name="세라믹튜브 70KV 하우징 [DXDR-070] [DX3000, ADX4000W, ADX6000, SOLO]",
            process_type_code="HA",
            unit="EA",
            model_symbol="3468",
            serial_no=6,
            created_at=datetime(2026, 8, 1),
            updated_at=datetime(2026, 8, 1),
        )
        unrelated = Item(
            item_name="다른 고압 중간품",
            process_type_code="HA",
            unit="EA",
            model_symbol="3468",
            serial_no=7,
            created_at=datetime(2026, 8, 1),
            updated_at=datetime(2026, 8, 1),
        )
        db.add_all([existing, target, unrelated])
        db.flush()
        db.add_all([
            Inventory(item_id=existing.item_id, quantity=10, warehouse_qty=10),
            Inventory(item_id=target.item_id, quantity=14, warehouse_qty=5),
            Inventory(item_id=unrelated.item_id, quantity=99, warehouse_qty=99),
            InventoryLocation(
                item_id=target.item_id,
                department="고압",
                status=LocationStatusEnum.PRODUCTION,
                quantity=7,
            ),
            InventoryLocation(
                item_id=target.item_id,
                department="고압",
                status=LocationStatusEnum.DEFECTIVE,
                quantity=2,
            ),
        ])
        snapshot = WeeklyInventorySnapshot(
            week_end=WEEK_END,
            as_of_utc=CUTOFF,
            captured_at=datetime(2026, 9, 6, 15, 0, 3),
            capture_source="scheduled",
            basis_version=2,
            item_count=1,
            total_quantity=10,
            normal_total_quantity=10,
            defective_total_quantity=0,
        )
        snapshot.items = [
            WeeklyInventorySnapshotItem(
                item_id=existing.item_id,
                mes_code=existing.mes_code,
                item_name=existing.item_name,
                process_type_code="HF",
                quantity=10,
                normal_quantity=10,
                defective_quantity=0,
            )
        ]
        db.add(snapshot)
        db.add(
            TransactionLog(
                item_id=target.item_id,
                transaction_type=TransactionTypeEnum.ADJUST,
                quantity_change=2,
                inventory_effect=[
                    {"scope": "warehouse", "delta": -2},
                    {"scope": "location", "department": "고압", "status": "PRODUCTION", "delta": 3},
                    {"scope": "location", "department": "고압", "status": "DEFECTIVE", "delta": 1},
                ],
                created_at=datetime(2026, 9, 7, 0, 1),
            )
        )
        db.commit()
    engine.dispose()
    return path


def _read_snapshot(path: Path) -> tuple[WeeklyInventorySnapshot, list[WeeklyInventorySnapshotItem]]:
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    try:
        with Session(engine) as db:
            snapshot = db.query(WeeklyInventorySnapshot).filter_by(week_end=WEEK_END).one()
            db.expunge(snapshot)
            rows = (
                db.query(WeeklyInventorySnapshotItem)
                .filter_by(snapshot_id=snapshot.snapshot_id)
                .order_by(WeeklyInventorySnapshotItem.mes_code)
                .all()
            )
            for row in rows:
                db.expunge(row)
            return snapshot, rows
    finally:
        engine.dispose()


def test_preview_reconstructs_only_ceramic_tube_housing_without_mutating(snapshot_db: Path) -> None:
    module = _load_module()

    report = module.backfill_snapshot(snapshot_db, week_end=WEEK_END, apply=False)

    assert report.applied is False
    assert report.backup_path is None
    assert [(row.mes_code, row.quantity, row.normal_quantity, row.defective_quantity) for row in report.rows] == [
        ("3468-HA-0006", Decimal("12"), Decimal("11"), Decimal("1")),
    ]
    snapshot, rows = _read_snapshot(snapshot_db)
    assert snapshot.item_count == 1
    assert [row.item_name for row in rows] == ["기존 고압 완료품"]


def test_apply_backs_up_then_adds_only_target_once(snapshot_db: Path, tmp_path: Path) -> None:
    module = _load_module()
    backup_path = tmp_path / "verified-backup.db"
    backup_calls: list[tuple[Path, str]] = []

    def backup(source: str, *, label: str) -> Path:
        source_path = Path(source)
        backup_calls.append((source_path, label))
        backup_path.write_bytes(source_path.read_bytes())
        return backup_path

    first = module.backfill_snapshot(snapshot_db, week_end=WEEK_END, apply=True, backup_fn=backup)
    second = module.backfill_snapshot(snapshot_db, week_end=WEEK_END, apply=True, backup_fn=backup)

    assert first.applied is True
    assert second.applied is False
    assert backup_calls == [(snapshot_db.resolve(), "weekly-high-voltage-tube-housing-snapshot")]
    snapshot, rows = _read_snapshot(snapshot_db)
    assert (snapshot.item_count, snapshot.total_quantity, snapshot.normal_total_quantity, snapshot.defective_total_quantity) == (
        2,
        Decimal("22"),
        Decimal("21"),
        Decimal("1"),
    )
    assert [row.mes_code for row in rows] == ["3468-HA-0006", "8-HF-0001"]
