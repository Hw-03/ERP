"""시스템 설정 키-값 저장."""

from datetime import datetime

from sqlalchemy import Column, DateTime, String, Text, func

from app.models.base import Base

__all__ = ["SystemSetting"]


class SystemSetting(Base):
    __tablename__ = "system_settings"

    setting_key = Column(String(100), primary_key=True)
    setting_value = Column(Text, nullable=False)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )
