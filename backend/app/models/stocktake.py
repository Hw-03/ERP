"""Prepared target sets and versioned counts; immutable evidence survives release."""
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func

from app.models.base import Base, UUIDString


class StocktakeRound(Base):
    __tablename__ = "stocktake_rounds"
    round_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    title = Column(String(120), nullable=False)
    status = Column(String(20), nullable=False, default="ACTIVE")
    epoch = Column(Integer, nullable=False)
    target_generation = Column(Integer, nullable=False, default=1, server_default="1")
    started_by = Column(UUIDString, ForeignKey("employees.employee_id", ondelete="RESTRICT"), nullable=False)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    closed_at = Column(DateTime)
    __table_args__ = (CheckConstraint("status IN ('ACTIVE','CLOSED_FULL','CLOSED_PARTIAL')", name="ck_stocktake_round_status"),)


class StocktakePreview(Base):
    """A sealed, expiring proposal, never evidence that inventory was applied."""
    __tablename__ = "stocktake_previews"
    preview_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    kind = Column(String(30), nullable=False)
    round_id = Column(UUIDString, ForeignKey("stocktake_rounds.round_id", ondelete="RESTRICT"))
    actor_id = Column(UUIDString, ForeignKey("employees.employee_id", ondelete="RESTRICT"), nullable=False)
    payload = Column(JSON, nullable=False)
    preview_hash = Column(String(64), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    expires_at = Column(DateTime, nullable=False)


class StocktakeTargetSet(Base):
    """Targets are inserted before activation; one pointer publishes the whole set."""
    __tablename__ = "stocktake_target_sets"
    set_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    preview_id = Column(UUIDString, ForeignKey("stocktake_previews.preview_id", ondelete="RESTRICT"), nullable=False, unique=True)
    round_id = Column(UUIDString, ForeignKey("stocktake_rounds.round_id", ondelete="RESTRICT"), index=True)
    activated_at = Column(DateTime)


class StocktakeTarget(Base):
    __tablename__ = "stocktake_targets"
    target_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    set_id = Column(UUIDString, ForeignKey("stocktake_target_sets.set_id", ondelete="RESTRICT"), nullable=False, index=True)
    item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="RESTRICT"), nullable=False)
    scope_key = Column(String(80), ForeignKey("inventory_scopes.scope_key", ondelete="RESTRICT"), nullable=False)
    item_code = Column(String(40))
    item_name = Column(String(200), nullable=False)
    unit = Column(String(20), nullable=False)
    scope_name = Column(String(50), nullable=False)
    version = Column(Integer, nullable=False, default=0, server_default="0")
    latest_count_id = Column(UUIDString)
    __table_args__ = (UniqueConstraint("set_id", "item_id", "scope_key", name="uq_stocktake_set_cell"), Index("ix_stocktake_target_cell", "item_id", "scope_key"))


class StocktakeCount(Base):
    __tablename__ = "stocktake_counts"
    count_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    round_id = Column(UUIDString, ForeignKey("stocktake_rounds.round_id", ondelete="RESTRICT"), nullable=False, index=True)
    target_id = Column(UUIDString, ForeignKey("stocktake_targets.target_id", ondelete="RESTRICT"), nullable=False, index=True)
    owner_id = Column(UUIDString, ForeignKey("employees.employee_id", ondelete="RESTRICT"), nullable=False)
    owner_name = Column(String(100), nullable=False)
    previous_count_id = Column(UUIDString, ForeignKey("stocktake_counts.count_id", ondelete="RESTRICT"))
    status = Column(String(16), nullable=False, default="DRAFT")
    version = Column(Integer, nullable=False, default=1, server_default="1")
    fence = Column(Integer, nullable=False)
    quantity_revision = Column(Integer, nullable=False)
    quantities = Column(JSON, nullable=False)
    baseline = Column(JSON, nullable=False)
    confirmation_revision_id = Column(UUIDString)
    confirmed_at = Column(DateTime)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    __table_args__ = (CheckConstraint("status IN ('DRAFT','CONFIRMED','APPLIED','ABANDONED')", name="ck_stocktake_count_status"),)


