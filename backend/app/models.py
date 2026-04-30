"""MES data models for the DEXCOWIN manufacturing workflow."""

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
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
from sqlalchemy.types import TypeDecorator

from app.database import Base


class BoolAsString(TypeDecorator):
    """DB 에는 'true'/'false' 문자열로, 애플리케이션에서는 bool 로 다룬다.

    기존 Employee.is_active 가 VARCHAR(5) 로 저장되는 관성을 유지하면서 ORM 레이어에서만
    bool 로 정규화. 스키마 변경 필요 없음.
    """

    impl = String(5)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, bool):
            return "true" if value else "false"
        # 기존 문자열/정수 입력 호환
        if isinstance(value, str):
            return "true" if value.lower() in ("true", "1", "yes", "t") else "false"
        return "true" if bool(value) else "false"

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        return str(value).lower() in ("true", "1", "yes", "t")


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


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), unique=True, nullable=False)
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    color_hex = Column(String(7), nullable=True)


class Item(Base):
    __tablename__ = "items"

    item_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_code = Column(String(50), unique=True, nullable=True, index=True)  # 레거시 CSV 코드 — erp_code로 교체 후 DROP 예정
    item_name = Column(String(200), nullable=False)
    sort_order = Column(Integer, nullable=True, index=True)  # 엑셀 정리본 행 순서
    spec = Column(Text, nullable=True)
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

    # 4-part ERP code ([모델기호조합]-[구분코드]-[일련번호]-[옵션코드])
    erp_code = Column(String(40), nullable=True, unique=True, index=True)
    model_symbol = Column(String(20), nullable=True, index=True)  # 예: "346", "3", "34678"
    symbol_slot = Column(SmallInteger, ForeignKey("product_symbols.slot"), nullable=True, index=True)  # deprecated
    process_type_code = Column(String(2), ForeignKey("process_types.code"), nullable=True, index=True)
    option_code = Column(String(10), nullable=True)  # 자유 텍스트 (FK 제거)
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
    quantity = Column(Numeric(15, 4), nullable=False, default=Decimal("0"))
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        # 5.5-A: 음수 위치 재고 방지. 서비스 레이어에서 막지만 DB-level 안전망.
        CheckConstraint("quantity >= 0", name="ck_invloc_quantity_nonneg"),
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
    department = Column(String(50), nullable=False, default="기타", index=True)
    level = Column(
        SAEnum(EmployeeLevelEnum, name="employee_level_enum", create_type=True),
        nullable=False,
        default=EmployeeLevelEnum.STAFF,
    )
    # 창고 결재 역할: "none" | "primary" | "deputy". 시스템 권한(level)과 별개의 업무 역할.
    # 소문자 문자열로 통일 (DB / API / 프론트 모두 동일).
    warehouse_role = Column(String(20), nullable=False, default="none", server_default="none")
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(BoolAsString, nullable=False, default=True)
    # 작업자 식별용 PIN 해시 — 실제 보안 인증이 아님. None이면 기본 PIN 0000 적용
    pin_hash = Column(Text, nullable=True)
    pin_last_changed = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "warehouse_role IN ('none', 'primary', 'deputy')",
            name="ck_employee_warehouse_role",
        ),
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

    __table_args__ = (
        # 5.5-A: "품목 X 의 최근 거래 N건" / "기간 export" 쿼리 가속.
        # 단일 item_id 인덱스 + created_at 인덱스 조합보다 복합이 효율적.
        Index("ix_tx_item_created", "item_id", "created_at"),
    )


class TransactionEditLog(Base):
    """거래 수정 감사 이력. 메타데이터 수정(3차) + 수량 보정(4차) 모두 기록."""

    __tablename__ = "transaction_edit_logs"

    edit_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    original_log_id = Column(
        UUID(as_uuid=True),
        ForeignKey("transaction_logs.log_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    edited_by_employee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("employees.employee_id", ondelete="RESTRICT"),
        nullable=False,
    )
    edited_by_name = Column(String(100), nullable=False)  # 스냅샷 — 직원 비활성/이름 변경 후에도 보존
    reason = Column(Text, nullable=False)  # 필수
    before_payload = Column(Text, nullable=False)  # JSON 스냅샷
    after_payload = Column(Text, nullable=False)  # JSON 스냅샷
    correction_log_id = Column(
        UUID(as_uuid=True),
        ForeignKey("transaction_logs.log_id", ondelete="SET NULL"),
        nullable=True,
    )  # 4차 수량 보정 시 생성된 ADJUST 거래 참조
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())


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


class ItemModel(Base):
    """품목-제품 다대다 연결 테이블. 품목이 어떤 제품에 사용되는지 기록."""
    __tablename__ = "item_models"

    item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("items.item_id", ondelete="CASCADE"),
        primary_key=True,
    )
    slot = Column(SmallInteger, ForeignKey("product_symbols.slot"), primary_key=True)


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
        index=True,
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
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
        index=True,
    )
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


# =============================================================================
# Stock request workflow (작업자 요청 → 창고 담당자 승인 → 재고 반영)
# =============================================================================


class StockRequestStatusEnum(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    RESERVED = "reserved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    FAILED_APPROVAL = "failed_approval"


class StockRequestTypeEnum(str, enum.Enum):
    RAW_RECEIVE = "raw_receive"
    RAW_SHIP = "raw_ship"
    WAREHOUSE_TO_DEPT = "warehouse_to_dept"
    DEPT_TO_WAREHOUSE = "dept_to_warehouse"
    DEPT_INTERNAL = "dept_internal"
    MARK_DEFECTIVE_WH = "mark_defective_wh"
    MARK_DEFECTIVE_PROD = "mark_defective_prod"
    SUPPLIER_RETURN = "supplier_return"
    PACKAGE_OUT = "package_out"


class RequestBucketEnum(str, enum.Enum):
    WAREHOUSE = "warehouse"
    PRODUCTION = "production"
    DEFECTIVE = "defective"
    NONE = "none"


class StockRequest(Base):
    """입출고 결재 요청. 창고 재고가 움직이는 작업은 승인 후에만 실재고 반영."""

    __tablename__ = "stock_requests"

    request_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_code = Column(String(40), unique=True, nullable=True, index=True)
    requester_employee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("employees.employee_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    requester_name = Column(String(100), nullable=False)
    requester_department = Column(String(50), nullable=False)
    request_type = Column(
        SAEnum(StockRequestTypeEnum, name="stock_request_type_enum", create_type=True),
        nullable=False,
        index=True,
    )
    status = Column(
        SAEnum(StockRequestStatusEnum, name="stock_request_status_enum", create_type=True),
        nullable=False,
        default=StockRequestStatusEnum.SUBMITTED,
        index=True,
    )
    requires_warehouse_approval = Column(Boolean, nullable=False, default=True)
    reserved_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    approved_by_employee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("employees.employee_id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_by_name = Column(String(100), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    rejected_by_employee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("employees.employee_id", ondelete="SET NULL"),
        nullable=True,
    )
    rejected_by_name = Column(String(100), nullable=True)
    rejected_at = Column(DateTime, nullable=True)
    rejected_reason = Column(Text, nullable=True)  # FAILED_APPROVAL 사유도 여기 저장
    cancelled_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    reference_no = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now(), index=True)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    lines = relationship(
        "StockRequestLine",
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="StockRequestLine.created_at",
    )


class StockRequestLine(Base):
    __tablename__ = "stock_request_lines"

    line_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id = Column(
        UUID(as_uuid=True),
        ForeignKey("stock_requests.request_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("items.item_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    item_name_snapshot = Column(String(200), nullable=False)
    erp_code_snapshot = Column(String(50), nullable=True)
    quantity = Column(Numeric(15, 4), nullable=False)
    from_bucket = Column(
        SAEnum(RequestBucketEnum, name="request_bucket_enum", create_type=True),
        nullable=False,
    )
    from_department = Column(String(50), nullable=True)
    to_bucket = Column(
        SAEnum(RequestBucketEnum, name="request_bucket_enum", create_type=False),
        nullable=False,
    )
    to_department = Column(String(50), nullable=True)
    status = Column(
        SAEnum(StockRequestStatusEnum, name="stock_request_status_enum", create_type=False),
        nullable=False,
        default=StockRequestStatusEnum.SUBMITTED,
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())

    request = relationship("StockRequest", back_populates="lines")
    item = relationship("Item")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_stock_request_line_qty_positive"),
        Index("ix_stock_request_line_item_status", "item_id", "status"),
    )


class AdminAuditLog(Base):
    """관리자 액션 감사로그.

    재고 변동(입출고/이동/불량/공급사반품/생산/큐)은 TransactionLog 가 본질적 audit 이고,
    이 표는 그 외의 마스터/설정 변경 (item·employee·bom·settings·codes) 만 기록한다.
    """
    __tablename__ = "admin_audit_logs"

    audit_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_pin_role = Column(String(32), nullable=False, default="admin")
    action = Column(String(64), nullable=False, index=True)
    target_type = Column(String(64), nullable=False, index=True)
    target_id = Column(String(64), nullable=True)
    payload_summary = Column(Text, nullable=True)
    request_id = Column(String(32), nullable=True, index=True)
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
        index=True,
    )
