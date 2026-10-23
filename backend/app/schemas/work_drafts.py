"""Employee-facing saved-work projections intentionally omit private draft payloads."""
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import UtcDatetime
from app.schemas.work_stocktake_pause import WorkStocktakePause
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
    stocktake_pause: WorkStocktakePause | None = None
    kind: Literal["io", "stock_request", "shipping"]
    id: str
    requester_employee_id: str | None
    requester_name: str
    requester_department: str
    requester_active: bool
    worker_names: str | None = None
    work_type: str | None
    sub_type: str | None
    request_type: str | None
    notes: str | None
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


class WorkDraftShippingSummary(BaseModel):
    invoice_number: str | None
    companion_lines: list[WorkDraftTarget]


class WorkDraftCount(BaseModel):
    io_count: int
    stock_request_count: int
    total: int


class WorkDraftDetail(WorkDraftSummary):
    reservation_status: WorkReservationStatus | None
    reservation_issue: WorkReservationIssue | None
    reserved_inputs: list[WorkReservedInput] | None
    expected_effects: list[WorkInventoryEffect] | None
    forecast_issue: WorkForecastIssue | None
    shipping_summary: WorkDraftShippingSummary | None = None
