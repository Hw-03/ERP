"""Reviewable corrections preserve original quantity effects and immutable lineage."""
from datetime import datetime
import uuid

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDString


class BusinessCorrection(Base):
    __tablename__ = "business_corrections"
    correction_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    source_type = Column(String(40), nullable=False)
    source_id = Column(UUIDString, nullable=False)
    atomic_group_key = Column(String(160), nullable=False, index=True)
    scope = Column(JSON, nullable=False)
    scope_hash = Column(String(64), nullable=False)
    target_status = Column(String(20), nullable=False)
    reason = Column(Text, nullable=False)
    evidence = Column(Text, nullable=False)
    requester_id = Column(UUIDString, ForeignKey("employees.employee_id", ondelete="RESTRICT"), nullable=False)
    requester_name = Column(String(100), nullable=False)
    status = Column(String(20), nullable=False, default="REQUESTED")
    version = Column(Integer, nullable=False, default=1, server_default="1")
    application_operation_id = Column(UUIDString, ForeignKey("inventory_operations.operation_id", ondelete="RESTRICT"), unique=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    decided_at = Column(DateTime)
    __table_args__ = (CheckConstraint("status IN ('REQUESTED','APPLIED','REJECTED','WITHDRAWN')", name="ck_business_correction_status"),)


class BusinessCorrectionEvent(Base):
    __tablename__ = "business_correction_events"
    event_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    correction_id = Column(UUIDString, ForeignKey("business_corrections.correction_id", ondelete="RESTRICT"), nullable=False, index=True)
    kind = Column(String(30), nullable=False)
    actor_id = Column(UUIDString, ForeignKey("employees.employee_id", ondelete="RESTRICT"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())


class BusinessCorrectionSource(Base):
    """A legacy log remains claimed even if later attached to a native operation."""
    __tablename__ = "business_correction_sources"
    source_kind = Column(String(30), primary_key=True)
    source_id = Column(UUIDString, primary_key=True)
    correction_id = Column(UUIDString, ForeignKey("business_corrections.correction_id", ondelete="RESTRICT"), nullable=False, index=True)
    __table_args__ = (CheckConstraint("source_kind IN ('operation','workflow_operation','transaction','allocation','pool_movement','workflow_effect')", name="ck_business_correction_source"),)


class BusinessCorrectionEffectLink(Base):
    """Explicit causal order between original and corrected nonphysical effects."""
    __tablename__ = "business_correction_effect_links"
    source_effect_id = Column(UUIDString, ForeignKey("inventory_operation_effects.effect_id", ondelete="RESTRICT"), primary_key=True)
    correction_effect_id = Column(UUIDString, ForeignKey("inventory_operation_effects.effect_id", ondelete="RESTRICT"), nullable=False)
    correction_id = Column(UUIDString, ForeignKey("business_corrections.correction_id", ondelete="RESTRICT"), nullable=False, index=True)


class StocktakeReservationEpoch(Base):
    """Reservation-only shipping preparation must also precede the cited observation."""
    __tablename__ = "stocktake_reservation_epochs"
    allocation_id = Column(UUIDString, ForeignKey("shipping_allocations.allocation_id", ondelete="RESTRICT"), primary_key=True)
    item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="RESTRICT"), nullable=False)
    scope_key = Column(String(80), ForeignKey("inventory_scopes.scope_key", ondelete="RESTRICT"), nullable=False)
    observation_epoch = Column(Integer, nullable=False)
    allocation = relationship("ShippingAllocation")
    __table_args__ = (CheckConstraint("observation_epoch >= 0", name="ck_stocktake_reservation_epoch"),)
