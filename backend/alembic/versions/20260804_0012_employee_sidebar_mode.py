"""Add the employee desktop sidebar mode preference."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260804_0012"
down_revision: Union[str, None] = "20260728_0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    if not context.is_offline_mode():
        employee_columns = {
            column["name"] for column in sa.inspect(op.get_bind()).get_columns("employees")
        }
        if "sidebar_mode" in employee_columns:
            return

    op.add_column(
        "employees",
        sa.Column(
            "sidebar_mode",
            sa.String(length=10),
            nullable=False,
            server_default="hover",
        ),
    )


def downgrade() -> None:
    raise RuntimeError("employee sidebar mode downgrade is disabled")
