"""Add optional free-text shipping workers without assigning historical work."""
from alembic import context, op
import sqlalchemy as sa


revision = "20261023_0049"
down_revision = "20261021_0048"
branch_labels = None
depends_on = None
EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    """Historical requests retain unknown workers rather than inferred identities."""
    if not context.is_offline_mode():
        columns = {column["name"]: column for column in sa.inspect(op.get_bind()).get_columns("shipping_requests")}
        existing = columns.get("worker_names")
        if existing is not None:
            if existing["nullable"] and isinstance(existing["type"], sa.String) and existing["type"].length == 200:
                return
            raise RuntimeError("shipping_requests.worker_names is incompatible; repair the schema before upgrade")
    op.add_column("shipping_requests", sa.Column("worker_names", sa.String(200), nullable=True))


def downgrade() -> None:
    """Remove the optional metadata column only."""
    op.drop_column("shipping_requests", "worker_names")
