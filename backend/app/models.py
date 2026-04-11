"""ERP data models for the X-Ray manufacturing workflow."""

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class CategoryEnum(str, enum.Enum):
    RM = "RM"
    TA = "TA"
    TF = "TF"
    HA = "HA"
    HF = "HF"
    VA = "VA"
    VF = "VF"
    BA = "BA"
    BF = "BF"
    FG = "FG"
    UK = "UK"


class TransactionTypeEnum(str, enum.Enum):
    RECEIVE = "RECEIVE"
    PRODUCE = "PRODUCE"
    SHIP = "SHIP"
    ADJUST = "ADJUST"
    BACKFLUSH = "BACKFLUSH"


class DepartmentEnum(str, enum.Enum):
    ASSEMBLY = "조립"
    HIGH_VOLTAGE = "고압"
    VACUUM = "진공"
    TUNING = "튜닝"
    TUBE = "튜브"
    AS = "AS"
    RESEARCH = "연구"
    SALES = "영업"
    SHIPPING = "출하"
    ETC = "기타"


class EmployeeLevelEnum(str, enum.Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    STAFF = "staff"


class Item(Base):
    __tablename__ = "items"

    item_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_code = Column(String(50), unique=True, nullable=False, index=True)
    item_name = Column(String(200), nullable=False)
    spec = Column(Text, nullable=True)
    category = Column(
        SAEnum(CategoryEnum, name="category_enum", create_type=True),
        nullable=False,
        default=CategoryEnum.UK,
        index=True,
    )
    unit = Column(String(20), nullable=False, default="EA")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

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
    package_items = relationship("ShipPackageItem", back_populates="item")


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
    quantity = Column(Numeric(15, 4), nullable=False, default=Decimal("0"))
    location = Column(String(100), nullable=True)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    item = relationship("Item", back_populates="inventory")


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


class Employee(Base):
    __tablename__ = "employees"

    employee_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_code = Column(String(30), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False, index=True)
    role = Column(String(100), nullable=False)
    phone = Column(String(30), nullable=True)
    department = Column(
        SAEnum(DepartmentEnum, name="department_enum", create_type=True),
        nullable=False,
        default=DepartmentEnum.ETC,
        index=True,
    )
    level = Column(
        SAEnum(EmployeeLevelEnum, name="employee_level_enum", create_type=True),
        nullable=False,
        default=EmployeeLevelEnum.STAFF,
    )
    display_order = Column(Numeric(10, 0), nullable=False, default=0)
    is_active = Column(String(5), nullable=False, default="true")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )


class ShipPackage(Base):
    __tablename__ = "ship_packages"

    package_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    package_code = Column(String(40), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    items = relationship("ShipPackageItem", back_populates="package", cascade="all, delete-orphan")


class ShipPackageItem(Base):
    __tablename__ = "ship_package_items"

    package_item_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    package_id = Column(UUID(as_uuid=True), ForeignKey("ship_packages.package_id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.item_id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(Numeric(15, 4), nullable=False, default=Decimal("1"))

    __table_args__ = (
        UniqueConstraint("package_id", "item_id", name="uq_ship_package_item"),
    )

    package = relationship("ShipPackage", back_populates="items")
    item = relationship("Item", back_populates="package_items")


class TransactionLog(Base):
    __tablename__ = "transaction_logs"

    log_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.item_id", ondelete="CASCADE"), nullable=False, index=True)
    transaction_type = Column(
        SAEnum(TransactionTypeEnum, name="transaction_type_enum", create_type=True),
        nullable=False,
        index=True,
    )
    quantity_change = Column(Numeric(15, 4), nullable=False)
    quantity_before = Column(Numeric(15, 4), nullable=True)
    quantity_after = Column(Numeric(15, 4), nullable=True)
    reference_no = Column(String(100), nullable=True, index=True)
    produced_by = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
        index=True,
    )

    item = relationship("Item", back_populates="transaction_logs")
