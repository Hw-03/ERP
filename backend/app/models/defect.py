"""불량 격리 건별 원장과 메모 감사 이력."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
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
    "DefectQuarantineRecord",
    "DefectQuarantineMemoRevision",
    "DefectQuarantineReconstruction",
    "DefectQuarantineReconstructionAllocation",
]


class DefectQuarantineRecord(Base):
    """한 번의 격리 명령에서 생긴 수량을 독립적으로 추적한다."""

    __tablename__ = "defect_quarantine_records"

    record_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    item_id = Column(
        UUIDString,
        ForeignKey("items.item_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    department = Column(String(50), nullable=False, index=True)
    original_quantity = Column(IntQuantity, nullable=False)
    remaining_quantity = Column(IntQuantity, nullable=False)
    quarantined_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now(), index=True)
    quarantined_by_employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    quarantined_by_name = Column(String(100), nullable=True)
    reason_category = Column(String(32), nullable=True)
    current_memo = Column(Text, nullable=True)
    is_legacy = Column(Boolean, nullable=False, default=False, server_default="0")
    legacy_location_id = Column(
        UUIDString,
        ForeignKey("inventory_locations.location_id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    memo_revisions = relationship(
        "DefectQuarantineMemoRevision",
        back_populates="record",
        cascade="all, delete-orphan",
        order_by="DefectQuarantineMemoRevision.edited_at",
    )

    __table_args__ = (
        CheckConstraint("original_quantity > 0", name="ck_defect_record_original_positive"),
        CheckConstraint("remaining_quantity >= 0", name="ck_defect_record_remaining_nonnegative"),
        CheckConstraint(
            "remaining_quantity <= original_quantity",
            name="ck_defect_record_remaining_le_original",
        ),
        Index(
            "ix_defect_record_item_dept_active",
            "item_id",
            "department",
            "remaining_quantity",
        ),
    )


class DefectQuarantineMemoRevision(Base):
    """격리 메모의 최초 등록과 변경 전후 값을 보존한다."""

    __tablename__ = "defect_quarantine_memo_revisions"

    revision_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    record_id = Column(
        UUIDString,
        ForeignKey("defect_quarantine_records.record_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    previous_memo = Column(Text, nullable=True)
    next_memo = Column(Text, nullable=True)
    edited_by_employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="SET NULL"),
        nullable=True,
    )
    edited_by_name = Column(String(100), nullable=False)
    edited_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    is_initial = Column(Boolean, nullable=False, default=False, server_default="0")

    record = relationship("DefectQuarantineRecord", back_populates="memo_revisions")


class DefectQuarantineReconstruction(Base):
    """거래 로그에서 복원한 자식 기록의 부모와 원본 격리 거래를 보존한다."""

    __tablename__ = "defect_quarantine_reconstructions"

    child_record_id = Column(
        UUIDString,
        ForeignKey("defect_quarantine_records.record_id", ondelete="CASCADE"),
        primary_key=True,
    )
    parent_record_id = Column(
        UUIDString,
        ForeignKey("defect_quarantine_records.record_id", ondelete="RESTRICT"),
        nullable=False,
    )
    source_transaction_log_id = Column(
        UUIDString,
        ForeignKey("transaction_logs.log_id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    reconstructed_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "child_record_id <> parent_record_id",
            name="ck_defect_reconstruction_distinct_records",
        ),
        Index("ix_defect_reconstruction_parent", "parent_record_id"),
    )


class DefectQuarantineReconstructionAllocation(Base):
    """과거 불량 차감 거래를 복원 자식에 FIFO로 배분한 감사 원장."""

    __tablename__ = "defect_quarantine_reconstruction_allocations"

    allocation_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    transaction_log_id = Column(
        UUIDString,
        ForeignKey("transaction_logs.log_id", ondelete="RESTRICT"),
        nullable=False,
    )
    record_id = Column(
        UUIDString,
        ForeignKey("defect_quarantine_records.record_id", ondelete="RESTRICT"),
        nullable=False,
    )
    quantity = Column(IntQuantity, nullable=False)
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "quantity > 0",
            name="ck_defect_reconstruction_allocation_positive",
        ),
        UniqueConstraint(
            "transaction_log_id",
            "record_id",
            name="uq_defect_reconstruction_allocation_log_record",
        ),
        Index(
            "ix_defect_reconstruction_allocation_log",
            "transaction_log_id",
        ),
        Index(
            "ix_defect_reconstruction_allocation_record",
            "record_id",
        ),
    )
