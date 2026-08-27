"""Add immutable normal-department stock snapshots to transaction logs."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260824_0025"
down_revision: Union[str, None] = "20260824_0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}

_SNAPSHOT_COLUMNS = (
    "department_qty_before",
    "department_qty_after",
)


def upgrade() -> None:
    existing_columns: set[str] = set()
    if not context.is_offline_mode():
        bind = op.get_bind()
        existing_columns = {
            column["name"]
            for column in sa.inspect(bind).get_columns("transaction_logs")
        }

    for column_name in _SNAPSHOT_COLUMNS:
        if column_name in existing_columns:
            continue
        op.add_column(
            "transaction_logs",
            sa.Column(column_name, sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    raise RuntimeError("transaction stock snapshot downgrade is disabled")
