"""Management standards use exact decimal strings and preserve missing values."""

from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field


StandardDecimal = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
PurchasePrice = Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=2)]
PurchaseCurrency = Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
ExchangeRate = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=6)]
CostStatus = Literal["complete", "partial", "unavailable"]
# Cost traversal keeps Python integers; the JSON boundary preserves every digit.
CostQuantity = Annotated[str, BeforeValidator(str)]


class CostStandardsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hourly_labor_rate: PurchasePrice | None = None


class CostStandardsResponse(BaseModel):
    hourly_labor_rate: str | None
    can_edit: bool


class ItemCostStandardsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    standard_purchase_price: PurchasePrice | None = None
    purchase_price_effective_date: date | None = None
    standard_work_minutes: StandardDecimal | None = None
    standard_yield_percent: Annotated[Decimal, Field(gt=0, le=100, max_digits=5, decimal_places=2)] | None = None
    purchase_currency: PurchaseCurrency = "KRW"
    foreign_purchase_price: PurchasePrice | None = None
    purchase_exchange_rate: ExchangeRate | None = None


class ItemCostStandards(BaseModel):
    standard_purchase_price: str | None
    purchase_price_effective_date: date | None
    standard_work_minutes: str | None
    standard_yield_percent: str | None = None
    purchase_currency: str = "KRW"
    foreign_purchase_price: str | None = None
    purchase_exchange_rate: str | None = None


class CostIssue(BaseModel):
    item_id: UUID
    path: list[UUID]
    code: str


class CostNode(BaseModel):
    item_id: UUID
    mes_code: str | None
    item_name: str
    quantity_per_parent: CostQuantity
    required_quantity: CostQuantity
    material_cost: str | None
    own_labor_cost: str | None
    labor_cost: str | None
    unit_cost: str | None
    amount: str | None
    status: CostStatus
    issues: list[CostIssue]
    children: list["CostNode"]


class ItemCostSummaryRequest(BaseModel):
    item_ids: list[UUID] = Field(min_length=1, max_length=100)


class ItemCostSummary(BaseModel):
    item_id: UUID
    unit_cost: str | None
    own_labor_cost: str | None
    amount: str | None
    status: CostStatus


class CostPurchaseInfoUpdate(ItemCostStandardsUpdate):
    supplier: str | None = Field(None, max_length=200)
    supplier_item_code: str | None = Field(None, max_length=100)
    standard_purchase_price: PurchasePrice | None = None
    purchase_price_effective_date: date | None = None
    min_stock: int | None = Field(None, ge=0, le=2147483647)
    reorder_point: int | None = Field(None, ge=0, le=2147483647)
    procurement_lead_time_days: int | None = Field(None, ge=0, le=2147483647)
    minimum_order_quantity: int | None = Field(None, ge=1, le=2147483647)
    purchase_memo: str | None = Field(None, max_length=1000)
    hourly_labor_rate: PurchasePrice | None = None


class CostPurchaseInfoResponse(CostPurchaseInfoUpdate):
    item_id: UUID
    item_name: str
    mes_code: str | None
    unit: str
    process_type_code: str
    standard_yield_percent: str | None = None
    purchase_currency: str
    standard_purchase_price: str | None = None
    standard_work_minutes: str | None = None
    foreign_purchase_price: str | None = None
    purchase_exchange_rate: str | None = None
    hourly_labor_rate: str | None = None


class CostYieldStage(BaseModel):
    item_id: UUID
    path: list[UUID]
    item_name: str
    mes_code: str | None
    process_type_code: str
    standard_yield_percent: str | None
    effective_yield_percent: str
    input_unit_cost: str | None
    output_unit_cost: str | None


class ItemCostResponse(BaseModel):
    item_id: UUID
    process_type_code: str
    currency: Literal["KRW"] = "KRW"
    basis: Literal["management_standard"] = "management_standard"
    can_edit: bool
    standards: ItemCostStandards
    hourly_labor_rate: str | None
    material_cost: str | None
    labor_cost: str | None
    unit_cost: str | None
    status: CostStatus
    issues: list[CostIssue]
    tree: CostNode
    yield_adjusted_unit_cost: str | None = None
    yield_cost_difference: str | None = None
    yield_stages: list[CostYieldStage] = Field(default_factory=list)
