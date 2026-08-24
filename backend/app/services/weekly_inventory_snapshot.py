"""활성 완료품의 주말 재고를 대시보드 계산 기준으로 확정한다."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from app.models import (
    Inventory,
    InventoryLocation,
    Item,
    TransactionLog,
    WeeklyInventorySnapshot,
    WeeklyInventorySnapshotItem,
)
from app.services import stock_math


KST = ZoneInfo("Asia/Seoul")
FINISHED_PROCESS_CODES: tuple[str, ...] = ("TF", "HF", "VF", "NF", "AF", "PF")
DISUSED_ITEM_TYPE = "불용"


class WeeklyInventorySnapshotGapError(RuntimeError):
    """정확한 경계를 복구할 수 없어 신규 스냅샷을 만들 수 없을 때 발생한다."""


@dataclass(frozen=True)
class DashboardFinishedStock:
    """대시보드와 같은 방식으로 계산한 활성 완료품 한 건."""

    item: Item
    quantity: Decimal


def load_dashboard_finished_stock(db: Session) -> list[DashboardFinishedStock]:
    """삭제·불용을 제외한 완료품을 조회하고 위치별 재고 합계를 계산한다."""

    items = (
        db.query(Item)
        .filter(
            Item.deleted_at.is_(None),
            Item.process_type_code.in_(FINISHED_PROCESS_CODES),
            or_(Item.legacy_item_type.is_(None), Item.legacy_item_type != DISUSED_ITEM_TYPE),
        )
        .order_by(Item.mes_code)
        .all()
    )
    figures = stock_math.bulk_compute(db, [item.item_id for item in items])
    return [
        DashboardFinishedStock(
            item=item,
            quantity=figures.get(item.item_id, stock_math.StockFigures()).total,
        )
        for item in items
    ]


def sunday_cutoff_utc(week_end: date) -> datetime:
    """일요일 23:59:59.999999 KST를 DB의 naive UTC 시각으로 변환한다."""

    local_cutoff = datetime.combine(week_end, time.max, tzinfo=KST)
    return local_cutoff.astimezone(UTC).replace(tzinfo=None)


def latest_completed_sunday(now: datetime) -> date:
    """주어진 시각보다 앞서 완전히 종료된 가장 최근 일요일을 반환한다."""

    localized = now.replace(tzinfo=KST) if now.tzinfo is None else now.astimezone(KST)
    days_since_sunday = (localized.weekday() + 1) % 7
    if days_since_sunday == 0:
        days_since_sunday = 7
    return localized.date() - timedelta(days=days_since_sunday)


def _latest_snapshot(db: Session) -> WeeklyInventorySnapshot | None:
    return (
        db.query(WeeklyInventorySnapshot)
        .order_by(WeeklyInventorySnapshot.week_end.desc())
        .first()
    )


def _has_changes_after_cutoff(db: Session, cutoff_utc: datetime) -> bool:
    """경계 뒤의 거래·재고·품목 변경 흔적이 하나라도 있는지 보수적으로 확인한다."""

    checks = (
        db.query(func.max(TransactionLog.created_at)).scalar(),
        db.query(func.max(Inventory.updated_at)).scalar(),
        db.query(func.max(InventoryLocation.updated_at)).scalar(),
        db.query(func.max(Item.created_at)).scalar(),
        db.query(func.max(Item.updated_at)).scalar(),
        db.query(func.max(Item.deleted_at)).scalar(),
    )
    return any(timestamp is not None and timestamp > cutoff_utc for timestamp in checks)


def _lock_snapshot_boundary(db: Session, week_end: date) -> None:
    """동시 최초 요청이 같은 주차를 중복 확정하지 않도록 트랜잭션 잠금을 잡는다."""

    if db.get_bind().dialect.name == "postgresql":
        lock_key = 2_026_000_000 + week_end.toordinal()
        db.execute(text("SELECT pg_advisory_xact_lock(:lock_key)"), {"lock_key": lock_key})


def _pending_snapshot(db: Session, week_end: date) -> WeeklyInventorySnapshot | None:
    for obj in db.new:
        if isinstance(obj, WeeklyInventorySnapshot) and obj.week_end == week_end:
            return obj
    return None


def capture_weekly_inventory_snapshot(
    db: Session,
    *,
    week_end: date,
    captured_at: datetime,
    source: str,
) -> WeeklyInventorySnapshot:
    """해당 일요일의 최초 확정값만 저장하고 이후 호출은 기존 값을 반환한다."""

    existing = _pending_snapshot(db, week_end) or (
        db.query(WeeklyInventorySnapshot)
        .filter(WeeklyInventorySnapshot.week_end == week_end)
        .one_or_none()
    )
    if existing is not None:
        return existing

    rows = load_dashboard_finished_stock(db)
    snapshot = WeeklyInventorySnapshot(
        week_end=week_end,
        as_of_utc=sunday_cutoff_utc(week_end),
        captured_at=captured_at,
        capture_source=source,
        item_count=len(rows),
        total_quantity=sum((row.quantity for row in rows), Decimal("0")),
    )
    snapshot.items = [
        WeeklyInventorySnapshotItem(
            item_id=row.item.item_id,
            mes_code=row.item.mes_code,
            item_name=row.item.item_name,
            process_type_code=row.item.process_type_code,
            quantity=row.quantity,
        )
        for row in rows
    ]
    db.add(snapshot)
    return snapshot


def capture_due_weekly_inventory_snapshot(
    db: Session,
    *,
    now: datetime,
    source: str,
) -> WeeklyInventorySnapshot | None:
    """최근 종료 일요일을 안전할 때만 확정하고 기존 연속성이 깨지면 실패한다."""

    week_end = latest_completed_sunday(now)
    _lock_snapshot_boundary(db, week_end)
    existing = _pending_snapshot(db, week_end) or (
        db.query(WeeklyInventorySnapshot)
        .filter(WeeklyInventorySnapshot.week_end == week_end)
        .one_or_none()
    )
    if existing is not None:
        return existing

    latest = _latest_snapshot(db)
    expected_previous = week_end - timedelta(days=7)
    if latest is not None and latest.week_end != expected_previous:
        raise WeeklyInventorySnapshotGapError(
            f"주간 재고 스냅샷 경계가 누락되었습니다: {week_end.isoformat()}"
        )

    cutoff_utc = sunday_cutoff_utc(week_end)
    if _has_changes_after_cutoff(db, cutoff_utc):
        if latest is None:
            return None
        raise WeeklyInventorySnapshotGapError(
            f"주간 재고 스냅샷 경계 이후 변경이 감지되었습니다: {week_end.isoformat()}"
        )

    captured_at = now.astimezone(UTC).replace(tzinfo=None) if now.tzinfo else now
    return capture_weekly_inventory_snapshot(
        db,
        week_end=week_end,
        captured_at=captured_at,
        source=source,
    )


def ensure_due_snapshot_committed(
    db: Session,
    *,
    source: str,
    now: datetime | None = None,
) -> WeeklyInventorySnapshot | None:
    """쓰기 요청과 분리된 트랜잭션에서 필요한 경계 스냅샷을 먼저 확정한다."""

    resolved_now = now or datetime.now(KST)
    try:
        snapshot = capture_due_weekly_inventory_snapshot(
            db,
            now=resolved_now,
            source=source,
        )
        from app.services.realtime import suppress_realtime_revision

        with suppress_realtime_revision(db):
            db.commit()
        if snapshot is not None:
            db.refresh(snapshot)
        return snapshot
    except Exception:
        db.rollback()
        raise
