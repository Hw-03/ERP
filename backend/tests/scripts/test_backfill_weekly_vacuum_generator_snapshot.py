"""발생부 진공 품목 주간 스냅샷 백필의 안전 계약 테스트."""

from __future__ import annotations

import importlib.util
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session


ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = ROOT / "_attic" / "backend-scripts" / "backfill_weekly_vacuum_generator_snapshot.py"
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
        "backfill_weekly_vacuum_generator_snapshot",
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
        db.add_all(
            [
                ProcessType(code="VA", prefix="V", suffix="A", stage_order=40),
                ProcessType(code="VF", prefix="V", suffix="F", stage_order=45),
            ]
        )
        db.flush()

        existing = Item(
            item_name="기존 진공 완료품",
            process_type_code="VF",
            unit="EA",
            model_symbol="3",
            serial_no=1,
            created_at=datetime(2026, 8, 1),
            updated_at=datetime(2026, 8, 1),
        )
        target = Item(
            item_name="발생부 (10P) (진공) [ADX6000]",
            process_type_code="VA",
            unit="EA",
            model_symbol="6",
            serial_no=2,
            created_at=datetime(2026, 8, 1),
            updated_at=datetime(2026, 8, 1),
        )
        unrelated = Item(
            item_name="신주 케이스 작업완료 [DX3000]",
            process_type_code="VA",
            unit="EA",
            model_symbol="3",
            serial_no=3,
            created_at=datetime(2026, 8, 1),
            updated_at=datetime(2026, 8, 1),
        )
        db.add_all([existing, target, unrelated])
        db.flush()
        db.add_all(
            [
                Inventory(item_id=existing.item_id, quantity=10, warehouse_qty=10),
                Inventory(item_id=target.item_id, quantity=14, warehouse_qty=5),
                Inventory(item_id=unrelated.item_id, quantity=99, warehouse_qty=99),
                InventoryLocation(
                    item_id=target.item_id,
                    department="진공",
                    status=LocationStatusEnum.PRODUCTION,
                    quantity=7,
                ),
                InventoryLocation(
                    item_id=target.item_id,
                    department="진공",
                    status=LocationStatusEnum.DEFECTIVE,
                    quantity=2,
                ),
            ]
        )
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
                process_type_code="VF",
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
                    {
                        "scope": "location",
                        "department": "진공",
                        "status": "PRODUCTION",
                        "delta": 3,
                    },
                    {
                        "scope": "location",
                        "department": "진공",
                        "status": "DEFECTIVE",
                        "delta": 1,
                    },
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
            snapshot = (
                db.query(WeeklyInventorySnapshot)
                .filter(WeeklyInventorySnapshot.week_end == WEEK_END)
                .one()
            )
            db.expunge(snapshot)
            rows = (
                db.query(WeeklyInventorySnapshotItem)
                .filter(WeeklyInventorySnapshotItem.snapshot_id == snapshot.snapshot_id)
                .order_by(WeeklyInventorySnapshotItem.mes_code)
                .all()
            )
            for row in rows:
                db.expunge(row)
            return snapshot, rows
    finally:
        engine.dispose()


def test_preview_reconstructs_boundary_without_mutating_or_backing_up(snapshot_db: Path) -> None:
    module = _load_module()
    backups: list[Path] = []

    report = module.backfill_snapshot(
        snapshot_db,
        week_end=WEEK_END,
        apply=False,
        backup_fn=lambda *_args, **_kwargs: backups.append(snapshot_db),
    )

    assert report.applied is False
    assert report.backup_path is None
    assert backups == []
    assert [(row.mes_code, row.quantity, row.normal_quantity, row.defective_quantity) for row in report.rows] == [
        ("6-VA-0002", Decimal("12"), Decimal("11"), Decimal("1")),
    ]
    snapshot, rows = _read_snapshot(snapshot_db)
    assert snapshot.item_count == 1
    assert [row.item_name for row in rows] == ["기존 진공 완료품"]


