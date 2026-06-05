"""튜브→고압/진공 인수인계서 (HandoverDoc / HandoverLine).

튜브 담당자가 앱에서 작성·제출하면, 인수 부서(고압/진공) 담당자가 PIN 으로
'인수 확인'을 한다. 인수 확인 시 품목 수량만큼 튜브→인수부서 PRODUCTION 이동.
시리얼 추적이 없으므로 분석내용(시리얼 목록)은 문서용 자유텍스트, 실제 이동은
품목+수량 라인으로만 처리한다.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from app.models.base import Base, IntQuantity, UUIDString

__all__ = ["HandoverStatusEnum", "HandoverDoc", "HandoverLine"]


class HandoverStatusEnum(str, enum.Enum):
    DRAFT = "draft"          # 작성 중(임시저장)
    SUBMITTED = "submitted"  # 제출됨 — 인수 부서 확인 대기
    RECEIVED = "received"    # 인수 확인 완료 — 재고 이동됨


class HandoverDoc(Base):
    __tablename__ = "handovers"

    handover_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    handover_code = Column(String(40), unique=True, nullable=True, index=True)
    status = Column(
        SAEnum(HandoverStatusEnum, name="handover_status_enum", create_type=True),
        nullable=False,
        default=HandoverStatusEnum.DRAFT,
        index=True,
    )
    # 작성자(튜브) / 인수부서(고압·진공)
    author_employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    author_name = Column(String(100), nullable=False)
    from_department = Column(String(50), nullable=False, default="튜브")
    to_department = Column(String(50), nullable=False)
    # 양식 필드 (이미지 기준)
    title = Column(String(200), nullable=False)
    process_content = Column(Text, nullable=True)     # 공정 내용
    product_name = Column(String(200), nullable=True)  # 제품명/적용 범위
    doc_date = Column(DateTime, nullable=True)         # 작성 날짜
    analysis_text = Column(Text, nullable=True)        # 분석 내용(시리얼/품목 자유 목록)
    notes = Column(Text, nullable=True)               # 비고
    # 인수 확인 정보
    received_by_employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="SET NULL"),
        nullable=True,
    )
    received_by_name = Column(String(100), nullable=True)
    received_at = Column(DateTime, nullable=True)
    created_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now(), index=True
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    lines = relationship(
        "HandoverLine",
        back_populates="handover",
        cascade="all, delete-orphan",
        order_by="HandoverLine.created_at",
    )


class HandoverLine(Base):
    __tablename__ = "handover_lines"

    line_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    handover_id = Column(
        UUIDString,
        ForeignKey("handovers.handover_id", ondelete="CASCADE"),
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
    created_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )

    __table_args__ = (CheckConstraint("quantity > 0", name="ck_handover_line_qty_pos"),)

    handover = relationship("HandoverDoc", back_populates="lines")
    item = relationship("Item")
