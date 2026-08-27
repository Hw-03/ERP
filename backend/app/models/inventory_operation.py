"""재고에 영향을 준 사용자 작업과 그 역전 효과의 공통 원장."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum as SAEnum, ForeignKey, Index, JSON, String, Text, UniqueConstraint, func

from app.models.base import Base, IntQuantity, UUIDString

__all__ = [
    "DefectInventoryMovement",
    "InventoryOperation",
    "InventoryOperationEffect",
    "InventoryOperationEffectKindEnum",
    "InventoryOperationKindEnum",
    "InventoryOperationRoleEnum",
    "InventoryOperationStatusEnum",
]


class InventoryOperationKindEnum(str, enum.Enum):
    BUSINESS = "BUSINESS"
    CANCELLATION = "CANCELLATION"


class InventoryOperationStatusEnum(str, enum.Enum):
    COMMITTED = "COMMITTED"


class InventoryOperationEffectKindEnum(str, enum.Enum):
    INVENTORY = "INVENTORY"
    DEFECT_LEDGER = "DEFECT_LEDGER"
    RESERVATION = "RESERVATION"
    ALLOCATION = "ALLOCATION"
    WORKFLOW = "WORKFLOW"


class InventoryOperationRoleEnum(str, enum.Enum):
    PRIMARY = "PRIMARY"
    COMPONENT_INPUT = "COMPONENT_INPUT"
    PRODUCT_OUTPUT = "PRODUCT_OUTPUT"
    TRANSFER = "TRANSFER"
    CORRECTION = "CORRECTION"
    REWORK_PARENT_NORMAL = "REWORK_PARENT_NORMAL"
    REWORK_PARENT_DEFECTIVE = "REWORK_PARENT_DEFECTIVE"
    REWORK_CHILD_NORMAL = "REWORK_CHILD_NORMAL"
    REWORK_CHILD_DEFECTIVE = "REWORK_CHILD_DEFECTIVE"
    REWORK_CHILD_SCRAP = "REWORK_CHILD_SCRAP"


class InventoryOperation(Base):
    """한 번의 사용자 재고 작업을 이루는 모든 효과의 불변 묶음."""

    __tablename__ = "inventory_operations"

    operation_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    kind = Column(
        SAEnum(InventoryOperationKindEnum, name="inventory_operation_kind_enum"),
        nullable=False,
        index=True,
    )
    domain = Column(String(40), nullable=False, index=True)
    action = Column(String(60), nullable=False, index=True)
    status = Column(
        SAEnum(InventoryOperationStatusEnum, name="inventory_operation_status_enum"),
        nullable=False,
        default=InventoryOperationStatusEnum.COMMITTED,
        server_default=InventoryOperationStatusEnum.COMMITTED.value,
    )
    display_label = Column(String(120), nullable=False)
    actor_employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    actor_name = Column(String(100), nullable=False)
    department = Column(String(50), nullable=True, index=True)
    reason = Column(Text, nullable=True)
    idempotency_key = Column(String(160), nullable=True, unique=True)
    effective_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
        index=True,
    )
    contract_version = Column(IntQuantity, nullable=False, default=1, server_default="1")
    reverses_operation_id = Column(
        UUIDString,
        ForeignKey("inventory_operations.operation_id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "reverses_operation_id",
            name="uq_inventory_operation_reverses_operation",
        ),
        Index("ix_inventory_operation_domain_action", "domain", "action"),
        Index("ix_inventory_operation_effective_id", "effective_at", "operation_id"),
    )


class InventoryOperationEffect(Base):
    """예약·배정·업무 상태 등 비재고 효과의 전후 스냅샷."""

    __tablename__ = "inventory_operation_effects"

    effect_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    operation_id = Column(
        UUIDString,
        ForeignKey("inventory_operations.operation_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    effect_kind = Column(
        SAEnum(InventoryOperationEffectKindEnum, name="inventory_operation_effect_kind_enum"),
        nullable=False,
        index=True,
    )
    subject_type = Column(String(50), nullable=False, index=True)
    subject_id = Column(String(80), nullable=False, index=True)
    role = Column(String(60), nullable=False)
    before_state = Column(JSON, nullable=False)
    after_state = Column(JSON, nullable=False)
    reverses_effect_id = Column(
        UUIDString,
        ForeignKey("inventory_operation_effects.effect_id", ondelete="RESTRICT"),
        nullable=True,
    )
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "reverses_effect_id",
            name="uq_inventory_operation_effect_reverses_effect",
        ),
        Index("ix_inventory_operation_effect_subject", "subject_type", "subject_id"),
    )


class DefectInventoryMovement(Base):
    """격리 건의 활성 불량 수량을 증감시키는 append-only 이동."""

    __tablename__ = "defect_inventory_movements"

    movement_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    operation_id = Column(
        UUIDString,
        ForeignKey("inventory_operations.operation_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    record_id = Column(
        UUIDString,
        ForeignKey("defect_quarantine_records.record_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    item_id = Column(
        UUIDString,
        ForeignKey("items.item_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    department = Column(String(50), nullable=False, index=True)
    movement_type = Column(String(40), nullable=False, index=True)
    quantity_delta = Column(IntQuantity, nullable=False)
    role = Column(String(60), nullable=False)
    actor_employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    actor_name = Column(String(100), nullable=False)
    effective_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
        index=True,
    )
    reverses_movement_id = Column(
        UUIDString,
        ForeignKey("defect_inventory_movements.movement_id", ondelete="RESTRICT"),
        nullable=True,
    )
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "reverses_movement_id",
            name="uq_defect_movement_reverses_movement",
        ),
        Index("ix_defect_movement_record_effective", "record_id", "effective_at"),
        Index("ix_defect_movement_item_department", "item_id", "department"),
    )
