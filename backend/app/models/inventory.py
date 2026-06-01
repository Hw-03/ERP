"""재고 / 부서×상태별 위치 재고."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, IntQuantity

__all__ = [
    "LocationStatusEnum",
    "Inventory",
    "InventoryLocation",
]


class LocationStatusEnum(str, enum.Enum):
    PRODUCTION = "PRODUCTION"
    DEFECTIVE = "DEFECTIVE"


class Inventory(Base):
    __tablename__ = "inventory"

    inventory_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("items.item_id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    # quantity = warehouse_qty + Σ(InventoryLocation.quantity). 서비스 레이어가 동기화 보장.
    quantity = Column(IntQuantity, nullable=False, default=0)
    # 창고 보관량. 가용 재고 계산에 포함.
    warehouse_qty = Column(IntQuantity, nullable=False, default=0)
    # 큐 배치 예약분 (warehouse_qty 대비). Available = warehouse + production_total − pending.
    pending_quantity = Column(IntQuantity, nullable=False, default=0)
    last_reserver_employee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("employees.employee_id", ondelete="SET NULL"),
        nullable=True,
    )
    last_reserver_name = Column(String(100), nullable=True)
    location = Column(String(100), nullable=True)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    item = relationship("Item", back_populates="inventory")

    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_inventory_quantity_nonneg"),
        CheckConstraint("warehouse_qty >= 0", name="ck_inventory_warehouse_nonneg"),
        CheckConstraint("pending_quantity >= 0", name="ck_inventory_pending_nonneg"),
        # pending 은 창고 예약분이므로 창고 보관량을 넘을 수 없다.
        CheckConstraint(
            "warehouse_qty >= pending_quantity",
            name="ck_inventory_pending_le_warehouse",
        ),
    )


class InventoryLocation(Base):
    """부서×상태(생산/불량) 단위 재고 분포. (item_id, department, status)당 1행.

    Inventory와는 item_id로 매칭되며 직접 쿼리로 접근한다 (관계 매핑 없음)."""
    __tablename__ = "inventory_locations"

    location_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("items.item_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    department = Column(String(50), nullable=False, index=True)
    status = Column(
        SAEnum(LocationStatusEnum, name="location_status_enum", create_type=True),
        nullable=False,
        index=True,
    )
    quantity = Column(IntQuantity, nullable=False, default=0)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )
    defective_at = Column(DateTime, nullable=True, index=True)

    __table_args__ = (
        # 5.5-A: 음수 위치 재고 방지. 서비스 레이어에서 막지만 DB-level 안전망.
        CheckConstraint("quantity >= 0", name="ck_invloc_quantity_nonneg"),
        UniqueConstraint("item_id", "department", "status", name="uq_invloc_item_dept_status"),
        Index("ix_invloc_item", "item_id"),
        Index("ix_invloc_dept", "department"),
    )
