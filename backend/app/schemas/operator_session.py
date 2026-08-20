"""작업자 세션 API schema."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.schemas.common import UtcDatetime
from app.schemas.employee import EmployeeResponse


class OperatorSessionLoginRequest(BaseModel):
    employee_id: uuid.UUID
    pin: str = Field(..., min_length=4, max_length=4, pattern=r"^[0-9]{4}$")


class OperatorPinChangeCompleteRequest(BaseModel):
    employee_id: uuid.UUID
    new_pin: str = Field(..., min_length=4, max_length=4, pattern=r"^[0-9]{4}$")


class OperatorSessionResponse(BaseModel):
    employee: EmployeeResponse
    expires_at: UtcDatetime
    boot_id: str
