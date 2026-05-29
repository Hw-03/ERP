"""관리자 액션 감사 로그."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import Base

__all__ = ["AdminAuditLog"]


class AdminAuditLog(Base):
    """관리자 액션 감사로그.

    재고 변동(입출고/이동/불량/공급사반품/생산/큐)은 TransactionLog 가 본질적 audit 이고,
    이 표는 그 외의 마스터/설정 변경 (item·employee·bom·settings·codes) 만 기록한다.
    """
    __tablename__ = "admin_audit_logs"

    audit_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_pin_role = Column(String(32), nullable=False, default="admin")
    # 사번 — request.state.actor_emp 가 PIN 검증 후 박힌 직원 코드 (PR-C).
    # NULL = 사번 부착 없이 admin PIN 만으로 실행된 액션 (예: 백필 스크립트).
    actor_employee_code = Column(String(16), nullable=True, index=True)
    action = Column(String(64), nullable=False, index=True)
    target_type = Column(String(64), nullable=False, index=True)
    target_id = Column(String(64), nullable=True)
    payload_summary = Column(Text, nullable=True)
    request_id = Column(String(32), nullable=True, index=True)
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.now(),
        index=True,
    )