def test_preview_rejects_missing_database_without_creating_it(tmp_path: Path) -> None:
    module = _load_module()
    missing = tmp_path / "missing.db"

    with pytest.raises(module.BackfillSafetyError, match="database file"):
        module.backfill_snapshot(missing, week_end=WEEK_END, apply=False)

    assert missing.exists() is False


def test_apply_backs_up_then_adds_only_missing_rows_and_is_idempotent(snapshot_db: Path, tmp_path: Path) -> None:
    module = _load_module()
    backup_path = tmp_path / "verified-backup.db"
    backup_calls: list[tuple[Path, str]] = []

    def backup(source: str, *, label: str) -> Path:
        source_path = Path(source)
        backup_calls.append((source_path, label))
        backup_path.write_bytes(source_path.read_bytes())
        backed_up_snapshot, backed_up_rows = _read_snapshot(backup_path)
        assert backed_up_snapshot.item_count == 1
        assert [row.item_name for row in backed_up_rows] == ["기존 진공 완료품"]
        return backup_path

    first = module.backfill_snapshot(
        snapshot_db,
        week_end=WEEK_END,
        apply=True,
        backup_fn=backup,
    )
    second = module.backfill_snapshot(
        snapshot_db,
        week_end=WEEK_END,
        apply=True,
        backup_fn=backup,
    )

    assert first.applied is True
    assert first.backup_path == backup_path
    assert second.applied is False
    assert second.backup_path is None
    assert backup_calls == [(snapshot_db.resolve(), "weekly-vacuum-generator-snapshot")]

    snapshot, rows = _read_snapshot(snapshot_db)
    assert snapshot.item_count == 2
    assert snapshot.total_quantity == Decimal("22")
    assert snapshot.normal_total_quantity == Decimal("21")
    assert snapshot.defective_total_quantity == Decimal("1")
    assert [(row.item_name, row.quantity) for row in rows] == [
        ("기존 진공 완료품", Decimal("10")),
        ("발생부 (10P) (진공) [ADX6000]", Decimal("12")),
    ]


@pytest.mark.parametrize("basis_version", [1, 2])
def test_backfill_rejects_unverified_snapshot_basis(snapshot_db: Path, basis_version: int) -> None:
    module = _load_module()
    engine = create_engine(f"sqlite:///{snapshot_db.as_posix()}")
    with Session(engine) as db:
        snapshot = db.query(WeeklyInventorySnapshot).filter_by(week_end=WEEK_END).one()
        snapshot.basis_version = basis_version
        if basis_version == 2:
            existing = (
                db.query(WeeklyInventorySnapshotItem)
                .filter(WeeklyInventorySnapshotItem.snapshot_id == snapshot.snapshot_id)
                .one()
            )
            existing.normal_quantity = None
        db.commit()
    engine.dispose()

    with pytest.raises(module.BackfillSafetyError, match="verified v2"):
        module.backfill_snapshot(snapshot_db, week_end=WEEK_END, apply=False)


def test_backfill_rejects_missing_inventory_effect(snapshot_db: Path) -> None:
    module = _load_module()
    engine = create_engine(f"sqlite:///{snapshot_db.as_posix()}")
    with Session(engine) as db:
        target = db.query(Item).filter(Item.item_name.like("발생부%")).one()
        db.add(
            TransactionLog(
                item_id=target.item_id,
                transaction_type=TransactionTypeEnum.RECEIVE,
                quantity_change=1,
                inventory_effect=None,
                created_at=datetime(2026, 9, 7, 0, 2),
            )
        )
        db.commit()
    engine.dispose()

    with pytest.raises(module.BackfillSafetyError, match="inventory_effect"):
        module.backfill_snapshot(snapshot_db, week_end=WEEK_END, apply=False)


