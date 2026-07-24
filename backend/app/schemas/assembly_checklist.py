"""Request and response schemas for mobile assembly checklist templates."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class AssemblyChecklistCreate(BaseModel):
    model_slot: int = Field(..., ge=1, le=100)


class AssemblyChecklistSectionCreate(BaseModel):
    title: str = Field(..., max_length=80)


class AssemblyChecklistItemCreate(BaseModel):
    content: str = Field(..., max_length=2000)


class AssemblyChecklistItemReorder(BaseModel):
    item_ids: list[uuid.UUID] = Field(..., min_length=1)


class AssemblyChecklistItemResponse(BaseModel):
    item_id: uuid.UUID
    content: str
    sort_order: int


class AssemblyChecklistSectionResponse(BaseModel):
    section_id: uuid.UUID
    title: str | None = None
    sort_order: int
    items: list[AssemblyChecklistItemResponse]


class AssemblyChecklistResponse(BaseModel):
    checklist_id: uuid.UUID
    model_slot: int
    model_name: str
    sections: list[AssemblyChecklistSectionResponse]
