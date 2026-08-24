"""주간 완료품 재고 스냅샷 서비스 계약 테스트."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from decimal import Decimal
from threading import Barrier
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy.orm import sessionmaker

from app.database import Base, _create_database_engine
from app.models import (
    DepartmentEnum,
    Inventory,
    Item,
    LocationStatusEnum,
    ProcessType,
    TransactionLog,
    TransactionTypeEnum,
    WeeklyInventorySnapshot,
)


KST = ZoneInfo("Asia/Seoul")


def _quantity_by_item(rows) -> dict[str, Decimal]:
    return {str(row.item.item_id): row.quantity for row in rows}


def test_dashboard_finished_stock_uses_location_sum_and_active_scope(
    db_session,
    make_item,
    make_location,
):
    """활성 완료품만 대상으로 대시보드와 같은 위치별 합계를 사용한다."""
    from app.services.weekly_inventory_snapshot import load_dashboard_finished_stock

    active = make_item(
        name="활성 VF 완료품",
        process_type_code="VF",
        warehouse_qty=Decimal("3"),
    )
    make_location(
        active.item_id,
        department=DepartmentEnum.VACUUM,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("4"),
    )
    make_location(
        active.item_id,
        department=DepartmentEnum.VACUUM,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=Decimal("2"),
    )
    # 레거시 합계가 틀려도 신규 기준은 대시보드 stock_math(3+4+2)를 따라야 한다.
    db_session.query(Inventory).filter(Inventory.item_id == active.item_id).one().quantity = Decimal("99")

    deleted = make_item(name="삭제 TF 완료품", process_type_code="TF", warehouse_qty=Decimal("10"))
    deleted.deleted_at = datetime(2026, 5, 1, 0, 0)
    disused = make_item(name="불용 HF 완료품", process_type_code="HF", warehouse_qty=Decimal("11"))
    disused.legacy_item_type = "불용"
    make_item(name="진행 중 VA 품목", process_type_code="VA", warehouse_qty=Decimal("12"))
    db_session.flush()

    rows = load_dashboard_finished_stock(db_session)

    assert _quantity_by_item(rows) == {str(active.item_id): Decimal("9")}


def test_weekly_snapshot_is_idempotent_and_keeps_first_values(
    db_session,
    make_item,
):
    """같은 일요일 스냅샷을 다시 요청해도 최초 확정값을 변경하지 않는다."""
    from app.models import WeeklyInventorySnapshotItem
    from app.services.weekly_inventory_snapshot import capture_weekly_inventory_snapshot

    item = make_item(
        name="SOLO VF 완료품",
        process_type_code="VF",
        warehouse_qty=Decimal("8"),
    )
    first = capture_weekly_inventory_snapshot(
        db_session,
        week_end=date(2026, 5, 3),
        captured_at=datetime(2026, 5, 3, 15, 0),
        source="scheduled",
    )
    db_session.flush()

    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    inventory.quantity = Decimal("15")
    inventory.warehouse_qty = Decimal("15")
    db_session.flush()

    second = capture_weekly_inventory_snapshot(
        db_session,
        week_end=date(2026, 5, 3),
        captured_at=datetime(2026, 5, 3, 16, 0),
        source="first_write",
    )
    db_session.flush()

    lines = (
        db_session.query(WeeklyInventorySnapshotItem)
        .filter(WeeklyInventorySnapshotItem.snapshot_id == first.snapshot_id)
        .all()
    )
    assert second.snapshot_id == first.snapshot_id
    assert first.capture_source == "scheduled"
    assert first.item_count == 1
    assert first.total_quantity == Decimal("8")
    assert [(str(line.item_id), line.quantity) for line in lines] == [
        (str(item.item_id), Decimal("8")),
    ]


def test_due_snapshot_uses_last_completed_sunday_kst(
    db_session,
    make_item,
):
    """월요일 자동 확정은 직전 일요일 23:59:59.999999 KST를 기준으로 한다."""
    from app.services.weekly_inventory_snapshot import capture_due_weekly_inventory_snapshot

    item = make_item(name="월요일 기준 완료품", process_type_code="AF", warehouse_qty=Decimal("6"))
    item.created_at = datetime(2026, 5, 1, 0, 0)
    item.updated_at = datetime(2026, 5, 1, 0, 0)
    db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one().updated_at = datetime(
        2026, 5, 3, 14, 0,
    )
    db_session.flush()

    snapshot = capture_due_weekly_inventory_snapshot(
        db_session,
        now=datetime(2026, 5, 4, 0, 1, tzinfo=KST),
        source="scheduled",
    )
    db_session.flush()

    assert snapshot is not None
    assert snapshot.week_end == date(2026, 5, 3)
    assert snapshot.as_of_utc == datetime(2026, 5, 3, 14, 59, 59, 999999)


def test_contaminated_first_boundary_is_skipped_without_backfill(
    db_session,
    make_item,
):
    """첫 기준선 전에 월요일 거래가 있었다면 과거 값을 현재 값으로 소급 확정하지 않는다."""
    from app.services.weekly_inventory_snapshot import capture_due_weekly_inventory_snapshot

    item = make_item(name="이미 변경된 완료품", process_type_code="PF", warehouse_qty=Decimal("7"))
    item.created_at = datetime(2026, 5, 1, 0, 0)
    item.updated_at = datetime(2026, 5, 1, 0, 0)
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    inventory.updated_at = datetime(2026, 5, 3, 14, 0)
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.PRODUCE,
            quantity_change=Decimal("1"),
            quantity_before=Decimal("6"),
            quantity_after=Decimal("7"),
            created_at=datetime(2026, 5, 3, 15, 0),
        )
    )
    db_session.flush()

    snapshot = capture_due_weekly_inventory_snapshot(
        db_session,
        now=datetime(2026, 5, 4, 8, 0, tzinfo=KST),
        source="first_write",
    )
    db_session.flush()

    assert snapshot is None
    assert db_session.query(WeeklyInventorySnapshot).count() == 0


def test_missing_boundary_after_activation_fails_closed(
    db_session,
    make_item,
):
    """한 번 시작된 스냅샷 연속성이 깨지면 부정확한 기준선을 새로 만들지 않는다."""
    from app.services.weekly_inventory_snapshot import (
        WeeklyInventorySnapshotGapError,
        capture_due_weekly_inventory_snapshot,
        capture_weekly_inventory_snapshot,
    )

    item = make_item(name="활성화 이후 완료품", process_type_code="TF", warehouse_qty=Decimal("5"))
    item.created_at = datetime(2026, 5, 1, 0, 0)
    item.updated_at = datetime(2026, 5, 1, 0, 0)
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    inventory.updated_at = datetime(2026, 5, 3, 14, 0)
    capture_weekly_inventory_snapshot(
        db_session,
        week_end=date(2026, 5, 3),
        captured_at=datetime(2026, 5, 3, 15, 0),
        source="scheduled",
    )
    db_session.flush()
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.PRODUCE,
            quantity_change=Decimal("1"),
            quantity_before=Decimal("5"),
            quantity_after=Decimal("6"),
            created_at=datetime(2026, 5, 10, 15, 0),
        )
    )
    db_session.flush()

    with pytest.raises(WeeklyInventorySnapshotGapError, match="2026-05-10"):
        capture_due_weekly_inventory_snapshot(
            db_session,
            now=datetime(2026, 5, 11, 8, 0, tzinfo=KST),
            source="first_write",
        )


def test_first_write_guard_commits_boundary_before_inventory_change(
    db_session,
    make_item,
):
    """쓰기 요청 가드는 재고 변경 트랜잭션보다 먼저 경계값을 독립 확정한다."""
    from app.models import WeeklyInventorySnapshotItem
    from app.services.weekly_inventory_snapshot import ensure_due_snapshot_committed

    item = make_item(name="첫 쓰기 보호 완료품", process_type_code="NF", warehouse_qty=Decimal("8"))
    item.created_at = datetime(2026, 5, 1, 0, 0)
    item.updated_at = datetime(2026, 5, 1, 0, 0)
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    inventory.updated_at = datetime(2026, 5, 3, 14, 0)
    db_session.flush()

    snapshot = ensure_due_snapshot_committed(
        db_session,
        now=datetime(2026, 5, 4, 0, 1, tzinfo=KST),
        source="first_write",
    )

    assert snapshot is not None
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    inventory.quantity = Decimal("9")
    inventory.warehouse_qty = Decimal("9")
    db_session.commit()

    line = (
        db_session.query(WeeklyInventorySnapshotItem)
        .filter(WeeklyInventorySnapshotItem.snapshot_id == snapshot.snapshot_id)
        .one()
    )
    assert line.quantity == Decimal("8")
    assert inventory.quantity == Decimal("9")


def test_existing_snapshot_guard_finishes_its_lock_transaction(monkeypatch):
    """이미 확정된 주차도 확인용 잠금 트랜잭션을 요청 처리 전에 끝낸다."""
    from app.services import weekly_inventory_snapshot as service

    db = MagicMock()
    snapshot = MagicMock()
    db.new = set()
    monkeypatch.setattr(
        service,
        "capture_due_weekly_inventory_snapshot",
        lambda _db, *, now, source: snapshot,
    )

    result = service.ensure_due_snapshot_committed(
        db,
        now=datetime(2026, 5, 4, 0, 1, tzinfo=KST),
        source="first_write",
    )

    assert result is snapshot
    db.commit.assert_called_once_with()
    db.refresh.assert_called_once_with(snapshot)


def test_concurrent_first_writes_create_one_snapshot(tmp_path):
    """동시에 들어온 첫 쓰기 요청도 주차별 헤더와 품목 행을 한 번만 만든다."""
    from app.models import WeeklyInventorySnapshotItem
    from app.services.weekly_inventory_snapshot import ensure_due_snapshot_committed

    db_url = f"sqlite:///{(tmp_path / 'weekly-concurrency.db').as_posix()}"
    engine = _create_database_engine(db_url)
    session_factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(engine)
    try:
        with session_factory() as db:
            db.add(ProcessType(code="VF", prefix="V", suffix="F", stage_order=45))
            item = Item(
                item_name="동시 확정 VF",
                process_type_code="VF",
                unit="EA",
                model_symbol="6",
                serial_no=1,
                created_at=datetime(2026, 5, 1, 0, 0),
                updated_at=datetime(2026, 5, 1, 0, 0),
            )
            db.add(item)
            db.flush()
            db.add(
                Inventory(
                    item_id=item.item_id,
                    quantity=Decimal("8"),
                    warehouse_qty=Decimal("8"),
                    pending_quantity=Decimal("0"),
                    updated_at=datetime(2026, 5, 3, 14, 0),
                )
            )
            db.commit()

        barrier = Barrier(2)

        def capture() -> str:
            with session_factory() as db:
                barrier.wait()
                snapshot = ensure_due_snapshot_committed(
                    db,
                    now=datetime(2026, 5, 4, 0, 1, tzinfo=KST),
                    source="first_write",
                )
                assert snapshot is not None
                return str(snapshot.snapshot_id)

        with ThreadPoolExecutor(max_workers=2) as pool:
            snapshot_ids = list(pool.map(lambda _index: capture(), range(2)))

        with session_factory() as db:
            assert db.query(WeeklyInventorySnapshot).count() == 1
            assert db.query(WeeklyInventorySnapshotItem).count() == 1
        assert len(set(snapshot_ids)) == 1
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()
