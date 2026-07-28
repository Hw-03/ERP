"""Add the shipping preparation actor snapshot."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.dialects.sqlite import insert as sqlite_insert


revision: str = "20260728_0009"
down_revision: Union[str, None] = "20260727_0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _snapshot_sqlite_shipping_dependents(
    bind: sa.Connection,
) -> list[tuple[sa.Table, list[dict[str, object]]]]:
    """Keep dependent rows while SQLite recreates shipping_requests for the FK."""
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
    for table, rows in snapshots:
        if not rows:
            continue
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
    inspector = None if context.is_offline_mode() else sa.inspect(op.get_bind())
    shipping_columns = (
        set()
        if inspector is None
        else {column["name"] for column in inspector.get_columns("shipping_requests")}
    )
    shipping_fk_names = (
        set()
        if inspector is None
        else {foreign_key["name"] for foreign_key in inspector.get_foreign_keys("shipping_requests")}
    )

    if "prepared_by_employee_id" not in shipping_columns:
        op.add_column(
            "shipping_requests",
            sa.Column("prepared_by_employee_id", sa.String(length=32), nullable=True),
        )
    if "prepared_by_name" not in shipping_columns:
        op.add_column(
            "shipping_requests",
            sa.Column("prepared_by_name", sa.String(length=100), nullable=True),
        )

    if "fk_shipping_requests_prepared_by_employee" not in shipping_fk_names:
        bind = op.get_bind()
        dependent_rows = _snapshot_sqlite_shipping_dependents(bind)
        with op.batch_alter_table("shipping_requests") as batch:
            batch.create_foreign_key(
                "fk_shipping_requests_prepared_by_employee",
                "employees",
                ["prepared_by_employee_id"],
                ["employee_id"],
                ondelete="SET NULL",
            )
        _restore_sqlite_shipping_dependents(bind, dependent_rows)


def downgrade() -> None:
    raise RuntimeError("shipping prepared-actor downgrade is disabled")
