"""Preserve the already-finalized PF selected by the legacy shipping flow."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260807_0015"
down_revision: Union[str, None] = "20260807_0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    if context.is_offline_mode():
        return

    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("shipping_requests")}
    required = {"base_pf_item_id", "final_pf_item_id", "finalization_mode", "reuse_pf_item_id"}
    if not required.issubset(columns):
        return
    bind.execute(
        sa.text(
            """
            UPDATE shipping_requests
            SET finalization_mode = 'REUSE_CANDIDATE',
                reuse_pf_item_id = final_pf_item_id
            WHERE finalization_mode = 'KEEP_BASE'
              AND final_pf_item_id IS NOT NULL
              AND final_pf_item_id <> base_pf_item_id
            """
        )
    )


def downgrade() -> None:
    raise RuntimeError("shipping BOM candidate selection downgrade is disabled")
