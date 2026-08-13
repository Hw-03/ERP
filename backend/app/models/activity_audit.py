"""사용자 작업 감사 이력 모델."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, String, Text, func

from app.models.base import Base, UUIDString

__all__ = ["AuditTerminal", "ActivityAuditLog"]


class AuditTerminal(Base):
    """관리자가 이름을 부여한 MES 접속 단말."""

    __tablename__ = "audit_terminals"

    terminal_id = Column(String(36), primary_key=True)
    name = Column(String(80), nullable=False)
    created_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )


class ActivityAuditLog(Base):
    """변경되지 않는 사용자 작업 스냅샷."""

    __tablename__ = "activity_audit_logs"

    audit_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    occurred_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
        index=True,
    )
    actor_employee_name = Column(String(100), nullable=True)
    actor_employee_code = Column(String(30), nullable=True, index=True)
    terminal_id = Column(String(36), nullable=True, index=True)
    terminal_name = Column(String(80), nullable=False, default="미등록 단말")
    source = Column(String(10), nullable=False)
    session_id = Column(String(120), nullable=True, index=True)
    screen_key = Column(String(120), nullable=True)
    screen_label = Column(String(120), nullable=True)
    action_key = Column(String(160), nullable=False)
    action_label = Column(String(120), nullable=False)
    outcome = Column(String(10), nullable=False, index=True)
    target_summary = Column(Text, nullable=True)
    request_id = Column(String(64), nullable=True)
    related_id = Column(String(120), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "source IN ('desktop', 'mobile')",
            name="ck_activity_audit_source",
        ),
        CheckConstraint(
            "outcome IN ('success', 'failed', 'cancelled')",
            name="ck_activity_audit_outcome",
        ),
    )
