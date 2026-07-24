"""Assembly checklist templates linked to existing product model slots."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, SmallInteger, String, Text, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.models.base import Base, IntQuantity, UUIDString

__all__ = [
    "AssemblyChecklist",
    "AssemblyChecklistSection",
    "AssemblyChecklistItem",
]


class AssemblyChecklist(Base):
    """One mobile assembly checklist per existing MES product model."""

    __tablename__ = "assembly_checklists"

    checklist_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    model_slot = Column(
        SmallInteger,
        ForeignKey("product_symbols.slot", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    model = relationship("ProductSymbol")
    sections = relationship(
        "AssemblyChecklistSection",
        back_populates="checklist",
        cascade="all, delete-orphan",
        order_by="AssemblyChecklistSection.sort_order",
    )

    __table_args__ = (
        UniqueConstraint("model_slot", name="uq_assembly_checklists_model_slot"),
    )


class AssemblyChecklistSection(Base):
    """Named grouping of checklist items; legacy templates may have no title."""

    __tablename__ = "assembly_checklist_sections"

    section_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    checklist_id = Column(
        UUIDString,
        ForeignKey("assembly_checklists.checklist_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(80), nullable=True)
    sort_order = Column(IntQuantity, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())

    checklist = relationship("AssemblyChecklist", back_populates="sections")
    items = relationship(
        "AssemblyChecklistItem",
        back_populates="section",
        cascade="all, delete-orphan",
        order_by="AssemblyChecklistItem.sort_order",
    )


class AssemblyChecklistItem(Base):
    """One ordered read-only checklist instruction inside a section."""

    __tablename__ = "assembly_checklist_items"

    item_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    section_id = Column(
        UUIDString,
        ForeignKey("assembly_checklist_sections.section_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content = Column(Text, nullable=False)
    sort_order = Column(IntQuantity, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())

    section = relationship("AssemblyChecklistSection", back_populates="items")
