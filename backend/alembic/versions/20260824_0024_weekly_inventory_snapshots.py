"""Add immutable weekly finished-inventory snapshots."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260824_0024"
down_revision: Union[str, None] = "20260821_0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


_SNAPSHOT_COLUMNS = {
    "snapshot_id",
    "week_end",
    "as_of_utc",
    "captured_at",
    "capture_source",
    "item_count",
    "total_quantity",
}
_ITEM_COLUMNS = {
    "snapshot_item_id",
    "snapshot_id",
    "item_id",
    "mes_code",
    "item_name",
    "process_type_code",
    "quantity",
}


def _existing_tables_are_compatible(bind: sa.Connection) -> bool:
    inspector = sa.inspect(bind)
    if {column["name"] for column in inspector.get_columns("weekly_inventory_snapshots")} != _SNAPSHOT_COLUMNS:
        return False
    if {column["name"] for column in inspector.get_columns("weekly_inventory_snapshot_items")} != _ITEM_COLUMNS:
        return False
    if not any(
        constraint["name"] == "uq_weekly_inventory_snapshots_week_end"
        for constraint in inspector.get_unique_constraints("weekly_inventory_snapshots")
    ):
        return False
    if not any(
        constraint["name"] == "uq_weekly_inventory_snapshot_items_snapshot_item"
        for constraint in inspector.get_unique_constraints("weekly_inventory_snapshot_items")
    ):
        return False
    return any(
        foreign_key["constrained_columns"] == ["snapshot_id"]
        and foreign_key["referred_table"] == "weekly_inventory_snapshots"
        and foreign_key.get("options", {}).get("ondelete", "").upper() == "CASCADE"
        for foreign_key in inspector.get_foreign_keys("weekly_inventory_snapshot_items")
    )


def upgrade() -> None:
    if not context.is_offline_mode():
        bind = op.get_bind()
        existing = set(sa.inspect(bind).get_table_names()) & {
            "weekly_inventory_snapshots",
            "weekly_inventory_snapshot_items",
        }
        if existing:
            if existing == {
                "weekly_inventory_snapshots",
                "weekly_inventory_snapshot_items",
            } and _existing_tables_are_compatible(bind):
                return
            raise RuntimeError("existing weekly inventory snapshot tables do not match the expected schema")

    op.create_table(
        "weekly_inventory_snapshots",
        sa.Column("snapshot_id", sa.String(length=32), nullable=False),
        sa.Column("week_end", sa.Date(), nullable=False),
        sa.Column("as_of_utc", sa.DateTime(), nullable=False),
        sa.Column("captured_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("capture_source", sa.String(length=32), nullable=False),
        sa.Column("item_count", sa.Integer(), nullable=False),
        sa.Column("total_quantity", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "item_count >= 0",
            name="ck_weekly_inventory_snapshots_item_count_nonneg",
        ),
        sa.CheckConstraint(
            "total_quantity >= 0",
            name="ck_weekly_inventory_snapshots_total_nonneg",
        ),
        sa.PrimaryKeyConstraint("snapshot_id"),
        sa.UniqueConstraint("week_end", name="uq_weekly_inventory_snapshots_week_end"),
    )
    op.create_index(
        "ix_weekly_inventory_snapshots_week_end",
        "weekly_inventory_snapshots",
        ["week_end"],
    )

    op.create_table(
        "weekly_inventory_snapshot_items",
        sa.Column("snapshot_item_id", sa.String(length=32), nullable=False),
        sa.Column("snapshot_id", sa.String(length=32), nullable=False),
        sa.Column("item_id", sa.String(length=32), nullable=False),
        sa.Column("mes_code", sa.String(length=40), nullable=True),
        sa.Column("item_name", sa.String(length=200), nullable=False),
        sa.Column("process_type_code", sa.String(length=2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "quantity >= 0",
            name="ck_weekly_inventory_snapshot_items_quantity_nonneg",
        ),
        sa.ForeignKeyConstraint(
            ["snapshot_id"],
            ["weekly_inventory_snapshots.snapshot_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("snapshot_item_id"),
        sa.UniqueConstraint(
            "snapshot_id",
            "item_id",
            name="uq_weekly_inventory_snapshot_items_snapshot_item",
        ),
    )
    op.create_index(
        "ix_weekly_inventory_snapshot_items_snapshot",
        "weekly_inventory_snapshot_items",
        ["snapshot_id"],
    )
    op.create_index(
        "ix_weekly_inventory_snapshot_items_process",
        "weekly_inventory_snapshot_items",
        ["process_type_code"],
    )


def downgrade() -> None:
    raise RuntimeError("weekly inventory snapshot downgrade is disabled")
