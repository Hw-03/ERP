"""Public shapes for explicit operator credentials; PIN and hash never echo."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.schemas.common import UtcDatetime


class OperatorSessionCreate(BaseModel):
    employee_id: uuid.UUID
    pin: str = Field(min_length=1, max_length=20)
    tab_id: str = Field(min_length=1, max_length=100)


class OperatorSessionIssued(BaseModel):
    token: str
    expires_at: UtcDatetime


class OperatorSessionCurrent(BaseModel):
    employee_id: uuid.UUID
    employee_code: str
    employee_name: str
    tab_id: str
    expires_at: UtcDatetime
