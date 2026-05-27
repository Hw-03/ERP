"""재고 거래 로그 (TransactionLog) 및 수정 감사 (TransactionEditLog)."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base

__all__ = [
    "TransactionTypeEnum",
    "TransactionLog",
    "TransactionEditLog",
]


class TransactionTypeEnum(str, enum.Enum):
    RECEIVE = "RECEIVE"
    PRODUCE = "PRODUCE"
    SHIP = "SHIP"
    ADJUST = "ADJUST"
    BACKFLUSH = "BACKFLUSH"
    DISASSEMBLE = "DISASSEMBLE"
    TRANSFER_TO_PROD = "TRANSFER_TO_PROD"
    TRANSFER_TO_WH = "TRANSFER_TO_WH"
    TRANSFER_DEPT = "TRANSFER_DEPT"
    MARK_DEFECTIVE = "MARK_DEFECTIVE"
    UNMARK_DEFECTIVE = "UNMARK_DEFECTIVE"
    DEFECT_SCRAP = "DEFECT_SCRAP"
    SUPPLIER_RETURN = "SUPPLIER_RETURN"


class TransactionLog(Base):
    __tablename__ = "transaction_logs"

    log_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.item_id", ondelete="CASCADE"), nullable=False, index=True)
    transaction_type = Column(
        SAEnum(TransactionTypeEnum, name="transaction_type_enum", create_type=True),
        nullable=False,
        index=True,
    )
    quantity_change = Column(Numeric(15, 4), nullable=False)
    quantity_before = Column(Numeric(15, 4), nullable=True)
    quantity_after = Column(Numeric(15, 4), nullable=True)
    transfer_qty = Column(Numeric(15, 4), nullable=True)
    reference_no = Column(String(100), nullable=True, index=True)
    produced_by = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    # 불량 처리 흐름 — 사유 카테고리(외관/치수/기능/검사통과/기타) + 자유 메모.
    # 카테고리 enum 은 프론트 상수로만 정의, 백엔드는 자유 문자열로 받음.
    reason_category = Column(String(32), nullable=True, index=True)
    reason_memo = Column(Text, nullable=True)
    operation_batch_id = Column(
        UUID(as_uuid=True),
        ForeignKey("io_batches.batch_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    department = Column(String(50), nullable=True, index=True)
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
        index=True,
    )
    archived_at = Column(DateTime, nullable=True, index=True)

    item = relationship("Item", back_populates="transaction_logs")

    __table_args__ = (
        # 5.5-A: "품목 X 의 최근 거래 N건" / "기간 export" 쿼리 가속.
        Index("ix_tx_item_created", "item_id", "created_at"),
        # 창고/부서 탭 필터 쿼리 가속 (transaction_type IN (...) + 날짜 정렬).
        Index("ix_tx_type_created", "transaction_type", "created_at"),
        # operation_batch_id 기반 배치 그룹 조회 가속.
        Index("ix_tx_batch_created", "operation_batch_id", "created_at"),
    )


class TransactionEditLog(Base):
    """거래 수정 감사 이력. 메타데이터 수정(3차) + 수량 보정(4차) 모두 기록."""

    __tablename__ = "transaction_edit_logs"

    edit_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    original_log_id = Column(
        UUID(as_uuid=True),
        ForeignKey("transaction_logs.log_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    edited_by_employee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("employees.employee_id", ondelete="RESTRICT"),
        nullable=False,
    )
    edited_by_name = Column(String(100), nullable=False)  # 스냅샷 — 직원 비활성/이름 변경 후에도 보존
    reason = Column(Text, nullable=False)  # 필수
    before_payload = Column(Text, nullable=False)  # JSON 스냅샷
    after_payload = Column(Text, nullable=False)  # JSON 스냅샷
    correction_log_id = Column(
        UUID(as_uuid=True),
        ForeignKey("transaction_logs.log_id", ondelete="SET NULL"),
        nullable=True,
    )  # 4차 수량 보정 시 생성된 ADJUST 거래 참조
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
