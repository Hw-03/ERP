"""Repair missing shipping preparation actor schema pieces."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260728_0011"
down_revision: Union[str, None] = "20260728_0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _snapshot_sqlite_shipping_dependents(
    bind: sa.Connection,
) -> list[tuple[str, list[str], list[str], list[tuple[object, ...]]]]:
    """Keep raw dependent values while SQLite recreates shipping_requests."""
    if bind.dialect.name != "sqlite":
        return []

    remaining = {
        row[0]
        for row in bind.exec_driver_sql(
            "SELECT name FROM sqlite_master "
            "WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    }
    parents = {"shipping_requests"}
    snapshots: list[
        tuple[str, list[str], list[str], list[tuple[object, ...]]]
    ] = []

    while True:
        children = sorted(
            table_name
            for table_name in remaining
            if any(
                row[2] in parents
                for row in bind.exec_driver_sql(
                    f"PRAGMA foreign_key_list({_quote_identifier(table_name)})"
                ).fetchall()
            )
        )
        if not children:
            break
        for table_name in children:
            table_info = bind.exec_driver_sql(
                f"PRAGMA table_info({_quote_identifier(table_name)})"
            ).fetchall()
            columns = [row[1] for row in table_info]
            primary_key_columns = [
                column_name
                for _, column_name in sorted(
                    (row[5], row[1]) for row in table_info if row[5]
                )
            ]
            if not primary_key_columns:
                raise RuntimeError(
                    f"SQLite shipping dependent table has no primary key: {table_name}"
                )
            selected_columns = ", ".join(_quote_identifier(column) for column in columns)
            rows = [
                tuple(row)
                for row in bind.exec_driver_sql(
                    f"SELECT {selected_columns} FROM {_quote_identifier(table_name)}"
                ).fetchall()
            ]
            snapshots.append((table_name, columns, primary_key_columns, rows))
        remaining.difference_update(children)
        parents.update(children)
    return snapshots


def _restore_sqlite_shipping_dependents(
    bind: sa.Connection,
    snapshots: list[
        tuple[str, list[str], list[str], list[tuple[object, ...]]]
    ],
) -> None:
    """Restore raw SQLite values without reflected-type coercion."""
    for table_name, columns, primary_key_columns, rows in snapshots:
        if not rows:
            continue
        column_sql = ", ".join(_quote_identifier(column) for column in columns)
        placeholder_sql = ", ".join("?" for _ in columns)
        primary_key_sql = ", ".join(
            _quote_identifier(column) for column in primary_key_columns
        )
        update_columns = [
            column for column in columns if column not in primary_key_columns
        ]
        if update_columns:
            update_sql = ", ".join(
                f"{_quote_identifier(column)} = excluded.{_quote_identifier(column)}"
                for column in update_columns
            )
            conflict_sql = f"DO UPDATE SET {update_sql}"
        else:
            conflict_sql = "DO NOTHING"
        bind.exec_driver_sql(
            f"INSERT INTO {_quote_identifier(table_name)} ({column_sql}) "
            f"VALUES ({placeholder_sql}) "
            f"ON CONFLICT ({primary_key_sql}) {conflict_sql}",
            rows,
        )


def _upgrade_postgresql_offline() -> None:
    op.execute(
        "ALTER TABLE shipping_requests "
        "ADD COLUMN IF NOT EXISTS prepared_by_employee_id VARCHAR(32)"
    )
    op.execute(
        "ALTER TABLE shipping_requests "
        "ADD COLUMN IF NOT EXISTS prepared_by_name VARCHAR(100)"
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'fk_shipping_requests_prepared_by_employee'
                  AND conrelid = 'shipping_requests'::regclass
            ) THEN
                ALTER TABLE shipping_requests
                ADD CONSTRAINT fk_shipping_requests_prepared_by_employee
                FOREIGN KEY (prepared_by_employee_id)
                REFERENCES employees (employee_id)
                ON DELETE SET NULL;
            END IF;
        END $$
        """
    )


def upgrade() -> None:
    if context.is_offline_mode():
        if op.get_context().dialect.name == "postgresql":
            _upgrade_postgresql_offline()
            return
        raise RuntimeError("shipping prepared-actor repair requires online schema inspection")

    inspector = sa.inspect(op.get_bind())
    shipping_columns = {column["name"] for column in inspector.get_columns("shipping_requests")}
    shipping_fk_names = {
        foreign_key["name"] for foreign_key in inspector.get_foreign_keys("shipping_requests")
    }

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
    raise RuntimeError("shipping prepared-actor repair downgrade is disabled")
