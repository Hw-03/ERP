"""
ERP System — Database Models
SQLAlchemy ORM models — SQLite(로컬) / PostgreSQL(운영) 겸용

제조 공정 흐름:
RM → TA → TF → HA → HF → VA → VF → BA → BF → FG
UK: 미분류 안전망
"""

import uuid
import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Column, String, Text, Numeric, DateTime, ForeignKey, CHAR,
    Enum as SAEnum, UniqueConstraint, Index, func, TypeDecorator
)
from sqlalchemy.orm import relationship

from app.database import Base


# ---------------------------------------------------------------------------
# Cross-DB UUID Type  (PostgreSQL: native UUID / SQLite: CHAR(36) 문자열)
# ---------------------------------------------------------------------------

class GUID(TypeDecorator):
    """
    SQLite와 PostgreSQL 모두에서 동작하는 UUID 컬럼 타입.
    - PostgreSQL: 네이티브 UUID 컬럼 사용
    - SQLite: CHAR(36) 문자열로 저장
    """
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import UUID
            return dialect.type_descriptor(UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return str(value) if not isinstance(value, uuid.UUID) else str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class CategoryEnum(str, enum.Enum):
    """11단계 제조 공정 카테고리"""
    RM = "RM"   # Raw Material        원자재
    TA = "TA"   # Tube Ass'y          튜브 조립 반제품
    TF = "TF"   # Tube Final          완성된 튜브
    HA = "HA"   # High-voltage Ass'y  고압 반제품
    HF = "HF"   # High-voltage Final  고압 완제품
    VA = "VA"   # Vacuum Ass'y        진공 반제품
    VF = "VF"   # Vacuum Final        진공 완제품
    BA = "BA"   # Body Ass'y          조립 반제품
    BF = "BF"   # Body Final          조립 완제품
    FG = "FG"   # Finished Good       최종 출하 완제품
    UK = "UK"   # Unknown             미분류/확인 필요


class TransactionTypeEnum(str, enum.Enum):
    """재고 트랜잭션 유형"""
    RECEIVE   = "RECEIVE"
    PRODUCE   = "PRODUCE"
    SHIP      = "SHIP"
    ADJUST    = "ADJUST"
    BACKFLUSH = "BACKFLUSH"


# SQLAlchemy Enum — create_type=False + native_enum=False 로 SQLite 호환
_category_enum = SAEnum(
    CategoryEnum,
    name="category_enum",
    create_type=False,   # PostgreSQL CREATE TYPE 구문 생략
    native_enum=False,   # VARCHAR 기반으로 저장 (SQLite 호환)
)

_tx_type_enum = SAEnum(
    TransactionTypeEnum,
    name="transaction_type_enum",
    create_type=False,
    native_enum=False,
)


# ---------------------------------------------------------------------------
# Item — 품목 마스터
# ---------------------------------------------------------------------------

class Item(Base):
    __tablename__ = "items"

    item_id = Column(
        GUID(),
        primary_key=True,
        default=uuid.uuid4,
        comment="품목 고유 ID"
    )
    item_code = Column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
        comment="품목 코드 (사내 관리번호)"
    )
    item_name = Column(
        String(200),
        nullable=False,
        comment="품명"
    )
    spec = Column(
        Text,
        nullable=True,
        comment="규격/사양"
    )
    category = Column(
        _category_enum,
        nullable=False,
        default=CategoryEnum.UK,
        index=True,
        comment="11단계 공정 카테고리"
    )
    unit = Column(
        String(20),
        nullable=False,
        default="EA",
        comment="단위 (EA, kg, m 등)"
    )
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now()
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now()
    )

    # Relationships
    inventory = relationship(
        "Inventory",
        back_populates="item",
        uselist=False,
        cascade="all, delete-orphan"
    )
    bom_as_parent = relationship(
        "BOM",
        foreign_keys="BOM.parent_item_id",
        back_populates="parent_item",
        cascade="all, delete-orphan"
    )
    bom_as_child = relationship(
        "BOM",
        foreign_keys="BOM.child_item_id",
        back_populates="child_item"
    )
    transaction_logs = relationship(
        "TransactionLog",
        back_populates="item",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Item {self.item_code} [{self.category}] {self.item_name}>"


# ---------------------------------------------------------------------------
# Inventory — 재고 현황
# ---------------------------------------------------------------------------

class Inventory(Base):
    __tablename__ = "inventory"

    inventory_id = Column(
        GUID(),
        primary_key=True,
        default=uuid.uuid4,
        comment="재고 레코드 ID"
    )
    item_id = Column(
        GUID(),
        ForeignKey("items.item_id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
        comment="품목 ID (FK)"
    )
    quantity = Column(
        Numeric(15, 4),
        nullable=False,
        default=Decimal("0"),
        comment="현재 재고 수량"
    )
    location = Column(
        String(100),
        nullable=True,
        comment="보관 위치 (창고/랙)"
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now()
    )

    item = relationship("Item", back_populates="inventory")

    def __repr__(self):
        return f"<Inventory item_id={self.item_id} qty={self.quantity}>"


# ---------------------------------------------------------------------------
# BOM — Bill of Materials
# ---------------------------------------------------------------------------

class BOM(Base):
    __tablename__ = "bom"

    bom_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    parent_item_id = Column(
        GUID(),
        ForeignKey("items.item_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    child_item_id = Column(
        GUID(),
        ForeignKey("items.item_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity = Column(Numeric(15, 4), nullable=False, comment="소요 수량")
    unit     = Column(String(20), nullable=False, default="EA")
    notes    = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("parent_item_id", "child_item_id", name="uq_bom_parent_child"),
        Index("ix_bom_parent", "parent_item_id"),
        Index("ix_bom_child", "child_item_id"),
    )

    parent_item = relationship("Item", foreign_keys=[parent_item_id], back_populates="bom_as_parent")
    child_item  = relationship("Item", foreign_keys=[child_item_id],  back_populates="bom_as_child")

    def __repr__(self):
        return f"<BOM {self.parent_item_id} → {self.child_item_id} × {self.quantity}>"


# ---------------------------------------------------------------------------
# TransactionLog — 입출고 및 생산 이력
# ---------------------------------------------------------------------------

class TransactionLog(Base):
    __tablename__ = "transaction_logs"

    log_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    item_id = Column(
        GUID(),
        ForeignKey("items.item_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    transaction_type = Column(
        _tx_type_enum,
        nullable=False,
        index=True,
    )
    quantity_change  = Column(Numeric(15, 4), nullable=False)
    quantity_before  = Column(Numeric(15, 4), nullable=True)
    quantity_after   = Column(Numeric(15, 4), nullable=True)
    reference_no     = Column(String(100), nullable=True, index=True)
    produced_by      = Column(String(100), nullable=True)
    notes            = Column(Text, nullable=True)
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
        index=True,
    )

    item = relationship("Item", back_populates="transaction_logs")

    def __repr__(self):
        return f"<TransactionLog {self.transaction_type} qty={self.quantity_change}>"
