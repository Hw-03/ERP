"""Shared public stocktake fence for all saved work kinds."""
from typing import Literal
import uuid

from pydantic import BaseModel, Field

from app.schemas.common import UtcDatetime


class WorkStocktakePause(BaseModel):
    token: uuid.UUID
    round_id: uuid.UUID
    state: Literal["blocked", "ready"]
    paused_at: UtcDatetime
    pending_target_count: int = Field(ge=0)
    missing_target_count: int = Field(ge=0)
