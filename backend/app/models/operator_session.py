"""서버가 발급한 작업자·최초 PIN 변경 세션."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, String

from app.models.base import Base, UUIDString


class OperatorSession(Base):
    __tablename__ = "operator_sessions"

    session_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    token_hash = Column(String(64), nullable=False)
    employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="CASCADE"),
        nullable=False,
    )
    purpose = Column(String(20), nullable=False)
    issued_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    consumed_at = Column(DateTime, nullable=True)
    boot_id = Column(String(64), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "purpose IN ('operator', 'pin_change')",
            name="ck_operator_sessions_purpose",
        ),
        Index("uq_operator_sessions_token_hash", "token_hash", unique=True),
        Index(
            "ix_operator_sessions_employee_purpose_revoked",
            "employee_id",
            "purpose",
            "revoked_at",
        ),
        Index("ix_operator_sessions_expires_at", "expires_at"),
    )
