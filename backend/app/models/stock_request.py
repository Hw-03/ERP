"""입출고 결재 요청 (StockRequest / StockRequestLine)."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from app.models.base import Base, IntQuantity, UUIDString

__all__ = [
    "StockRequestStatusEnum",
    "StockRequestTypeEnum",
    "RequestBucketEnum",
    "StockRequest",
    "StockRequestLine",
]


class StockRequestStatusEnum(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    RESERVED = "reserved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    FAILED_APPROVAL = "failed_approval"


class StockRequestTypeEnum(str, enum.Enum):
    RAW_RECEIVE = "raw_receive"
    RAW_SHIP = "raw_ship"
    WAREHOUSE_TO_DEPT = "warehouse_to_dept"
    DEPT_TO_WAREHOUSE = "dept_to_warehouse"
    DEPT_INTERNAL = "dept_internal"
    MARK_DEFECTIVE_WH = "mark_defective_wh"
    MARK_DEFECTIVE_PROD = "mark_defective_prod"
    SUPPLIER_RETURN = "supplier_return"
    PACKAGE_OUT = "package_out"
    INTERNAL_USE = "internal_use"
    # 낱개(manual/adjust_in/adjust_out) 라인 포함 IO — 부서 결재 정/부 승인만 필요.
    # 실제 재고 변동은 io.py 의 _submit_immediate 가 dept 승인 후 실행한다.
    MANUAL_ADJUSTMENT = "manual_adjustment"
    # 불량 처리 흐름 — 격리 항목 결재 필요 액션 (Phase 2)
    DEFECT_SCRAP = "defect_scrap"           # 격리 항목 폐기
    DEFECT_RETURN = "defect_return"         # 격리 항목 공급처 반품
    DEFECT_DISASSEMBLE = "defect_disassemble"  # PA·PF 격리 항목 분해
    # R 정상 재고 바로 처리 — 격리 미경유, 정상(창고/부서) 재고에서 곧장 처리
    SCRAP_NORMAL = "scrap_normal"           # 정상 재고 바로 폐기
    RETURN_NORMAL = "return_normal"         # 정상 재고 바로 공급처 반품
    REWORK_NORMAL = "rework_normal"         # 정상 재고 바로 재작업


class RequestBucketEnum(str, enum.Enum):
    WAREHOUSE = "warehouse"
    PRODUCTION = "production"
    DEFECTIVE = "defective"
    NONE = "none"


class StockRequest(Base):
    """입출고 결재 요청. 창고 재고가 움직이는 작업은 승인 후에만 실재고 반영."""

    __tablename__ = "stock_requests"

    request_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    request_code = Column(String(40), unique=True, nullable=True, index=True)
    client_request_id = Column(String(64), unique=True, nullable=True, index=True)
    requester_employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    requester_name = Column(String(100), nullable=False)
    requester_department = Column(String(50), nullable=False)
    request_type = Column(
        SAEnum(StockRequestTypeEnum, name="stock_request_type_enum", create_type=True),
        nullable=False,
        index=True,
    )
    status = Column(
        SAEnum(StockRequestStatusEnum, name="stock_request_status_enum", create_type=True),
        nullable=False,
        default=StockRequestStatusEnum.SUBMITTED,
        index=True,
    )
    requires_warehouse_approval = Column(Boolean, nullable=False, default=True)
    reserved_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    approved_by_employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_by_name = Column(String(100), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    rejected_by_employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="SET NULL"),
        nullable=True,
    )
    rejected_by_name = Column(String(100), nullable=True)
    rejected_at = Column(DateTime, nullable=True)
    rejected_reason = Column(Text, nullable=True)  # FAILED_APPROVAL 사유도 여기 저장
    # 부서 결재 (낱개 manual/adjust 라인 포함 시 추가로 요구). warehouse_approval 와 독립적.
    requires_department_approval = Column(Boolean, nullable=False, default=False, server_default="0")
    department_approved_by_employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="SET NULL"),
        nullable=True,
    )
    department_approved_by_name = Column(String(100), nullable=True)
    department_approved_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    reference_no = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    reason_category = Column(String(50), nullable=True)
    reason_memo = Column(Text, nullable=True)
    operation_batch_id = Column(
        UUIDString,
        ForeignKey("io_batches.batch_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now(), index=True)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    lines = relationship(
        "StockRequestLine",
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="StockRequestLine.created_at",
    )


class StockRequestLine(Base):
    __tablename__ = "stock_request_lines"

    line_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    request_id = Column(
        UUIDString,
        ForeignKey("stock_requests.request_id", ondelete="CASCADE"),
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
    quantity = Column(IntQuantity, nullable=False)
    from_bucket = Column(
        SAEnum(RequestBucketEnum, name="request_bucket_enum", create_type=True),
        nullable=False,
    )
    from_department = Column(String(50), nullable=True)
    to_bucket = Column(
        SAEnum(RequestBucketEnum, name="request_bucket_enum", create_type=False),
        nullable=False,
    )
    to_department = Column(String(50), nullable=True)
    status = Column(
        SAEnum(StockRequestStatusEnum, name="stock_request_status_enum", create_type=False),
        nullable=False,
        default=StockRequestStatusEnum.SUBMITTED,
    )
    operation_line_id = Column(
        UUIDString,
        ForeignKey("io_lines.line_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())

    request = relationship("StockRequest", back_populates="lines")
    item = relationship("Item")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_stock_request_line_qty_positive"),
        Index("ix_stock_request_line_item_status", "item_id", "status"),
    )
