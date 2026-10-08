"""원자재 입출고 공급업체 마스터."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, String, UniqueConstraint, func

from app.models.base import Base, UUIDString

__all__ = ["Supplier"]


class Supplier(Base):
    """입출고 당시 이름 스냅샷의 기준이 되는 활성/숨김 공급업체."""

    __tablename__ = "suppliers"
    __table_args__ = (
        UniqueConstraint("scope", "normalized_name", name="uq_suppliers_scope_normalized_name"),
        CheckConstraint("scope IN ('warehouse', 'tube')", name="ck_suppliers_scope"),
    )

    supplier_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    normalized_name = Column(String(100), nullable=False)
    scope = Column(String(20), nullable=False, default="warehouse", server_default="warehouse")
    is_active = Column(Boolean, nullable=False, default=True, server_default="1", index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())
