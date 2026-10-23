"""Current stocktake pauses fence preserved work until an explicit resume."""
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, JSON, String, func

from app.models.base import Base, UUIDString


class StocktakeWorkPause(Base):
    """Delete the current token only after its work has resumed atomically."""

    __tablename__ = "stocktake_work_pauses"

    kind = Column(String(24), primary_key=True)
    work_id = Column(UUIDString, primary_key=True)
    round_id = Column(UUIDString, ForeignKey("stocktake_rounds.round_id", ondelete="RESTRICT"), nullable=False)
    token = Column(UUIDString, nullable=False, default=uuid.uuid4)
    required_cells = Column(JSON, nullable=False)
    paused_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())

    __table_args__ = (
        CheckConstraint("kind IN ('io', 'stock_request')", name="ck_stocktake_work_pause_kind"),
    )
