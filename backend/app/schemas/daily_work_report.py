"""개인 일일 작업 일지 API 스키마."""

import uuid
from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.common import UtcDatetime
from app.schemas.transaction import TransactionDisplayGroupResponse


class DailyWorkReportUpsertRequest(BaseModel):
    actor_employee_id: uuid.UUID
    content: str


class DailyWorkReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    report_id: uuid.UUID
    work_date: date
    employee_id: uuid.UUID
    employee_name: str
    department: str
    content: str
    created_at: UtcDatetime
    updated_at: UtcDatetime


class DailyWorkActivitySummary(BaseModel):
    operation_key: str
    operation_label: str
    work_count: int
    quantity_by_unit: dict[str, int]


class DailyWorkActivityResponse(BaseModel):
    work_date: date
    employee_id: uuid.UUID
    summary: list[DailyWorkActivitySummary]
    cancelled_count: int
    details: list[TransactionDisplayGroupResponse]
