"""작업 감사 API 스키마."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field, field_validator


class AuditTerminalUpsert(BaseModel):
    terminal_id: uuid.UUID
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("단말명은 비어 있을 수 없습니다")
        return cleaned


class AuditTerminalResponse(BaseModel):
    terminal_id: str
    name: str


class ActivityAuditFileResponse(BaseModel):
    month: str
    file_name: str
    row_count: int
    size_bytes: int
