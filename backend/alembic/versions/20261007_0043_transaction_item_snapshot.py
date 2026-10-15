"""Preserve future transaction item labels without inventing legacy labels."""
from alembic import context, op
import sqlalchemy as sa

revision = "20261007_0043"
down_revision = "20261007_0042"
branch_labels = None
depends_on = None
EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    """Add a nullable snapshot natively; every old record remains NULL."""
    if not context.is_offline_mode():
        existing = next((column for column in sa.inspect(op.get_bind()).get_columns("transaction_logs")
                         if column["name"] == "item_snapshot"), None)
        if existing is not None:
            if not isinstance(existing["type"], sa.JSON) or not existing["nullable"] or existing["default"] is not None:
                raise RuntimeError("transaction_logs.item_snapshot is incompatible; manual repair required")
            return
    op.add_column("transaction_logs", sa.Column("item_snapshot", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Do not discard captured historical identity; restore the paired backup and code."""
    raise RuntimeError("Restore the pre-migration database backup and matching code; downgrade is unsupported")
