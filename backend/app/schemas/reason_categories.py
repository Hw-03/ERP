"""불량 사유 마스터 관리 계약."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, field_validator
from app.schemas.common import UtcDatetime


def _clean_name(value: str | None) -> str | None:
    """표시명은 앞뒤 공백을 제거한 1~32자로 제한한다."""
    if value is None:
        return value
    name = value.strip()
    if not 1 <= len(name) <= 32:
        raise ValueError("사유 이름은 1~32자로 입력하세요.")
    return name


class ReasonCategoryCreate(BaseModel):
    requester_employee_id: uuid.UUID
    name: str
    _validate_name = field_validator("name")(_clean_name)


class ReasonCategoryUpdate(BaseModel):
    requester_employee_id: uuid.UUID
    name: str | None = None
    is_active: bool | None = None
    _validate_name = field_validator("name")(_clean_name)


class ReasonCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    category_id: uuid.UUID
    name: str
    is_active: bool
    is_other: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime
