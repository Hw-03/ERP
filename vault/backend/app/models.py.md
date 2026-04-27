---
type: code-note
project: ERP
layer: backend
source_path: backend/app/models.py
status: active
updated: 2026-04-27
source_sha: 177f2fd034b9
tags:
  - erp
  - backend
  - db-model
  - py
---

# models.py

> [!summary] 역할
> SQLAlchemy ORM 모델과 테이블 관계를 정의하는 DB 설계 기준 파일이다.

## 원본 위치

- Source: `backend/app/models.py`
- Layer: `backend`
- Kind: `db-model`
- Size: `25615` bytes

## 연결

- Parent hub: [[backend/app/app|backend/app]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

> 전체 665줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````python
"""ERP data models for the X-Ray manufacturing workflow."""

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


class CategoryEnum(str, enum.Enum):
    RM = "RM"
    TA = "TA"
    TF = "TF"
    HA = "HA"
    HF = "HF"
    VA = "VA"
    VF = "VF"
    AA = "AA"
    AF = "AF"
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
    item_code = Column(String(50), unique=True, nullable=True, index=True)  # 레거시 CSV 코드 — erp_code로 교체 후 DROP 예정
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
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
