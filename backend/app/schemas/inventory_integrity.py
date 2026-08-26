"""관리자용 재고·취소 정합성 진단 응답."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


InventoryIntegrityCategory = Literal[
    "DEFECT_STOCK_MISMATCH",
    "PARTIAL_CANCELLATION",
    "WORKFLOW_STATE_RESIDUE",
    "SHIPPING_ALLOCATION_MISMATCH",
    "DUPLICATE_REVERSAL",
    "WEEKLY_UNCLASSIFIED_EFFECT",
]


class InventoryIntegrityIssue(BaseModel):
    problem_id: str
    category: InventoryIntegrityCategory
    title: str
    description: str
    cause_ids: list[str]
    current_value: str
    expected_value: str
    repairable: bool


class InventoryIntegrityResponse(BaseModel):
    generated_at: datetime
    is_consistent: bool
    issue_count: int
    category_counts: dict[InventoryIntegrityCategory, int]
    issues: list[InventoryIntegrityIssue]
