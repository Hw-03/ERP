"""관리자용 재고·취소 정합성 진단 응답."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

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


class InventoryIntegrityCheck(BaseModel):
    check_id: str
    severity: Literal["blocking", "warning"]
    count: int
    samples: list[dict[str, Any]]


class InventoryIntegrityResponse(BaseModel):
    contract: Literal["inventory-integrity/v1"]
    status: Literal["pass", "warning", "fail"]
    blocking_count: int
    warning_count: int
    checks: list[InventoryIntegrityCheck]
    generated_at: datetime
    is_consistent: bool
    issue_count: int
    category_counts: dict[InventoryIntegrityCategory, int]
    issues: list[InventoryIntegrityIssue]

    def contract_payload(self) -> dict[str, Any]:
        """Return only the stable v1 fields shared by CLI and health."""
        return self.model_dump(
            mode="json",
            include={
                "contract",
                "status",
                "blocking_count",
                "warning_count",
                "checks",
            },
        )
