"""시스템 설정 키-값 저장."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    DateTime,
    Integer,
    String,
    Text,
    func,
)

from app.models.base import Base

__all__ = ["DataRevision", "SystemSetting"]


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


class DataRevision(Base):
    """Single row advanced atomically by every committed application session."""

    __tablename__ = "data_revision"
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_data_revision_singleton"),
    )

    id = Column(Integer, primary_key=True)
    revision = Column(BigInteger, nullable=False)
    updated_at = Column(DateTime, nullable=False, server_default=func.now())
