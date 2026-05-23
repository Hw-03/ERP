"""품목·BOM·품목-모델 매핑 도메인."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base

__all__ = [
    "Item",
    "BOM",
    "ItemModel",
]


class Item(Base):
    __tablename__ = "items"

    item_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_name = Column(String(200), nullable=False)
    sort_order = Column(Integer, nullable=True, index=True)  # 엑셀 정리본 행 순서
    unit = Column(String(20), nullable=False, default="EA")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    # Legacy UI display fields (populated from ERP_Master_DB.csv or rule-based defaults)

    legacy_part = Column(String(50), nullable=True, index=True)       # 자재창고/조립출하/고압파트/진공파트/튜닝파트/출하
    legacy_item_type = Column(String(50), nullable=True)              # part_type from CSV
    supplier = Column(String(200), nullable=True)
    min_stock = Column(Numeric(15, 4), nullable=True)

    # 4-part item code ([모델기호조합]-[구분코드]-[일련번호]-[옵션코드])
    item_code = Column(String(40), nullable=True, unique=True, index=True)
    model_symbol = Column(String(20), nullable=True, index=True)  # 예: "346", "3", "34678"
    process_type_code = Column(String(2), ForeignKey("process_types.code"), nullable=True, index=True)
    option_code = Column(String(10), nullable=True)  # 자유 텍스트 (FK 제거)
    serial_no = Column(Integer, nullable=True)

    # BOM 완료 워크플로우 — 사용자가 명시적으로 "완료로 표시"를 누를 때만 set/clear
    bom_completed_at = Column(DateTime, nullable=True)

    inventory = relationship("Inventory", back_populates="item", uselist=False, cascade="all, delete-orphan")
    bom_as_parent = relationship(
        "BOM",
        foreign_keys="BOM.parent_item_id",
        back_populates="parent_item",
        cascade="all, delete-orphan",
    )
    bom_as_child = relationship("BOM", foreign_keys="BOM.child_item_id", back_populates="child_item")
    transaction_logs = relationship(
        "TransactionLog",
        back_populates="item",
        cascade="all, delete-orphan",
    )


class BOM(Base):
    __tablename__ = "bom"

    bom_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_item_id = Column(UUID(as_uuid=True), ForeignKey("items.item_id", ondelete="CASCADE"), nullable=False, index=True)
    child_item_id = Column(UUID(as_uuid=True), ForeignKey("items.item_id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(Numeric(15, 4), nullable=False)
    unit = Column(String(20), nullable=False, default="EA")
    notes = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("parent_item_id", "child_item_id", name="uq_bom_parent_child"),
        Index("ix_bom_parent", "parent_item_id"),
        Index("ix_bom_child", "child_item_id"),
    )

    parent_item = relationship("Item", foreign_keys=[parent_item_id], back_populates="bom_as_parent")
    child_item = relationship("Item", foreign_keys=[child_item_id], back_populates="bom_as_child")


class ItemModel(Base):
    """품목-제품 다대다 연결 테이블. 품목이 어떤 제품에 사용되는지 기록."""
    __tablename__ = "item_models"

    item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("items.item_id", ondelete="CASCADE"),
        primary_key=True,
    )
    slot = Column(SmallInteger, ForeignKey("product_symbols.slot"), primary_key=True)
