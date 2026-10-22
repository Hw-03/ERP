"""Employee-facing saved-work projections intentionally omit private draft payloads."""
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import UtcDatetime
from app.schemas.work_reservations import (
    WorkForecastIssue, WorkInventoryEffect, WorkReservationIssue,
    WorkReservationStatus, WorkReservedInput,
)


class WorkDraftTarget(BaseModel):
    item_id: str | None
    item_name: str
    mes_code: str | None
    unit: str
    quantity: int


class WorkDraftMovementSummary(BaseModel):
    increase: int
    decrease: int
    move: int


class WorkDraftHistoryOperation(BaseModel):
    transaction_type: str
    department: str | None


class WorkDraftSummary(BaseModel):
    kind: Literal["io", "stock_request"]
    id: str
    requester_employee_id: str
    requester_name: str
    requester_department: str
    requester_active: bool
    work_type: str | None
    sub_type: str | None
    request_type: str | None
    targets: list[WorkDraftTarget]
    movement_summary: WorkDraftMovementSummary | None
    history_operation: WorkDraftHistoryOperation | None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class WorkDraftList(BaseModel):
    items: list[WorkDraftSummary]
    total: int
    skip: int
    limit: int


class WorkDraftDetail(WorkDraftSummary):
    reservation_status: WorkReservationStatus | None
    reservation_issue: WorkReservationIssue | None
    reserved_inputs: list[WorkReservedInput] | None
    expected_effects: list[WorkInventoryEffect] | None
    forecast_issue: WorkForecastIssue | None
