"""입출고 2.0 배치/번들/라인."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base

__all__ = [
    "IoBatch",
    "IoBundle",
    "IoLine",
]


class IoBatch(Base):
    """입출고 2.0 작업 묶음. 사용자가 한 번에 제출한 작업의 감사 단위."""

    __tablename__ = "io_batches"

    batch_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_type = Column(String(32), nullable=False, index=True)
    sub_type = Column(String(40), nullable=False, index=True)
    status = Column(String(24), nullable=False, default="draft", index=True)
    requester_employee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("employees.employee_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    requester_name = Column(String(100), nullable=False)
    requester_department = Column(String(50), nullable=False)
    from_department = Column(String(50), nullable=True)
    to_department = Column(String(50), nullable=True)
    requires_approval = Column(Boolean, nullable=False, default=False)
    stock_request_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    reference_no = Column(String(100), nullable=True, index=True)
    notes = Column(Text, nullable=True)
    client_request_id = Column(String(64), nullable=True, unique=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now(), index=True)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )
    submitted_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    bundles = relationship(
        "IoBundle",
        back_populates="batch",
        cascade="all, delete-orphan",
        order_by="IoBundle.created_at",
    )

    __table_args__ = (
        Index("ix_io_batches_requester_status", "requester_employee_id", "status"),
    )


class IoBundle(Base):
    """작업 기준 품목/패키지 하나에서 펼쳐진 실제 반영 라인 묶음."""

    __tablename__ = "io_bundles"

    bundle_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id = Column(
        UUID(as_uuid=True),
        ForeignKey("io_batches.batch_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_kind = Column(String(24), nullable=False)
    source_item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("items.item_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title_snapshot = Column(String(220), nullable=False)
    quantity = Column(Numeric(15, 4), nullable=False)
    expanded_level = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())

    batch = relationship("IoBatch", back_populates="bundles")
    lines = relationship(
        "IoLine",
        back_populates="bundle",
        cascade="all, delete-orphan",
        order_by="IoLine.created_at",
    )
    source_item = relationship("Item", foreign_keys=[source_item_id])


class IoLine(Base):
    """실제 재고 반영 후보 라인. excluded 라인도 감사 내역으로 남긴다."""

    __tablename__ = "io_lines"

    line_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bundle_id = Column(
        UUID(as_uuid=True),
        ForeignKey("io_bundles.bundle_id", ondelete="CASCADE"),
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
    mes_code_snapshot = Column(String(50), nullable=True)
    unit = Column(String(20), nullable=False, default="EA")
    direction = Column(String(20), nullable=False)
    from_bucket = Column(String(20), nullable=False)
    from_department = Column(String(50), nullable=True)
    to_bucket = Column(String(20), nullable=False)
    to_department = Column(String(50), nullable=True)
    quantity = Column(Numeric(15, 4), nullable=False)
    bom_expected = Column(Numeric(15, 4), nullable=True)
    included = Column(Boolean, nullable=False, default=True)
    origin = Column(String(24), nullable=False)
    edited = Column(Boolean, nullable=False, default=False)
    has_children_snapshot = Column(Boolean, nullable=False, default=False)
    shortage = Column(Numeric(15, 4), nullable=False, default=Decimal("0"))
    exclusion_note = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())

    bundle = relationship("IoBundle", back_populates="lines")
    item = relationship("Item")

    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_io_line_qty_nonneg"),
        Index("ix_io_line_item_included", "item_id", "included"),
    )
