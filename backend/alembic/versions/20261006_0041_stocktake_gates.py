"""Add counting fences without starting a round or changing inventory."""

from alembic import op
import sqlalchemy as sa


revision = "20261006_0041"
down_revision = "20261001_0040"
branch_labels = None
depends_on = None
EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    """Empty additive tables only; live counting is enabled by a later explicit API."""
    if not op.get_context().as_sql:
        inspector = sa.inspect(op.get_bind())
        expected = {
            "stocktake_gates": {"item_id", "scope_key", "round_id", "active_count_id", "round_epoch", "fence", "quantity_revision", "reservation_revision", "observation_epoch"},
            "stocktake_progress": {"round_id", "scope_key", "progress_revision"},
        }
        existing = set(inspector.get_table_names()) & expected.keys()
        if existing:
            # Canonical onboarding may start from an exact, unversioned ORM
            # schema. Never adopt a partial migration or silently repair drift.
            if existing != expected.keys() or any(
                {column["name"] for column in inspector.get_columns(name)} != columns
                for name, columns in expected.items()
            ):
                raise RuntimeError("Partial stocktake gate schema cannot be adopted")
            return
    op.create_table(
        "stocktake_gates",
        sa.Column("item_id", sa.String(32), sa.ForeignKey("items.item_id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("scope_key", sa.String(80), sa.ForeignKey("inventory_scopes.scope_key", ondelete="RESTRICT"), primary_key=True),
        sa.Column("round_id", sa.String(32), nullable=True),
        sa.Column("active_count_id", sa.String(32), nullable=True),
        *(sa.Column(name, sa.Integer(), nullable=False, server_default="0") for name in (
            "round_epoch", "fence", "quantity_revision", "reservation_revision", "observation_epoch")),
        sa.CheckConstraint("round_epoch >= 0 AND fence >= 0 AND quantity_revision >= 0 "
                           "AND reservation_revision >= 0 AND observation_epoch >= 0", name="ck_stocktake_gate_revisions"),
    )
    op.create_table(
        "stocktake_progress",
        sa.Column("round_id", sa.String(32), primary_key=True),
        sa.Column("scope_key", sa.String(80), sa.ForeignKey("inventory_scopes.scope_key", ondelete="RESTRICT"), primary_key=True),
        sa.Column("progress_revision", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint("progress_revision >= 0", name="ck_stocktake_progress_revision"),
    )


def downgrade() -> None:
    """Never discard fencing evidence; recovery uses a verified whole snapshot."""
    raise RuntimeError("Restore a verified snapshot; counting fences cannot be downgraded")
