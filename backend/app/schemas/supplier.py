"""공급업체 마스터 API schema."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import UtcDatetime


def _clean_name(value: str) -> str:
    """표시명을 앞뒤 공백 없이 저장할 수 있게 검증한다."""
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("공급업체명은 비워둘 수 없습니다.")
    return cleaned


class SupplierCreate(BaseModel):
    requester_employee_id: uuid.UUID
    name: str = Field(..., max_length=100)

    _validate_name = field_validator("name")(_clean_name)


class SupplierUpdate(BaseModel):
    requester_employee_id: uuid.UUID
    name: str | None = Field(None, max_length=100)
    is_active: bool | None = None

    _validate_name = field_validator("name")(_clean_name)


class SupplierResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    supplier_id: uuid.UUID
    name: str
    is_active: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime
