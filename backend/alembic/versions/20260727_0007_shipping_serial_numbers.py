"""Add shipping serial numbers and allow duplicate invoice numbers."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260727_0007"
down_revision: Union[str, None] = "20260727_0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if context.is_offline_mode():
        op.add_column("shipping_requests", sa.Column("serial_numbers", sa.Text(), nullable=True))
        op.drop_index("uq_shipping_requests_invoice_number", table_name="shipping_requests")
        return

    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("shipping_requests")}
    if "serial_numbers" not in columns:
        op.add_column("shipping_requests", sa.Column("serial_numbers", sa.Text(), nullable=True))

    index_names = {
        index["name"]
        for index in sa.inspect(op.get_bind()).get_indexes("shipping_requests")
    }
    if "uq_shipping_requests_invoice_number" in index_names:
        op.drop_index("uq_shipping_requests_invoice_number", table_name="shipping_requests")


def downgrade() -> None:
    raise RuntimeError("shipping serial numbers downgrade is disabled")
