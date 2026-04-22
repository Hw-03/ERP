"""ERP data models for the X-Ray manufacturing workflow."""

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SAEnum,
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
    SCRAP = "SCRAP"
    LOSS = "LOSS"
    DISASSEMBLE = "DISASSEMBLE"
    RETURN = "RETURN"
    RESERVE = "RESERVE"
    RESERVE_RELEASE = "RESERVE_RELEASE"
    TRANSFER_TO_PROD = "TRANSFER_TO_PROD"
    TRANSFER_TO_WH = "TRANSFER_TO_WH"
    TRANSFER_DEPT = "TRANSFER_DEPT"
    MARK_DEFECTIVE = "MARK_DEFECTIVE"
    SUPPLIER_RETURN = "SUPPLIER_RETURN"


class LocationStatusEnum(str, enum.Enum):
    PRODUCTION = "PRODUCTION"
    DEFECTIVE = "DEFECTIVE"


class QueueBatchTypeEnum(str, enum.Enum):
    PRODUCE = "PRODUCE"
    DISASSEMBLE = "DISASSEMBLE"
    RETURN = "RETURN"


class QueueBatchStatusEnum(str, enum.Enum):
    OPEN = "OPEN"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"


class QueueLineDirectionEnum(str, enum.Enum):
    IN = "IN"            # Into inventory (disassembly reuse, return intake)
    OUT = "OUT"          # Consumed from inventory (production backflush)
    SCRAP = "SCRAP"      # Discard / defective
    LOSS = "LOSS"        # Missing on return


class AlertKindEnum(str, enum.Enum):
    SAFETY = "SAFETY"
    COUNT_VARIANCE = "COUNT_VARIANCE"


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

    # Legacy UI display fields (populated from ERP_Master_DB.csv or rule-based defaults)
    barcode = Column(String(100), nullable=True, index=True)
    legacy_file_type = Column(String(50), nullable=True, index=True)  # 원자재/조립자재/발생부자재/완제품/미분류
    legacy_part = Column(String(50), nullable=True, index=True)       # 자재창고/조립출하/고압파트/진공파트/튜닝파트/출하
    legacy_item_type = Column(String(50), nullable=True)              # part_type from CSV
    legacy_model = Column(String(50), nullable=True, index=True)      # DX3000/ADX4000W/ADX6000/COCOON/SOLO/공용
    supplier = Column(String(200), nullable=True)
    min_stock = Column(Numeric(15, 4), nullable=True)

    # 4-part ERP code ([제품기호]-[구분코드]-[일련번호]-[옵션코드])
    erp_code = Column(String(40), nullable=True, unique=True, index=True)
    symbol_slot = Column(SmallInteger, ForeignKey("product_symbols.slot"), nullable=True, index=True)
    process_type_code = Column(String(2), ForeignKey("process_types.code"), nullable=True, index=True)
    option_code = Column(String(2), ForeignKey("option_codes.code"), nullable=True)
    serial_no = Column(Integer, nullable=True)

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
    # quantity = warehouse_qty + Σ(InventoryLocation.quantity). 서비스 레이어가 동기화 보장.
    quantity = Column(Numeric(15, 4), nullable=False, default=Decimal("0"))
    # 창고 보관량. 가용 재고 계산에 포함.
    warehouse_qty = Column(Numeric(15, 4), nullable=False, default=Decimal("0"))
    # 큐 배치 예약분 (warehouse_qty 대비). Available = warehouse + production_total − pending.
    pending_quantity = Column(Numeric(15, 4), nullable=False, default=Decimal("0"))
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
    department = Column(
        SAEnum(DepartmentEnum, name="department_enum", create_type=False),
        nullable=False,
        index=True,
    )
    status = Column(
        SAEnum(LocationStatusEnum, name="location_status_enum", create_type=True),
        nullable=False,
        index=True,
    )
    quantity = Column(Numeric(15, 4), nullable=False, default=Decimal("0"))
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("item_id", "department", "status", name="uq_invloc_item_dept_status"),
        Index("ix_invloc_item", "item_id"),
        Index("ix_invloc_dept", "department"),
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


class SystemSetting(Base):
    __tablename__ = "system_settings"

    setting_key = Column(String(100), primary_key=True)
    setting_value = Column(Text, nullable=False)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )


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
    # Optional link to the queue batch that generated this log
    batch_id = Column(
        UUID(as_uuid=True),
        ForeignKey("queue_batches.batch_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
        index=True,
    )

    item = relationship("Item", back_populates="transaction_logs")
    batch = relationship("QueueBatch", back_populates="transaction_logs")


# =============================================================================
# Code master tables (100-slot product symbols, 2-char process, 2-char option)
# =============================================================================


class ProductSymbol(Base):
    __tablename__ = "product_symbols"

    slot = Column(SmallInteger, primary_key=True)  # 1 ~ 100
    symbol = Column(String(5), nullable=True, unique=True, index=True)
    model_name = Column(String(50), nullable=True)
    # Finished goods (PA/AA) must use a single-slot symbol; this flag marks it
    is_finished_good = Column(Boolean, nullable=False, default=False)
    is_reserved = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)


class OptionCode(Base):
    __tablename__ = "option_codes"

    code = Column(String(2), primary_key=True)
    label_ko = Column(String(50), nullable=False)
    label_en = Column(String(50), nullable=True)
    color_hex = Column(String(7), nullable=True)


