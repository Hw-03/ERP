"""결재 알림 (Notification).

수신자(직원)별로 쌓이는 영속 알림. 결재 요청 도착 → 승인 담당자(들),
승인/반려 → 요청자. 프론트는 30초 폴링으로 조회한다.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)

from app.models.base import Base, UUIDString

__all__ = ["Notification", "NotificationTypeEnum"]


class NotificationTypeEnum(str, enum.Enum):
    APPROVAL_REQUEST = "approval_request"    # 결재 요청 도착 → 승인 담당자
    APPROVAL_APPROVED = "approval_approved"  # 승인 완료 → 요청자
    APPROVAL_REJECTED = "approval_rejected"  # 반려 → 요청자


class Notification(Base):
    __tablename__ = "notifications"

    notification_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    recipient_employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # NotificationTypeEnum 값을 저장 (PG enum 회피 위해 단순 문자열).
    type = Column(String(32), nullable=False)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=True)
    # 클릭 시 이동할 화면. target_tab=상단 탭(예: 'warehouse'), target_section=입출고 섹션.
    target_tab = Column(String(32), nullable=True)
    target_section = Column(String(32), nullable=True)
    related_request_id = Column(
        UUIDString,
        ForeignKey("stock_requests.request_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    is_read = Column(Boolean, nullable=False, default=False, server_default="0", index=True)
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
        index=True,
    )

    __table_args__ = (
        Index("ix_notification_recipient_unread", "recipient_employee_id", "is_read"),
    )
