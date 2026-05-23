"""BOM 변동량 감사."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Numeric, Text, func
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import Base

__all__ = ["VarianceLog"]


class VarianceLog(Base):
    __tablename__ = "variance_logs"

    var_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.item_id", ondelete="CASCADE"), nullable=False, index=True)
    bom_expected = Column(Numeric(15, 4), nullable=False)
    actual_used = Column(Numeric(15, 4), nullable=False)
    diff = Column(Numeric(15, 4), nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
