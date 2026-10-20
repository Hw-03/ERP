"""Public and administrator reservation DTOs matching the shared frontend contract."""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import UtcDatetime


WorkReservationStatus = Literal["reserved", "needs_reservation", "not_required", "inactive"]


class WarehouseLocation(BaseModel):
    bucket: Literal["warehouse"]
    department: None


class ProductionLocation(BaseModel):
    bucket: Literal["production"]
    department: str


class DefectiveLocation(BaseModel):
    bucket: Literal["defective"]
    department: str


WorkSourceLocation = Annotated[WarehouseLocation | ProductionLocation, Field(discriminator="bucket")]
WorkStockLocation = Annotated[WarehouseLocation | ProductionLocation | DefectiveLocation, Field(discriminator="bucket")]


class WorkItemIdentity(BaseModel):
    item_id: str
    item_name: str
    mes_code: str | None
    unit: str


class WorkInventoryEffect(WorkItemIdentity):
    model_config = ConfigDict(populate_by_name=True)
    effect_id: str
    operation_line_id: str
    bundle_id: str
    quantity: int = Field(gt=0, strict=True)
    kind: Literal["in", "out", "move"]
    from_location: WorkSourceLocation | None = Field(alias="from")
    to: WorkStockLocation | None

    @model_validator(mode="after")
    def validate_endpoints(self) -> "WorkInventoryEffect":
        """The discriminator's physical meaning must match its explicit null endpoints."""
        if ((self.from_location is not None) != (self.kind != "in")
                or (self.to is not None) != (self.kind != "out")):
            raise ValueError("Effect endpoints do not match its kind")
        if self.kind == "move" and self.from_location == self.to:
            raise ValueError("A movement requires distinct locations")
        return self


class WorkEffectivePlan(BaseModel):
    version: Literal[1]
    fingerprint: str
    effects: list[WorkInventoryEffect]

    @model_validator(mode="after")
    def validate_unique_effects(self) -> "WorkEffectivePlan":
        """A stored operation line describes one physical effect, never duplicate forecasts."""
        if (len({effect.effect_id for effect in self.effects}) != len(self.effects)
                or len({effect.operation_line_id for effect in self.effects}) != len(self.effects)):
            raise ValueError("Effect identifiers must be unique")
        return self


class WorkReservationShortage(WorkItemIdentity):
    location: WorkSourceLocation
    required_quantity: int
    available_quantity: int
    shortage_quantity: int


class WorkReservationIssue(BaseModel):
    code: Literal["legacy_unprocessed", "stock_shortage", "inactive_owner", "unsupported_source", "plan_invalid", "returned_after_rejection"]
    message: str
    shortages: list[WorkReservationShortage]


class WorkReservedInput(WorkItemIdentity):
    location: WorkSourceLocation
    quantity: int
    source: Literal["draft", "approval"]
    stock_request_id: str | None
    operation_line_ids: list[str]


class WorkTarget(WorkItemIdentity):
    quantity: int


class WorkReservationSummary(BaseModel):
    batch_id: str
    revision: int
    status: str
    reservation_status: WorkReservationStatus
    reservation_issue: WorkReservationIssue | None
    work_type: str
    sub_type: str
    reference_no: str | None
    requester_employee_id: str
    requester_name: str
    requester_department: str
    requester_active: bool
    targets: list[WorkTarget]
    created_at: UtcDatetime
    updated_at: UtcDatetime


class WorkForecastIssue(BaseModel):
    code: Literal["missing_effect_mapping", "unsupported_legacy_plan"]
    message: str


class InventoryRelatedWork(WorkReservationSummary):
    reserved_inputs: list[WorkReservedInput]
    expected_effects: list[WorkInventoryEffect]
    forecast_issue: WorkForecastIssue | None


class InventoryReservationQuantities(BaseModel):
    work_reserved_quantity: int
    approval_reserved_quantity: int
    shipping_reserved_quantity: int


class InventoryForecastQuantities(BaseModel):
    expected_in_quantity: int
    expected_out_quantity: int
    transfer_in_quantity: int
    transfer_out_quantity: int


class InventoryLocationReservation(InventoryReservationQuantities):
    location: WorkStockLocation


class InventoryLocationForecast(InventoryForecastQuantities):
    location: WorkStockLocation


class InventoryReservationSummary(InventoryReservationQuantities, InventoryForecastQuantities):
    forecast_complete: bool
    reservation_by_location: list[InventoryLocationReservation]
    forecast_by_location: list[InventoryLocationForecast]


class InventoryWorkStatus(BaseModel):
    item_id: str
    summary: InventoryReservationSummary
    works: list[InventoryRelatedWork]


class WorkReservationEvent(BaseModel):
    event_id: str
    action: Literal["saved", "submitted", "returned", "backfilled", "admin_cancelled", "owner_deleted", "approval_changed", "settlement_failed"]
    revision: int
    occurred_at: UtcDatetime
    actor_employee_id: str | None
    actor_name: str
    reason: str | None


class AdminWorkReservationDetail(InventoryRelatedWork):
    notes: str | None
    effective_plan: WorkEffectivePlan | None
    history: list[WorkReservationEvent]


class WorkReservationCounts(BaseModel):
    draft: int
    reserved: int
    needs_reservation: int
    not_required: int


class AdminWorkReservationList(BaseModel):
    items: list[WorkReservationSummary]
    total: int
    skip: int
    limit: int
    counts: WorkReservationCounts
