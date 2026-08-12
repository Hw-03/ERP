"""Track reservations against department inventory locations."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260812_0019"
down_revision: Union[str, None] = "20260812_0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    add_column = True
    add_pending_nonneg = True
    add_pending_le_quantity = True
    if not context.is_offline_mode():
        inspector = sa.inspect(op.get_bind())
        columns = {
            column["name"]
            for column in inspector.get_columns("inventory_locations")
        }
        check_names = {
            constraint["name"]
            for constraint in inspector.get_check_constraints("inventory_locations")
        }
        add_column = "pending_quantity" not in columns
        add_pending_nonneg = "ck_invloc_pending_nonneg" not in check_names
        add_pending_le_quantity = "ck_invloc_pending_le_quantity" not in check_names
        if not (add_column or add_pending_nonneg or add_pending_le_quantity):
            return

    with op.batch_alter_table("inventory_locations") as batch_op:
        if add_column:
            batch_op.add_column(
                sa.Column(
                    "pending_quantity",
                    sa.Integer(),
                    nullable=False,
                    server_default="0",
                )
            )
        if add_pending_nonneg:
            batch_op.create_check_constraint(
                "ck_invloc_pending_nonneg",
                "pending_quantity >= 0",
            )
        if add_pending_le_quantity:
            batch_op.create_check_constraint(
                "ck_invloc_pending_le_quantity",
                "quantity >= pending_quantity",
            )


def downgrade() -> None:
    raise RuntimeError("inventory location pending quantity downgrade is disabled")
