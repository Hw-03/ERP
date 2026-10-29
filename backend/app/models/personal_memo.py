"""직원마다 현재 본문 하나만 보관하는 개인 메모."""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Text, func

from app.models.base import Base, UUIDString


class PersonalMemo(Base):
    __tablename__ = "personal_memos"

    employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="CASCADE"),
        primary_key=True,
    )
    content = Column(Text, nullable=False)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )
