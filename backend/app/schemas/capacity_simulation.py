"""Contracts for temporary, read-only production capacity previews."""

import uuid
from typing import Literal

from pydantic import BaseModel, Field


class CapacitySimulationRequest(BaseModel):
    pf_item_id: uuid.UUID
    excluded_item_ids: list[uuid.UUID] = Field(default_factory=list)


class CapacitySimulationResponse(BaseModel):
    pf_item_id: str
    ship_ready: int
    fast_production: int | None
    fast_production_status: Literal["finite", "no_constraints"]
    total_production: int | None
    total_production_status: Literal["finite", "no_constraints"]
    fast_production_limiting_item_id: str | None = None
    total_production_limiting_item_id: str | None = None


class BomCapacitySimulationRequest(BaseModel):
    excluded_item_ids: list[uuid.UUID] = Field(default_factory=list)


class BomCapacitySimulationResponse(BaseModel):
    item_id: str
    ship_ready: int
    fast_production: int | None
    fast_production_status: Literal["finite", "no_constraints", "unavailable"]
    fast_production_limiting_item_id: str | None = None
    total_production: int | None
    total_production_status: Literal["finite", "no_constraints", "unavailable"]
    total_production_limiting_item_id: str | None = None
    additional_producible_quantity: int | None
    additional_producible_status: Literal["finite", "no_constraints", "unavailable"]
    additional_producible_limiting_item_id: str | None = None
