"""Shipping request models."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.models.base import Base, IntQuantity, UUIDString

__all__ = [
    "ShippingRequest",
    "ShippingRequestBomLine",
    "ShippingRequestChecklistLine",
    "ShippingRequestCompanionLine",
    "ShippingRequestEvent",
    "ShippingRequestStatusEnum",
]


class ShippingRequestStatusEnum(str, enum.Enum):
    REQUESTED = "REQUESTED"
    PREPARING = "PREPARING"
    PREPARED = "PREPARED"
    PICKED_UP = "PICKED_UP"


class ShippingRequest(Base):
    __tablename__ = "shipping_requests"

    request_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    status = Column(
        SAEnum(ShippingRequestStatusEnum, name="shipping_request_status_enum", create_type=True),
        nullable=False,
        default=ShippingRequestStatusEnum.REQUESTED,
        server_default=ShippingRequestStatusEnum.REQUESTED.value,
        index=True,
    )
    base_pf_item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="RESTRICT"), nullable=False, index=True)
    final_pa_item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="SET NULL"), nullable=True, index=True)
    final_pf_item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="SET NULL"), nullable=True, index=True)
    request_quantity = Column(IntQuantity, nullable=False, default=1, server_default="1")
    requested_by_name = Column(String(100), nullable=True)
    custom_pa_name = Column(String(200), nullable=True)
    custom_pf_name = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)
    prepared_at = Column(DateTime, nullable=True, index=True)
    picked_up_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now(), index=True)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    base_pf_item = relationship("Item", foreign_keys=[base_pf_item_id])
    final_pa_item = relationship("Item", foreign_keys=[final_pa_item_id])
    final_pf_item = relationship("Item", foreign_keys=[final_pf_item_id])
    bom_lines = relationship(
        "ShippingRequestBomLine",
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="ShippingRequestBomLine.sort_order",
    )
    companion_lines = relationship(
        "ShippingRequestCompanionLine",
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="ShippingRequestCompanionLine.sort_order",
    )
    checklist_lines = relationship(
        "ShippingRequestChecklistLine",
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="ShippingRequestChecklistLine.sort_order",
    )
    events = relationship(
        "ShippingRequestEvent",
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="ShippingRequestEvent.created_at",
    )


class ShippingRequestBomLine(Base):
    __tablename__ = "shipping_request_bom_lines"

    line_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    request_id = Column(UUIDString, ForeignKey("shipping_requests.request_id", ondelete="CASCADE"), nullable=False, index=True)
    parent_stage = Column(String(2), nullable=False, index=True)
    child_item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity = Column(IntQuantity, nullable=False)
    unit = Column(String(20), nullable=False, default="EA")
    included = Column(Boolean, nullable=False, default=True, server_default="1")
    origin = Column(String(20), nullable=False, default="CUSTOM", server_default="CUSTOM")
    sort_order = Column(IntQuantity, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())

    request = relationship("ShippingRequest", back_populates="bom_lines")
    child_item = relationship("Item")

    __table_args__ = (
        UniqueConstraint("request_id", "parent_stage", "child_item_id", name="uq_shipping_bom_line"),
        Index("ix_shipping_bom_req_stage", "request_id", "parent_stage"),
    )


class ShippingRequestCompanionLine(Base):
    __tablename__ = "shipping_request_companion_lines"

    line_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    request_id = Column(UUIDString, ForeignKey("shipping_requests.request_id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity = Column(IntQuantity, nullable=False)
    unit = Column(String(20), nullable=False, default="EA")
    sort_order = Column(IntQuantity, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())

    request = relationship("ShippingRequest", back_populates="companion_lines")
    item = relationship("Item")


class ShippingRequestChecklistLine(Base):
    __tablename__ = "shipping_request_checklist_lines"

    line_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    request_id = Column(UUIDString, ForeignKey("shipping_requests.request_id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="RESTRICT"), nullable=False, index=True)
    label_snapshot = Column(String(200), nullable=False)
    quantity = Column(IntQuantity, nullable=False, default=1)
    checked = Column(Boolean, nullable=False, default=False, server_default="0")
    sort_order = Column(IntQuantity, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())

    request = relationship("ShippingRequest", back_populates="checklist_lines")
    item = relationship("Item")

    __table_args__ = (
        UniqueConstraint("request_id", "item_id", name="uq_shipping_checklist_item"),
    )


class ShippingRequestEvent(Base):
    __tablename__ = "shipping_request_events"

    event_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    request_id = Column(UUIDString, ForeignKey("shipping_requests.request_id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(40), nullable=False, index=True)
    message = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now(), index=True)

    request = relationship("ShippingRequest", back_populates="events")
