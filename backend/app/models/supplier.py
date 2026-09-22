"""원자재 입고 공급업체 마스터."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String, func

from app.models.base import Base, UUIDString

__all__ = ["Supplier"]


class Supplier(Base):
    """입고 당시 이름 스냅샷의 기준이 되는 활성/숨김 공급업체."""

    __tablename__ = "suppliers"

    supplier_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    normalized_name = Column(String(100), nullable=False, unique=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="1", index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())
