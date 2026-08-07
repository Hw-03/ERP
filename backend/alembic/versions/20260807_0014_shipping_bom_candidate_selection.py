"""Persist the user's final BOM selection for shipping requests."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260807_0014"
down_revision: Union[str, None] = "20260804_0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    if context.is_offline_mode():
        op.add_column(
            "shipping_requests",
            sa.Column(
                "finalization_mode",
                sa.String(length=24),
                nullable=False,
                server_default="KEEP_BASE",
            ),
        )
        op.add_column(
            "shipping_requests",
            sa.Column("reuse_pf_item_id", sa.String(length=36), nullable=True),
        )
        op.create_index(
            "ix_shipping_requests_reuse_pf_item_id",
            "shipping_requests",
            ["reuse_pf_item_id"],
        )
        return

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("shipping_requests")}
    if "finalization_mode" not in columns:
        op.add_column(
            "shipping_requests",
            sa.Column(
                "finalization_mode",
                sa.String(length=24),
                nullable=False,
                server_default="KEEP_BASE",
            ),
        )
    if "reuse_pf_item_id" not in columns:
        op.add_column(
            "shipping_requests",
            sa.Column("reuse_pf_item_id", sa.String(length=36), nullable=True),
        )

    index_names = {
        index["name"]
        for index in sa.inspect(bind).get_indexes("shipping_requests")
    }
    if "ix_shipping_requests_reuse_pf_item_id" not in index_names:
        op.create_index(
            "ix_shipping_requests_reuse_pf_item_id",
            "shipping_requests",
            ["reuse_pf_item_id"],
        )


def downgrade() -> None:
    raise RuntimeError("shipping BOM candidate selection downgrade is disabled")
