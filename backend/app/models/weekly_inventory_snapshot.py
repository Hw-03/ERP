"""주간보고용 완료품 재고 확정 스냅샷."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.models.base import Base, IntQuantity, UUIDString

__all__ = ["WeeklyInventorySnapshot", "WeeklyInventorySnapshotItem"]


class WeeklyInventorySnapshot(Base):
    """한 일요일 종료 시점에 확정된 활성 완료품 재고 묶음."""

    __tablename__ = "weekly_inventory_snapshots"

    snapshot_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    week_end = Column(Date, nullable=False)
    as_of_utc = Column(DateTime, nullable=False)
    captured_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
    )
    capture_source = Column(String(32), nullable=False)
    item_count = Column(Integer, nullable=False)
    total_quantity = Column(IntQuantity, nullable=False)

    items = relationship(
        "WeeklyInventorySnapshotItem",
        back_populates="snapshot",
        cascade="all, delete-orphan",
        order_by="WeeklyInventorySnapshotItem.mes_code",
    )

    __table_args__ = (
        UniqueConstraint("week_end", name="uq_weekly_inventory_snapshots_week_end"),
        CheckConstraint("item_count >= 0", name="ck_weekly_inventory_snapshots_item_count_nonneg"),
        CheckConstraint("total_quantity >= 0", name="ck_weekly_inventory_snapshots_total_nonneg"),
        Index("ix_weekly_inventory_snapshots_week_end", "week_end"),
    )


class WeeklyInventorySnapshotItem(Base):
    """품목 삭제·이름 변경과 무관하게 보존되는 스냅샷 시점의 완료품 행."""

    __tablename__ = "weekly_inventory_snapshot_items"

    snapshot_item_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    snapshot_id = Column(
        UUIDString,
        ForeignKey("weekly_inventory_snapshots.snapshot_id", ondelete="CASCADE"),
        nullable=False,
    )
    item_id = Column(UUIDString, nullable=False)
    mes_code = Column(String(40), nullable=True)
    item_name = Column(String(200), nullable=False)
    process_type_code = Column(String(2), nullable=False)
    quantity = Column(IntQuantity, nullable=False)

    snapshot = relationship("WeeklyInventorySnapshot", back_populates="items")

    __table_args__ = (
        UniqueConstraint(
            "snapshot_id",
            "item_id",
            name="uq_weekly_inventory_snapshot_items_snapshot_item",
        ),
        CheckConstraint("quantity >= 0", name="ck_weekly_inventory_snapshot_items_quantity_nonneg"),
        Index("ix_weekly_inventory_snapshot_items_snapshot", "snapshot_id"),
        Index("ix_weekly_inventory_snapshot_items_process", "process_type_code"),
    )
