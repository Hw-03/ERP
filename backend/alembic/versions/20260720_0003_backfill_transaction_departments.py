"""Backfill evidence-based departments for legacy transaction logs."""

from __future__ import annotations

import json
from typing import Any, Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260720_0003"
down_revision: Union[str, None] = "20260720_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_WAREHOUSE_FIXED_TYPES = (
    "RECEIVE",
    "SHIP",
    "TRANSFER_TO_PROD",
    "TRANSFER_TO_WH",
)
_WAREHOUSE_SCOPES = {"warehouse", "warehouse_box"}
_EXTERNAL_WAREHOUSE_MARKER = "창고 → 외부"


def _effects(value: Any) -> list[dict[str, Any]]:
    """Return normalized inventory-effect mappings from SQLite or JSON drivers."""
    if value is None:
        return []
    parsed = json.loads(value) if isinstance(value, str) else value
    if not isinstance(parsed, list):
        return []
    return [effect for effect in parsed if isinstance(effect, dict)]


def _infer_department(inventory_effect: Any, notes: Any) -> str | None:
    """Infer a department only when one of the approved legacy proofs exists."""
    effects = _effects(inventory_effect)
    location_departments = {
        str(effect.get("department") or "").strip()
        for effect in effects
        if effect.get("scope") == "location"
        and str(effect.get("department") or "").strip()
    }
    if len(location_departments) == 1:
        return next(iter(location_departments))

    scopes = {
        str(effect.get("scope") or "").strip()
        for effect in effects
        if str(effect.get("scope") or "").strip()
    }
    if scopes and scopes <= _WAREHOUSE_SCOPES:
        return "창고"

    if _EXTERNAL_WAREHOUSE_MARKER in str(notes or ""):
        return "창고"
    return None


def upgrade() -> None:
    """Fill only unresolved direct logs and abort before writes on ambiguity."""
    if context.is_offline_mode():
        op.execute(
            "-- 20260720_0003 requires an online connection for evidence-based backfill"
        )
        return
    connection = op.get_bind()
    transaction_logs = sa.table(
        "transaction_logs",
        sa.column("log_id"),
        sa.column("transaction_type"),
        sa.column("department"),
        sa.column("operation_batch_id"),
        sa.column("inventory_effect"),
        sa.column("notes"),
    )
    rows = connection.execute(
        sa.select(
            transaction_logs.c.log_id,
            transaction_logs.c.inventory_effect,
            transaction_logs.c.notes,
        ).where(
            sa.or_(
                transaction_logs.c.department.is_(None),
                sa.func.trim(transaction_logs.c.department) == "",
            ),
            transaction_logs.c.operation_batch_id.is_(None),
            transaction_logs.c.transaction_type.not_in(_WAREHOUSE_FIXED_TYPES),
        )
    ).all()

    resolved: list[tuple[Any, str]] = []
    unresolved: list[str] = []
    for row in rows:
        department = _infer_department(row.inventory_effect, row.notes)
        if department is None:
            unresolved.append(str(row.log_id))
        else:
            resolved.append((row.log_id, department))

    if unresolved:
        raise RuntimeError(
            "근거로 부서를 복원할 수 없는 거래가 있습니다: "
            + ", ".join(unresolved)
        )

    for log_id, department in resolved:
        connection.execute(
            sa.update(transaction_logs)
            .where(transaction_logs.c.log_id == log_id)
            .values(department=department)
        )


def downgrade() -> None:
    """Do not erase evidence-derived business data."""
    raise RuntimeError("transaction department backfill downgrade is disabled")
