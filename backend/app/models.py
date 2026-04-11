"""
ERP System — Database Models
SQLAlchemy ORM models (SQLite + PostgreSQL compatible)

제조 공정 흐름:
RM → TA → TF → HA → HF → VA → VF → BA → BF → FG
UK: 미분류 안전망
"""

import uuid
import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Column, String, Text, Numeric, DateTime, ForeignKey,
    Enum as SAEnum, UniqueConstraint, Index, func, CHAR,
)
from sqlalchemy.types import TypeDecorator
from sqlalchemy.orm import relationship

from app.database import Base


# ---------------------------------------------------------------------------
# GUID — PostgreSQL UUID + SQLite CHAR(36) 호환 타입
# ---------------------------------------------------------------------------

class GUID(TypeDecorator):
    """UUID 타입 (PostgreSQL: native UUID / SQLite: CHAR(36))"""
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
        return str(value)

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
    TF = "TF"   # Tube Final          완성 튜브
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
    RECEIVE   = "RECEIVE"    # 직접 입고
    PRODUCE   = "PRODUCE"    # 생산 입고 (완성품 재고 증가)
    SHIP      = "SHIP"       # 출하 (재고 감소)
    ADJUST    = "ADJUST"     # 재고 조정
    BACKFLUSH = "BACKFLUSH"  # BOM 역전개 자동 차감


# SQLite 호환 enum 컬럼 (create_type=False, native_enum=False)
_category_enum = SAEnum(CategoryEnum, name="category_enum", create_type=False, native_enum=False)
_tx_type_enum  = SAEnum(TransactionTypeEnum, name="transaction_type_enum", create_type=False, native_enum=False)


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

    # Relationships
    item = relationship("Item", back_populates="inventory")

    def __repr__(self):
        return f"<Inventory item_id={self.item_id} qty={self.quantity}>"


# ---------------------------------------------------------------------------
# BOM — Bill of Materials (핵심: 다단계 공정 구조 정의)
# ---------------------------------------------------------------------------

class BOM(Base):
    """
    BOM (Bill of Materials) — 자재명세서

    parent_item: 완성품 또는 반제품 (상위)
    child_item:  소요 부품 또는 원자재 (하위)
    quantity:    parent 1개 생산 시 child 소요 수량

    예시:
      BF(Body Final) → HA(High-voltage Ass'y) × 1, VA(Vacuum Ass'y) × 1, RM(나사) × 12
    """
    __tablename__ = "bom"

    bom_id = Column(
        GUID(),
        primary_key=True,
        default=uuid.uuid4,
        comment="BOM 항목 ID"
    )
    parent_item_id = Column(
        GUID(),
        ForeignKey("items.item_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="상위 품목 ID (완성품/반제품)"
    )
    child_item_id = Column(
        GUID(),
        ForeignKey("items.item_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="하위 품목 ID (소요 부품/원자재)"
    )
    quantity = Column(
        Numeric(15, 4),
        nullable=False,
        comment="parent 1개 생산 시 child 소요 수량"
    )
    unit = Column(
        String(20),
        nullable=False,
        default="EA",
        comment="소요 단위"
    )
    notes = Column(
        Text,
        nullable=True,
        comment="비고"
    )

    # Constraints
    __table_args__ = (
        UniqueConstraint("parent_item_id", "child_item_id", name="uq_bom_parent_child"),
        Index("ix_bom_parent", "parent_item_id"),
        Index("ix_bom_child", "child_item_id"),
    )

    # Relationships
    parent_item = relationship(
        "Item",
        foreign_keys=[parent_item_id],
        back_populates="bom_as_parent"
    )
    child_item = relationship(
        "Item",
        foreign_keys=[child_item_id],
        back_populates="bom_as_child"
    )

    def __repr__(self):
        return f"<BOM parent={self.parent_item_id} → child={self.child_item_id} × {self.quantity}>"


# ---------------------------------------------------------------------------
# TransactionLog — 입출고 및 생산 이력
# ---------------------------------------------------------------------------

class TransactionLog(Base):
    """
    모든 재고 변동 이력을 추적.

    quantity_change:
      +양수 = 재고 증가 (입고, 생산 입고)
      -음수 = 재고 감소 (출하, Backflush 차감)
    """
    __tablename__ = "transaction_logs"

    log_id = Column(
        GUID(),
        primary_key=True,
        default=uuid.uuid4,
        comment="트랜잭션 로그 ID"
    )
    item_id = Column(
        GUID(),
        ForeignKey("items.item_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="대상 품목 ID"
    )
    transaction_type = Column(
        _tx_type_enum,
        nullable=False,
        index=True,
        comment="트랜잭션 유형"
    )
    quantity_change = Column(
        Numeric(15, 4),
        nullable=False,
        comment="수량 변동 (+입고/-출고)"
    )
    quantity_before = Column(
        Numeric(15, 4),
        nullable=True,
        comment="처리 전 재고 수량"
    )
    quantity_after = Column(
        Numeric(15, 4),
        nullable=True,
        comment="처리 후 재고 수량"
    )
    reference_no = Column(
        String(100),
        nullable=True,
        index=True,
        comment="참조 번호 (생산지시번호, 발주번호 등)"
    )
    produced_by = Column(
        String(100),
        nullable=True,
        comment="처리자"
    )
    notes = Column(
        Text,
        nullable=True,
        comment="비고"
    )
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
        index=True,
        comment="처리 일시"
    )

    # Relationships
    item = relationship("Item", back_populates="transaction_logs")

    def __repr__(self):
        return (
            f"<TransactionLog {self.transaction_type} "
            f"item={self.item_id} qty_change={self.quantity_change}>"
        )
