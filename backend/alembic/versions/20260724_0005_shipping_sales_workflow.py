"""Add invoice, cancellation audit, sales review, and shipping revisions."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.dialects.sqlite import insert as sqlite_insert


revision: str = "20260724_0005"
down_revision: Union[str, None] = "20260724_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _snapshot_sqlite_shipping_dependents(
    bind: sa.Connection,
) -> list[tuple[sa.Table, list[dict[str, object]]]]:
    """Keep dependent rows while SQLite recreates shipping_requests for a new FK."""
    if bind.dialect.name != "sqlite":
        return []

    inspector = sa.inspect(bind)
    snapshots: list[tuple[sa.Table, list[dict[str, object]]]] = []
    for table_name in inspector.get_table_names():
        foreign_keys = inspector.get_foreign_keys(table_name)
        if not any(foreign_key["referred_table"] == "shipping_requests" for foreign_key in foreign_keys):
            continue
        table = sa.Table(table_name, sa.MetaData(), autoload_with=bind)
        rows = [dict(row) for row in bind.execute(sa.select(table)).mappings()]
        snapshots.append((table, rows))
    return snapshots


def _restore_sqlite_shipping_dependents(
    bind: sa.Connection,
    snapshots: list[tuple[sa.Table, list[dict[str, object]]]],
) -> None:
    """Restore rows deleted by SQLite's ON DELETE action during table recreation."""
    for table, rows in snapshots:
        if rows:
            statement = sqlite_insert(table)
            primary_key_columns = [column.name for column in table.primary_key.columns]
            updates = {
                column.name: statement.excluded[column.name]
                for column in table.columns
                if column.name not in primary_key_columns
            }
            if updates:
                statement = statement.on_conflict_do_update(
                    index_elements=primary_key_columns,
                    set_=updates,
                )
            else:
                statement = statement.on_conflict_do_nothing(index_elements=primary_key_columns)
            bind.execute(statement, rows)


def upgrade() -> None:
    if context.get_context().dialect.name == "postgresql":
        op.execute("ALTER TYPE shipping_request_status_enum ADD VALUE IF NOT EXISTS 'CANCELLED'")

    inspector = None if context.is_offline_mode() else sa.inspect(op.get_bind())
    shipping_columns = set() if inspector is None else {column["name"] for column in inspector.get_columns("shipping_requests")}
    item_columns = set() if inspector is None else {column["name"] for column in inspector.get_columns("items")}
    existing_tables = set() if inspector is None else set(inspector.get_table_names())
    shipping_fk_names = set() if inspector is None else {
        foreign_key["name"] for foreign_key in inspector.get_foreign_keys("shipping_requests")
    }
    shipping_index_names = set() if inspector is None else {
        index["name"] for index in inspector.get_indexes("shipping_requests")
    }
    revision_index_names = (
        set()
        if inspector is None or "shipping_request_revisions" not in existing_tables
        else {index["name"] for index in inspector.get_indexes("shipping_request_revisions")}
    )
    additions = (
        ("invoice_number", sa.String(length=100)),
        ("cancelled_at", sa.DateTime()),
        ("cancelled_by_employee_id", sa.String(length=32)),
        ("cancelled_by_name", sa.String(length=100)),
    )
    missing_shipping_columns = [
        sa.Column(name, type_, nullable=True)
        for name, type_ in additions
        if name not in shipping_columns
    ]
    for column in missing_shipping_columns:
        op.add_column("shipping_requests", column)
    if "fk_shipping_requests_cancelled_by_employee" not in shipping_fk_names:
        dependent_rows = _snapshot_sqlite_shipping_dependents(op.get_bind())
        with op.batch_alter_table("shipping_requests") as batch:
            batch.create_foreign_key(
                "fk_shipping_requests_cancelled_by_employee",
                "employees",
                ["cancelled_by_employee_id"],
                ["employee_id"],
                ondelete="SET NULL",
            )
        _restore_sqlite_shipping_dependents(op.get_bind(), dependent_rows)
    if "uq_shipping_requests_invoice_number" not in shipping_index_names:
        op.create_index("uq_shipping_requests_invoice_number", "shipping_requests", ["invoice_number"], unique=True)
    if "ix_shipping_requests_cancelled_at" not in shipping_index_names:
        op.create_index("ix_shipping_requests_cancelled_at", "shipping_requests", ["cancelled_at"])

    if "sales_review_required" not in item_columns:
        op.add_column(
            "items",
            sa.Column("sales_review_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    if "shipping_request_revisions" not in existing_tables:
        op.create_table(
            "shipping_request_revisions",
        sa.Column("revision_id", sa.String(length=32), nullable=False),
        sa.Column("request_id", sa.String(length=32), nullable=False),
        sa.Column("edited_by_employee_id", sa.String(length=32), nullable=False),
        sa.Column("edited_by_name", sa.String(length=100), nullable=False),
        sa.Column("summary", sa.String(length=300), nullable=False),
        sa.Column("affects_preparation", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("changes", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["request_id"], ["shipping_requests.request_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["edited_by_employee_id"], ["employees.employee_id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("revision_id"),
        )
    if "ix_shipping_request_revisions_request_created" not in revision_index_names:
        op.create_index("ix_shipping_request_revisions_request_created", "shipping_request_revisions", ["request_id", "created_at"])


def downgrade() -> None:
    raise RuntimeError("shipping sales workflow downgrade is disabled")
