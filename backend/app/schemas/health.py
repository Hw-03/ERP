"""Versioned health contracts for probes and operational diagnostics."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class HealthLiveResponse(BaseModel):
    contract: Literal["health-liveness/v1"]
    status: Literal["live"]


class HealthReadinessCheck(BaseModel):
    check_id: str
    status: Literal["pass", "fail", "not_checked"]
    count: int | None


class HealthIntegrityCheckSummary(BaseModel):
    check_id: str
    severity: Literal["blocking", "warning"]
    count: int


class HealthIntegritySummary(BaseModel):
    contract: Literal["inventory-integrity/v1"]
    status: Literal["pass", "warning", "fail"]
    blocking_count: int
    warning_count: int
    checks: list[HealthIntegrityCheckSummary]


class HealthReadinessResponse(BaseModel):
    contract: Literal["health-readiness/v1"]
    status: Literal["ready", "not_ready"]
    checks: list[HealthReadinessCheck]
    alembic_revision: str | None
    inventory_integrity: HealthIntegritySummary | None


class HealthIntegrityCheckDetail(HealthIntegrityCheckSummary):
    samples: list[dict[str, object]]


class HealthIntegrityDetail(BaseModel):
    contract: Literal["inventory-integrity/v1"]
    status: Literal["pass", "warning", "fail"]
    blocking_count: int
    warning_count: int
    checks: list[HealthIntegrityCheckDetail]


class HealthDatabaseStatus(BaseModel):
    ok: bool


class HealthDetailedResponse(BaseModel):
    contract: Literal["health-detailed/v1"]
    status: Literal["ok", "degraded"]
    db: HealthDatabaseStatus
    rows: dict[str, int]
    inventory_mismatch_count: int | None
    inventory_integrity: HealthIntegrityDetail | None
    last_transaction_at: str | None
    readiness: HealthReadinessResponse
