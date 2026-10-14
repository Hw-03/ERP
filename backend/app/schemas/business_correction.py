"""No actor identity, arbitrary status or partial original line selection is accepted."""
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class CorrectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_type: Literal["InventoryOperation", "ShippingRequest", "StockRequest", "HandoverDoc"]
    source_id: UUID
    target_status: Literal["PREPARING", "CANCELLED"]
    reason: Reason
    evidence: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]


class CorrectionVersionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(strict=True, ge=1)


class CorrectionVersion(CorrectionVersionBody):
    correction_id: UUID


class CorrectionApproveBody(CorrectionVersionBody):
    preview_id: UUID
    preview_hash: str = Field(min_length=64, max_length=64)


class CorrectionApprove(CorrectionApproveBody):
    correction_id: UUID


class CorrectionDecisionBody(CorrectionVersionBody):
    reason: Reason


class CorrectionDecision(CorrectionDecisionBody):
    correction_id: UUID
