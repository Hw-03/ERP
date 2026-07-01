"""Shipping request schemas."""

from __future__ import annotations

import uuid
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models import ShippingRequestStatusEnum, TransactionTypeEnum
from app.schemas.common import UtcDatetime


class ShippingBomLineInput(BaseModel):
    parent_stage: str = Field("PA", pattern="^(PA|PF)$")
    child_item_id: uuid.UUID
    quantity: int = Field(..., gt=0)
    unit: str = Field("EA", max_length=20)
    included: bool = True
    origin: str = Field("CUSTOM", pattern="^(DEFAULT|CUSTOM)$")


class ShippingCompanionLineInput(BaseModel):
    item_id: uuid.UUID
    quantity: int = Field(..., gt=0)
    unit: str = Field("EA", max_length=20)


class ShippingRequestCreate(BaseModel):
    base_pf_item_id: uuid.UUID
    request_quantity: int = Field(1, gt=0)
    requested_by_name: Optional[str] = Field(None, max_length=100)
    custom_pa_name: Optional[str] = Field(None, max_length=200)
    custom_pf_name: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None
    bom_lines: Optional[list[ShippingBomLineInput]] = None
    companion_lines: Optional[list[ShippingCompanionLineInput]] = None


class ShippingRequestUpdate(BaseModel):
    request_quantity: Optional[int] = Field(None, gt=0)
    requested_by_name: Optional[str] = Field(None, max_length=100)
    custom_pa_name: Optional[str] = Field(None, max_length=200)
    custom_pf_name: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None
    bom_lines: Optional[list[ShippingBomLineInput]] = None
    companion_lines: Optional[list[ShippingCompanionLineInput]] = None


class ShippingChecklistUpdateLine(BaseModel):
    item_id: uuid.UUID
    checked: bool


class ShippingChecklistUpdate(BaseModel):
    checks: list[ShippingChecklistUpdateLine]


class ShippingPrepareCompleteRequest(BaseModel):
    companion_lines: list[ShippingCompanionLineInput] = []


class ShippingPrepareCancelRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=300)


class ShippingBomMatchRequest(BaseModel):
    base_pf_item_id: uuid.UUID
    bom_lines: list[ShippingBomLineInput]


class ShippingBomMatchResponse(BaseModel):
    matched_pa_item_id: Optional[uuid.UUID] = None
    matched_pf_item_id: Optional[uuid.UUID] = None
    matched_pa_item_name: Optional[str] = None
    matched_pf_item_name: Optional[str] = None
    requires_pa_name: bool = False
    requires_pf_name: bool = False


class ShippingBomLineResponse(BaseModel):
    line_id: uuid.UUID
    parent_stage: str
    child_item_id: uuid.UUID
    item_name: str
    mes_code: Optional[str] = None
    process_type_code: Optional[str] = None
    quantity: int
    unit: str
    included: bool = True
    origin: str = "CUSTOM"


class ShippingCompanionLineResponse(BaseModel):
    line_id: uuid.UUID
    item_id: uuid.UUID
    item_name: str
    mes_code: Optional[str] = None
    process_type_code: Optional[str] = None
    quantity: int
    unit: str


class ShippingChecklistLineResponse(BaseModel):
    line_id: uuid.UUID
    item_id: uuid.UUID
    item_name: str
    mes_code: Optional[str] = None
    process_type_code: Optional[str] = None
    quantity: int
    checked: bool


class ShippingEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: uuid.UUID
    event_type: str
    message: Optional[str] = None
    created_at: UtcDatetime

class ShippingTransactionLogResponse(BaseModel):
    log_id: uuid.UUID
    item_id: uuid.UUID
    item_name: str
    mes_code: Optional[str] = None
    item_process_type_code: Optional[str] = None
    transaction_type: TransactionTypeEnum
    quantity_change: int
    quantity_before: Optional[int] = None
    quantity_after: Optional[int] = None
    warehouse_qty_before: Optional[int] = None
    warehouse_qty_after: Optional[int] = None
    reference_no: Optional[str] = None
    produced_by: Optional[str] = None
    notes: Optional[str] = None
    shipping_phase: Optional[str] = None
    created_at: UtcDatetime
    cancelled: bool = False
    cancel_reason: Optional[str] = None
    cancelled_at: Optional[UtcDatetime] = None
    inventory_effect: Optional[list[dict[str, Any]]] = None

class ShippingRequestResponse(BaseModel):
    request_id: uuid.UUID
    status: ShippingRequestStatusEnum
    base_pf_item_id: uuid.UUID
    base_pf_item_name: str
    base_pf_mes_code: Optional[str] = None
    request_quantity: int = 1
    final_pa_item_id: Optional[uuid.UUID] = None
    final_pa_item_name: Optional[str] = None
    final_pf_item_id: Optional[uuid.UUID] = None
    final_pf_item_name: Optional[str] = None
    requested_by_name: Optional[str] = None
    custom_pa_name: Optional[str] = None
    custom_pf_name: Optional[str] = None
    notes: Optional[str] = None
    prepared_at: Optional[UtcDatetime] = None
    picked_up_at: Optional[UtcDatetime] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime
    bom_lines: list[ShippingBomLineResponse] = []
    companion_lines: list[ShippingCompanionLineResponse] = []
    checklist_lines: list[ShippingChecklistLineResponse] = []
    events: list[ShippingEventResponse] = []
    transactions: list[ShippingTransactionLogResponse] = []
    transaction_count: int = 0