def test_backfill_ignores_directly_cancelled_legacy_log(snapshot_db: Path) -> None:
    module = _load_module()
    engine = create_engine(f"sqlite:///{snapshot_db.as_posix()}")
    with Session(engine) as db:
        target = db.query(Item).filter(Item.item_name.like("발생부%")).one()
        db.add(
            TransactionLog(
                item_id=target.item_id,
                transaction_type=TransactionTypeEnum.SHIP,
                quantity_change=-4,
                inventory_effect=[{"scope": "warehouse", "delta": -4}],
                cancelled=True,
                created_at=datetime(2026, 9, 7, 0, 2),
            )
        )
        db.commit()
    engine.dispose()

    report = module.backfill_snapshot(snapshot_db, week_end=WEEK_END, apply=False)

    assert [(row.quantity, row.normal_quantity, row.defective_quantity) for row in report.rows] == [
        (Decimal("12"), Decimal("11"), Decimal("1")),
    ]


def test_backfill_rejects_item_metadata_changed_after_cutoff(snapshot_db: Path) -> None:
    module = _load_module()
    engine = create_engine(f"sqlite:///{snapshot_db.as_posix()}")
    with Session(engine) as db:
        target = db.query(Item).filter(Item.item_name.like("발생부%")).one()
        target.updated_at = datetime(2026, 9, 7, 0, 3)
        db.commit()
    engine.dispose()

    with pytest.raises(module.BackfillSafetyError, match="metadata"):
        module.backfill_snapshot(snapshot_db, week_end=WEEK_END, apply=False)


def test_backfill_rejects_changed_item_that_no_longer_matches_target(snapshot_db: Path) -> None:
    module = _load_module()
    engine = create_engine(f"sqlite:///{snapshot_db.as_posix()}")
    with Session(engine) as db:
        target = db.query(Item).filter(Item.item_name.like("발생부%"), Item.process_type_code == "VA").one()
        target.item_name = "신주 케이스 작업완료 [ADX6000]"
        target.updated_at = datetime(2026, 9, 7, 0, 3)
        db.commit()
    engine.dispose()

    with pytest.raises(module.BackfillSafetyError, match="metadata"):
        module.backfill_snapshot(snapshot_db, week_end=WEEK_END, apply=False)


def test_backfill_excludes_disused_target(snapshot_db: Path) -> None:
    module = _load_module()
    engine = create_engine(f"sqlite:///{snapshot_db.as_posix()}")
    with Session(engine) as db:
        target = db.query(Item).filter(Item.item_name.like("발생부%"), Item.process_type_code == "VA").one()
        db.execute(
            text(
                "UPDATE items SET legacy_item_type = :item_type, updated_at = :updated_at "
                "WHERE item_id = :item_id"
            ),
            {
                "item_type": "불용",
                "updated_at": datetime(2026, 8, 1),
                "item_id": target.item_id.hex,
            },
        )
        db.commit()
    engine.dispose()

    report = module.backfill_snapshot(snapshot_db, week_end=WEEK_END, apply=False)

    assert report.rows == ()


def test_backfill_rejects_target_deleted_after_cutoff(snapshot_db: Path) -> None:
    module = _load_module()
    engine = create_engine(f"sqlite:///{snapshot_db.as_posix()}")
    with Session(engine) as db:
        target = db.query(Item).filter(Item.item_name.like("발생부%")).one()
        target.deleted_at = datetime(2026, 9, 7, 0, 3)
        db.commit()
    engine.dispose()

    with pytest.raises(module.BackfillSafetyError, match="metadata"):
        module.backfill_snapshot(snapshot_db, week_end=WEEK_END, apply=False)


def test_backfill_rejects_negative_reconstructed_stock(snapshot_db: Path) -> None:
    module = _load_module()
    engine = create_engine(f"sqlite:///{snapshot_db.as_posix()}")
    with Session(engine) as db:
        target = db.query(Item).filter(Item.item_name.like("발생부%")).one()
        db.add(
            TransactionLog(
                item_id=target.item_id,
                transaction_type=TransactionTypeEnum.ADJUST,
                quantity_change=100,
                inventory_effect=[{"scope": "warehouse", "delta": 100}],
                created_at=datetime(2026, 9, 7, 0, 2),
            )
        )
        db.commit()
    engine.dispose()

    with pytest.raises(module.BackfillSafetyError, match="negative"):
        module.backfill_snapshot(snapshot_db, week_end=WEEK_END, apply=False)
