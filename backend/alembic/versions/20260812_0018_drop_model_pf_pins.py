"""Remove persisted manual PF representative selections."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260812_0018"
down_revision: Union[str, None] = "20260812_0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    """Discard obsolete manual selections; automatic capacity selection replaces them."""
    if context.is_offline_mode() or sa.inspect(op.get_bind()).has_table("model_pf_pins"):
        op.drop_table("model_pf_pins")


def downgrade() -> None:
    raise RuntimeError(
        "downgrade is not supported because manual PF selection data cannot be restored"
    )
