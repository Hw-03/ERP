"""Separate editable department labels from durable inventory location keys."""
from __future__ import annotations

from alembic import context, op
import sqlalchemy as sa


revision: str = "20261007_0042"
down_revision: str = "20261007_0041"
branch_labels = None
depends_on = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    """Keep every legacy name and relationship intact with a nullable native add."""
    if not context.is_offline_mode():
        columns = sa.inspect(op.get_bind()).get_columns("departments")
        existing = next((column for column in columns if column["name"] == "display_name"), None)
        if existing is not None:
            if (
                not isinstance(existing["type"], sa.String)
                or existing["type"].length != 50
                or not existing["nullable"]
                or existing["default"] is not None
            ):
                raise RuntimeError("departments.display_name is incompatible; manual schema repair is required before upgrade")
            return
    op.add_column("departments", sa.Column("display_name", sa.String(50), nullable=True))


def downgrade() -> None:
    """Restore the paired backup so customized department labels cannot disappear."""
    raise RuntimeError("Restore the pre-migration database backup and matching code; downgrade is unsupported")