class StocktakeEvent(Base):
    """Append-only revisions include the confirmation invalidated by a release."""
    __tablename__ = "stocktake_events"
    event_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    round_id = Column(UUIDString, ForeignKey("stocktake_rounds.round_id", ondelete="RESTRICT"), nullable=False, index=True)
    count_id = Column(UUIDString, ForeignKey("stocktake_counts.count_id", ondelete="RESTRICT"), index=True)
    kind = Column(String(40), nullable=False)
    actor_id = Column(UUIDString, ForeignKey("employees.employee_id", ondelete="RESTRICT"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())


class StocktakeReceipt(Base):
    """An uncommitted claim serializes duplicate commands; completed rows are frozen."""
    __tablename__ = "stocktake_receipts"
    receipt_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    actor_id = Column(UUIDString, ForeignKey("employees.employee_id", ondelete="RESTRICT"), nullable=False)
    command_kind = Column(String(40), nullable=False)
    idempotency_key = Column(String(128), nullable=False)
    request_hash = Column(String(64), nullable=False)
    response = Column(JSON)
    completed_at = Column(DateTime)
    __table_args__ = (UniqueConstraint("actor_id", "command_kind", "idempotency_key", name="uq_stocktake_command_receipt"),)


class StocktakePendingTarget(Base):
    """Once discovered, a candidate remains visible even if later deactivated."""
    __tablename__ = "stocktake_pending_targets"
    round_id = Column(UUIDString, ForeignKey("stocktake_rounds.round_id", ondelete="RESTRICT"), primary_key=True)
    item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="RESTRICT"), primary_key=True)
    scope_key = Column(String(80), ForeignKey("inventory_scopes.scope_key", ondelete="RESTRICT"), primary_key=True)
    snapshot = Column(JSON, nullable=False)
    discovered_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())


class StocktakeApplication(Base):
    __tablename__ = "stocktake_applications"
    application_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    round_id = Column(UUIDString, ForeignKey("stocktake_rounds.round_id", ondelete="RESTRICT"), nullable=False, index=True)
    preview_id = Column(UUIDString, ForeignKey("stocktake_previews.preview_id", ondelete="RESTRICT"), nullable=False, unique=True)
    operation_id = Column(UUIDString, ForeignKey("inventory_operations.operation_id", ondelete="RESTRICT"), nullable=False, unique=True)
    actor_id = Column(UUIDString, ForeignKey("employees.employee_id", ondelete="RESTRICT"), nullable=False)
    scope_key = Column(String(80), ForeignKey("inventory_scopes.scope_key", ondelete="RESTRICT"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())


class StocktakeApplicationLine(Base):
    """Typed immutable stock observation, including lines whose four deltas are zero."""
    __tablename__ = "stocktake_application_lines"
    application_id = Column(UUIDString, ForeignKey("stocktake_applications.application_id", ondelete="RESTRICT"), primary_key=True)
    count_id = Column(UUIDString, ForeignKey("stocktake_counts.count_id", ondelete="RESTRICT"), primary_key=True)
    confirmation_revision_id = Column(UUIDString, ForeignKey("stocktake_events.event_id", ondelete="RESTRICT"), nullable=False, unique=True)
    item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="RESTRICT"), nullable=False)
    scope_key = Column(String(80), ForeignKey("inventory_scopes.scope_key", ondelete="RESTRICT"), nullable=False)
    before_quantities = Column(JSON, nullable=False)
    after_quantities = Column(JSON, nullable=False)
    reservations = Column(JSON, nullable=False)
    observation_epoch_before = Column(Integer, nullable=False)
    observation_epoch_after = Column(Integer, nullable=False)
    __table_args__ = (CheckConstraint("observation_epoch_after = observation_epoch_before + 1 AND observation_epoch_before >= 0", name="ck_stocktake_application_epoch"),)


class StocktakeEffectEpoch(Base):
    """Immutable epoch of each new log or category movement; old effects imply zero."""
    __tablename__ = "stocktake_effect_epochs"
    source_kind = Column(String(20), primary_key=True)
    source_id = Column(UUIDString, primary_key=True)
    scope_key = Column(String(80), ForeignKey("inventory_scopes.scope_key", ondelete="RESTRICT"), primary_key=True)
    item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="RESTRICT"), nullable=False)
    observation_epoch = Column(Integer, nullable=False)
    __table_args__ = (CheckConstraint("source_kind IN ('transaction','pool_movement') AND observation_epoch >= 0", name="ck_stocktake_effect_epoch"),)
