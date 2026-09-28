"""Allow raw-material outbound history without adding columns."""

from __future__ import annotations

from alembic import context, op

revision: str = "20260928_0038"
down_revision: str = "20260922_0037"
branch_labels = None
depends_on = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    """Commit the PostgreSQL enum value before transactions can use it."""
    if context.get_context().dialect.name == "postgresql":
        with context.get_context().autocommit_block():
            op.execute("ALTER TYPE transaction_type_enum ADD VALUE IF NOT EXISTS 'MATERIAL_OUT'")


def downgrade() -> None:
    """Keep the value so existing outbound history remains readable."""
    pass