class ProcessType(Base):
    __tablename__ = "process_types"

    code = Column(String(2), primary_key=True)   # TR, TA, HR, HA, VR, VA, NA, AR, AA, PR, PA
    prefix = Column(String(1), nullable=False)   # T / H / V / N / A / P
    suffix = Column(String(1), nullable=False)   # R(Raw) / A(Assembly)
    stage_order = Column(SmallInteger, nullable=False, default=0)
    description = Column(Text, nullable=True)


class ProcessFlowRule(Base):
    __tablename__ = "process_flow_rules"

    rule_id = Column(Integer, primary_key=True, autoincrement=True)
    from_type = Column(String(2), ForeignKey("process_types.code"), nullable=False)
    to_type = Column(String(2), ForeignKey("process_types.code"), nullable=False)
    # Additional input codes that must be consumed (comma separated). 예: TA+HR->HA => "HR"
    consumes_codes = Column(String(200), nullable=True)

    __table_args__ = (
        UniqueConstraint("from_type", "to_type", name="uq_flow_rule"),
    )


# =============================================================================
# Queue (예약/확정) workflow tables
# =============================================================================


class QueueBatch(Base):
    __tablename__ = "queue_batches"

    batch_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_type = Column(
        SAEnum(QueueBatchTypeEnum, name="queue_batch_type_enum", create_type=True),
        nullable=False,
    )
    status = Column(
        SAEnum(QueueBatchStatusEnum, name="queue_batch_status_enum", create_type=True),
        nullable=False,
        default=QueueBatchStatusEnum.OPEN,
        index=True,
    )
    owner_employee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("employees.employee_id", ondelete="SET NULL"),
        nullable=True,
    )
    owner_name = Column(String(100), nullable=True)  # denormalized for display
    parent_item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("items.item_id", ondelete="SET NULL"),
        nullable=True,
    )
    parent_quantity = Column(Numeric(15, 4), nullable=True)
    reference_no = Column(String(100), nullable=True, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    confirmed_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)

    lines = relationship("QueueLine", back_populates="batch", cascade="all, delete-orphan")
    transaction_logs = relationship("TransactionLog", back_populates="batch")


class QueueLine(Base):
    __tablename__ = "queue_lines"

    line_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id = Column(
        UUID(as_uuid=True),
        ForeignKey("queue_batches.batch_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("items.item_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    direction = Column(
        SAEnum(QueueLineDirectionEnum, name="queue_line_direction_enum", create_type=True),
        nullable=False,
    )
    quantity = Column(Numeric(15, 4), nullable=False)
    bom_expected = Column(Numeric(15, 4), nullable=True)  # Original BOM expected qty (for variance)
    reason = Column(Text, nullable=True)
    process_stage = Column(String(2), ForeignKey("process_types.code"), nullable=True)
    included = Column(Boolean, nullable=False, default=True)  # Selective inclusion toggle
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())

    batch = relationship("QueueBatch", back_populates="lines")
    item = relationship("Item")


# =============================================================================
# Scrap / Loss / Variance history
# =============================================================================


class ScrapLog(Base):
    __tablename__ = "scrap_logs"

    scrap_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.item_id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(Numeric(15, 4), nullable=False)
    process_stage = Column(String(2), ForeignKey("process_types.code"), nullable=True)
    reason = Column(String(200), nullable=False)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("queue_batches.batch_id", ondelete="SET NULL"), nullable=True, index=True)
    operator = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now(), index=True)


class LossLog(Base):
    __tablename__ = "loss_logs"

    loss_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.item_id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(Numeric(15, 4), nullable=False)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("queue_batches.batch_id", ondelete="SET NULL"), nullable=True, index=True)
    reason = Column(String(200), nullable=False)
    operator = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now(), index=True)


class VarianceLog(Base):
    __tablename__ = "variance_logs"

    var_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("queue_batches.batch_id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.item_id", ondelete="CASCADE"), nullable=False, index=True)
    bom_expected = Column(Numeric(15, 4), nullable=False)
    actual_used = Column(Numeric(15, 4), nullable=False)
    diff = Column(Numeric(15, 4), nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())


# =============================================================================
# Advanced inventory management: alerts, physical counts
# =============================================================================


class StockAlert(Base):
    __tablename__ = "stock_alerts"

    alert_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.item_id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(
        SAEnum(AlertKindEnum, name="alert_kind_enum", create_type=True),
        nullable=False,
        index=True,
    )
    threshold = Column(Numeric(15, 4), nullable=True)
    observed_value = Column(Numeric(15, 4), nullable=True)
    message = Column(Text, nullable=True)
    triggered_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now(), index=True)
    acknowledged_at = Column(DateTime, nullable=True)
    acknowledged_by = Column(String(100), nullable=True)


class PhysicalCount(Base):
    __tablename__ = "physical_counts"

    count_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.item_id", ondelete="CASCADE"), nullable=False, index=True)
    counted_qty = Column(Numeric(15, 4), nullable=False)
    system_qty = Column(Numeric(15, 4), nullable=False)
    diff = Column(Numeric(15, 4), nullable=False)
    reason = Column(String(200), nullable=True)
    operator = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now(), index=True)
