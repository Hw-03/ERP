"""입출고 2.0 배치/번들/라인."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
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
from sqlalchemy.orm import relationship

from app.models.base import Base, IntQuantity, UUIDString

__all__ = [
    "IoBatch",
    "IoBundle",
    "IoLine",
    "IoDraftReservation",
    "IoWorkReservationEvent",
]


class IoBatch(Base):
    """입출고 2.0 작업 묶음. 사용자가 한 번에 제출한 작업의 감사 단위."""

    __tablename__ = "io_batches"

    batch_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    work_type = Column(String(32), nullable=False, index=True)
    sub_type = Column(String(40), nullable=False, index=True)
    status = Column(String(24), nullable=False, default="draft", index=True)
    requester_employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    requester_name = Column(String(100), nullable=False)
    requester_department = Column(String(50), nullable=False)
    supplier_id = Column(
        UUIDString,
        ForeignKey("suppliers.supplier_id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    supplier_name_snapshot = Column(String(100), nullable=True)
    from_department = Column(String(50), nullable=True)
    to_department = Column(String(50), nullable=True)
    requires_approval = Column(Boolean, nullable=False, default=False)
    stock_request_id = Column(UUIDString, nullable=True, index=True)
    shipping_request_id = Column(
        UUIDString,
        ForeignKey("shipping_requests.request_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reference_no = Column(String(100), nullable=True, index=True)
    notes = Column(Text, nullable=True)
    reason_category = Column(String(100).with_variant(Text, "postgresql"), nullable=True)
    reason_category_id = Column(
        UUIDString,
        ForeignKey("defect_reason_categories.category_id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    client_request_id = Column(String(64), nullable=True, unique=True, index=True)
    revision = Column(Integer, nullable=False, default=0, server_default="0")
    reservation_status = Column(String(24), nullable=False, default="needs_reservation", server_default="needs_reservation", index=True)
    reservation_issue = Column(JSON, nullable=True)
    effective_plan = Column(JSON, nullable=True)
    creation_payload_hash = Column(String(64), nullable=True)
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
        CheckConstraint("revision >= 0", name="ck_io_batch_revision_nonneg"),
        CheckConstraint("reservation_status IN ('reserved', 'needs_reservation', 'not_required', 'inactive')", name="ck_io_batch_reservation_status"),
    )


class IoDraftReservation(Base):
    """현재 draft의 정상 재고 예약. 창고 위치는 빈 부서로 정규화한다."""

    __tablename__ = "io_draft_reservations"

    reservation_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    batch_id = Column(UUIDString, ForeignKey("io_batches.batch_id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="RESTRICT"), nullable=False, index=True)
    source_bucket = Column(String(20), nullable=False)
    source_department = Column(String(50), nullable=False, default="", server_default="")
    quantity = Column(IntQuantity, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("batch_id", "item_id", "source_bucket", "source_department", name="uq_io_draft_reservation_cell"),
        CheckConstraint("quantity > 0", name="ck_io_draft_reservation_quantity"),
        CheckConstraint("(source_bucket = 'warehouse' AND source_department = '') OR (source_bucket = 'production' AND source_department <> '' AND source_department = trim(source_department))", name="ck_io_draft_reservation_source"),
    )


class IoWorkReservationEvent(Base):
    """예약 명령의 주체와 원래/결과 버전을 같은 트랜잭션에 보존한다."""

    __tablename__ = "io_work_reservation_events"

    event_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    batch_id = Column(UUIDString, ForeignKey("io_batches.batch_id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(32), nullable=False)
    actor_employee_id = Column(UUIDString, ForeignKey("employees.employee_id", ondelete="SET NULL"), nullable=True)
    actor_name = Column(String(100), nullable=False)
    reason = Column(Text, nullable=True)
    from_revision = Column(Integer, nullable=False)
    to_revision = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())

    __table_args__ = (
        CheckConstraint("from_revision >= 0 AND to_revision > from_revision", name="ck_io_work_event_revisions"),
    )


class IoBundle(Base):
    """작업 기준 품목/패키지 하나에서 펼쳐진 실제 반영 라인 묶음."""

    __tablename__ = "io_bundles"

    bundle_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    batch_id = Column(
        UUIDString,
        ForeignKey("io_batches.batch_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_kind = Column(String(24), nullable=False)
    source_item_id = Column(
        UUIDString,
        ForeignKey("items.item_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title_snapshot = Column(String(220), nullable=False)
    quantity = Column(IntQuantity, nullable=False)
    expanded_level = Column(Integer, nullable=False, default=1)
    internal_use_bom_mode = Column(String(32), nullable=True)
    source_location = Column(String(20), nullable=True)
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

    line_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    bundle_id = Column(
        UUIDString,
        ForeignKey("io_bundles.bundle_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id = Column(
        UUIDString,
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
    quantity = Column(IntQuantity, nullable=False)
    bom_expected = Column(IntQuantity, nullable=True)
    bom_stock_exempt = Column(Boolean, nullable=False, default=False, server_default="0")
    bom_auto_token = Column(String(64), nullable=True)
    included = Column(Boolean, nullable=False, default=True)
    selected = Column(Boolean, nullable=False, default=True, server_default="1")
    origin = Column(String(24), nullable=False)
    edited = Column(Boolean, nullable=False, default=False)
    has_children_snapshot = Column(Boolean, nullable=False, default=False)
    shortage = Column(IntQuantity, nullable=False, default=0)
    exclusion_note = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())

    bundle = relationship("IoBundle", back_populates="lines")
    item = relationship("Item")

    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_io_line_qty_nonneg"),
        Index("ix_io_line_item_included", "item_id", "included"),
    )
