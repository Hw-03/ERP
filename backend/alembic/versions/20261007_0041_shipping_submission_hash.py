"""Persist first shipping submission fingerprints for safe retries."""
from __future__ import annotations

from alembic import context, op
import sqlalchemy as sa


revision: str = "20261007_0041"
down_revision: str = "20261007_0040"
branch_labels = None
depends_on = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    """Native nullable ADD COLUMN leaves historical requests and FK children intact."""
    if not context.is_offline_mode():
        columns = sa.inspect(op.get_bind()).get_columns("shipping_requests")
        existing = next((column for column in columns if column["name"] == "submission_payload_hash"), None)
        if existing is not None:
            if (
                not isinstance(existing["type"], sa.String)
                or existing["type"].length != 64
                or not existing["nullable"]
                or existing["default"] is not None
            ):
                raise RuntimeError("shipping_requests.submission_payload_hash is incompatible; manual schema repair is required before upgrade")
            return
    op.add_column("shipping_requests", sa.Column("submission_payload_hash", sa.String(64), nullable=True))


def downgrade() -> None:
    """Restore paired code and data so persisted retry protection cannot be lost."""
    raise RuntimeError("Restore the pre-migration database backup and matching code; downgrade is unsupported")
