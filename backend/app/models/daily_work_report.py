"""개인 일일 작업 일지 이력 모델."""

import uuid
from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, String, Text, UniqueConstraint, func

from app.models.base import Base, UUIDString

__all__ = ["DailyWorkReport"]


class DailyWorkReport(Base):
    __tablename__ = "daily_work_reports"

    report_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    work_date = Column(Date, nullable=False, index=True)
    employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    employee_name = Column(String(100), nullable=False)
    department = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("employee_id", "work_date", name="uq_daily_work_reports_employee_date"),
    )
