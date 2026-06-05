"""공용 schema 요소 — datetime serializer, UtcDatetime, 공용 enum re-export, 미분류 클래스."""

from datetime import datetime, timezone
from typing import Annotated, List, Literal, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, WithJsonSchema

from app.models import (
    EmployeeLevelEnum,
    LocationStatusEnum,
    RequestBucketEnum,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionTypeEnum,
)


def _serialize_datetime_with_utc(dt: datetime) -> str:
    """Serialize naive datetime with +00:00 UTC offset."""
    if dt.tzinfo is None:
        return dt.isoformat() + "+00:00"
    return dt.isoformat()


UtcDatetime = Annotated[
    datetime,
    PlainSerializer(_serialize_datetime_with_utc, return_type=str),
    WithJsonSchema({"type": "string", "format": "date-time"}),
]


class AdminPinVerifyRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=32)


class AdminPinUpdateRequest(BaseModel):
    current_pin: str = Field(..., min_length=4, max_length=32)
    new_pin: str = Field(..., min_length=4, max_length=32)


class IntegrityCheckRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=32)
    limit: int = Field(100, ge=1, le=2000)


class IntegrityCheckBody(BaseModel):
    """Deprecated GET /integrity/inventory 의 선택적 body — PIN 을 query 대신 body 로 전달."""

    pin: Optional[str] = Field(None, min_length=4, max_length=32)


class MessageResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    detail: str


class IntegrityCheckResponse(BaseModel):
    """`/api/settings/integrity/inventory` 응답.

    samples 는 InventoryMismatch.to_dict() 의 자유로운 dict — schema 강제 안 함.
    """
    checked: int
    mismatched_count: int
    samples: List[dict]


class IntegrityRepairResponse(BaseModel):
    """`/api/settings/integrity/repair` 응답."""
    checked: int
    mismatched: int
    repaired: int
    dry_run: bool
    samples: List[dict]


class ReservationLineResponse(BaseModel):
    """품목별 점유중 라인 — InventoryDetailPanel 표시용."""
    model_config = ConfigDict(from_attributes=True)

    line_id: uuid.UUID
    request_id: uuid.UUID
    request_code: Optional[str] = None
    requester_name: str
    requester_department: str
    quantity: int
    from_bucket: RequestBucketEnum
    to_bucket: RequestBucketEnum
    to_department: Optional[str] = None
    created_at: UtcDatetime
