"""Additive stocktake foundations; legacy inventory remains authoritative until cutover."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)

from app.models.base import Base, IntQuantity, UUIDString


class InventoryScope(Base):
    """Stable location identity independent of a department's display name."""

    __tablename__ = "inventory_scopes"

    scope_key = Column(String(80), primary_key=True)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="RESTRICT"), unique=True)
    physical_department = Column(String(50), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())


class StocktakeControl(Base):
    """One row controls stock authority and future round/epoch fences."""

    __tablename__ = "stocktake_control"

    id = Column(Integer, primary_key=True)
    inventory_mode = Column(String(8), nullable=False, default="LEGACY", server_default="LEGACY")
    active_round_id = Column(UUIDString, nullable=True)
    epoch = Column(Integer, nullable=False, default=0, server_default="0")

    __table_args__ = (
        CheckConstraint("id = 1", name="ck_stocktake_control_singleton"),
        CheckConstraint("inventory_mode IN ('LEGACY', 'POOL')", name="ck_stocktake_control_mode"),
        CheckConstraint("epoch >= 0", name="ck_stocktake_control_epoch"),
    )


class StocktakeGate(Base):
    """Per-item/location fence; an old round never blocks current stock writes."""

    __tablename__ = "stocktake_gates"

    item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="RESTRICT"), primary_key=True)
    scope_key = Column(String(80), ForeignKey("inventory_scopes.scope_key", ondelete="RESTRICT"), primary_key=True)
    round_id = Column(UUIDString, nullable=True)
    round_epoch = Column(Integer, nullable=False, default=0, server_default="0")
    active_count_id = Column(UUIDString, nullable=True)
    fence = Column(Integer, nullable=False, default=0, server_default="0")
    quantity_revision = Column(Integer, nullable=False, default=0, server_default="0")
    reservation_revision = Column(Integer, nullable=False, default=0, server_default="0")
    observation_epoch = Column(Integer, nullable=False, default=0, server_default="0")

    __table_args__ = (
        CheckConstraint("round_epoch >= 0 AND fence >= 0 AND quantity_revision >= 0 "
                        "AND reservation_revision >= 0 AND observation_epoch >= 0",
                        name="ck_stocktake_gate_revisions"),
    )


class StocktakeProgress(Base):
    """Scope revisions invalidate close previews without updating the control row."""

    __tablename__ = "stocktake_progress"

    round_id = Column(UUIDString, primary_key=True)
    scope_key = Column(String(80), ForeignKey("inventory_scopes.scope_key", ondelete="RESTRICT"), primary_key=True)
    progress_revision = Column(Integer, nullable=False, default=0, server_default="0")

    __table_args__ = (
        CheckConstraint("progress_revision >= 0", name="ck_stocktake_progress_revision"),
    )


class OperatorSession(Base):
    """A token is returned once; only its hash persists in this row."""

    __tablename__ = "operator_sessions"

    session_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    token_hash = Column(String(64), nullable=False, unique=True)
    employee_id = Column(UUIDString, ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False)
    tab_id = Column(String(100), nullable=False)
    pin_version = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_operator_sessions_employee_expires", "employee_id", "expires_at"),
        CheckConstraint("pin_version >= 0", name="ck_operator_session_pin_version"),
    )


class DefectPoolCutover(Base):
    """One committed transition from historical record balances to shared stock."""

    __tablename__ = "defect_pool_cutovers"

    cutover_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    actor_employee_id = Column(UUIDString, ForeignKey("employees.employee_id", ondelete="RESTRICT"), nullable=False)
    operation_id = Column(UUIDString, ForeignKey("inventory_operations.operation_id", ondelete="RESTRICT"), nullable=False, unique=True)
    source_fingerprint = Column(String(64), nullable=False, unique=True)
    cutover_version = Column(Integer, nullable=False)
    performed_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())


class DefectStockPool(Base):
    """Category-specific authority activated only after a complete cutover."""

    __tablename__ = "defect_stock_pools"

    pool_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="RESTRICT"), nullable=False)
    scope_key = Column(String(80), ForeignKey("inventory_scopes.scope_key", ondelete="RESTRICT"), nullable=False)
    category = Column(String(16), nullable=False)
    quantity = Column(IntQuantity, nullable=False, default=0, server_default="0")
    pending_quantity = Column(IntQuantity, nullable=False, default=0, server_default="0")
    version = Column(Integer, nullable=False, default=0, server_default="0")
    cutover_id = Column(UUIDString, ForeignKey("defect_pool_cutovers.cutover_id", ondelete="RESTRICT"), nullable=False)

    __table_args__ = (
        UniqueConstraint("item_id", "scope_key", "category", name="uq_defect_pool_item_scope_category"),
        CheckConstraint("category IN ('DEFECT', 'B_GRADE', 'OBSOLETE')", name="ck_defect_pool_category"),
        CheckConstraint("quantity >= pending_quantity AND pending_quantity >= 0", name="ck_defect_pool_available"),
        CheckConstraint("version >= 0", name="ck_defect_pool_version"),
    )


class DefectStockMovement(Base):
    """Immutable effect of a committed pool operation (written in later stages)."""

    __tablename__ = "defect_stock_movements"

    movement_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    pool_id = Column(UUIDString, ForeignKey("defect_stock_pools.pool_id", ondelete="RESTRICT"), nullable=False)
    operation_id = Column(UUIDString, ForeignKey("inventory_operations.operation_id", ondelete="RESTRICT"), nullable=False)
    effect_ordinal = Column(Integer, nullable=False)
    delta = Column(IntQuantity, nullable=False)
    before_quantity = Column(IntQuantity, nullable=False)
    after_quantity = Column(IntQuantity, nullable=False)
    reason = Column(Text, nullable=False)
    actor_employee_id = Column(UUIDString, ForeignKey("employees.employee_id", ondelete="SET NULL"))
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("operation_id", "effect_ordinal", name="uq_defect_pool_operation_effect"),
        CheckConstraint("delta != 0", name="ck_defect_pool_movement_nonzero"),
        CheckConstraint("before_quantity >= 0 AND after_quantity >= 0", name="ck_defect_pool_movement_nonnegative"),
    )


class DefectPoolBridge(Base):
    """Cutover provenance for whole original effects and their allocations."""

    __tablename__ = "defect_pool_bridges"

    bridge_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    cutover_id = Column(UUIDString, ForeignKey("defect_pool_cutovers.cutover_id", ondelete="RESTRICT"), nullable=False)
    source_key = Column(String(160), nullable=False)
    source_transaction_id = Column(UUIDString, ForeignKey("transaction_logs.log_id", ondelete="RESTRICT"))
    source_record_id = Column(UUIDString, ForeignKey("defect_quarantine_records.record_id", ondelete="RESTRICT"))
    scope_key = Column(String(80), ForeignKey("inventory_scopes.scope_key", ondelete="RESTRICT"), nullable=False)
    original_category = Column(String(16))
    cutover_category = Column(String(16))
    cutover_remaining = Column(IntQuantity, nullable=False)
    observed_epoch = Column(Integer, nullable=False, default=0, server_default="0")
    source_fingerprint = Column(String(64), nullable=False)
    source_payload = Column(JSON, nullable=False)

    __table_args__ = (
        UniqueConstraint("cutover_id", "source_key", name="uq_defect_pool_bridge_source"),
        Index("ix_defect_pool_bridge_transaction", "source_transaction_id"),
        Index("ix_defect_pool_bridge_record", "source_record_id"),
        CheckConstraint("cutover_remaining >= 0", name="ck_defect_pool_bridge_remaining"),
    )
