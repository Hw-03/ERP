"""Link IO batches to shipping preparation requests."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260727_0006"
down_revision: Union[str, None] = "20260724_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _snapshot_sqlite_io_batch_dependents(
    bind: sa.Connection,
) -> list[tuple[str, list[str], list[str], list[tuple[object, ...]]]]:
    """Preserve every descendant while SQLite recreates io_batches for the new FK."""
    if bind.dialect.name != "sqlite":
        return []

    inspector = sa.inspect(bind)
    remaining = set(inspector.get_table_names())
    parents = {"io_batches"}
    snapshots: list[tuple[str, list[str], list[str], list[tuple[object, ...]]]] = []

    while True:
        children = sorted(
            table_name
            for table_name in remaining
            if any(
                foreign_key["referred_table"] in parents
                for foreign_key in inspector.get_foreign_keys(table_name)
            )
        )
        if not children:
            break
        for table_name in children:
            columns = [column["name"] for column in inspector.get_columns(table_name)]
            primary_key_columns = list(
                inspector.get_pk_constraint(table_name).get("constrained_columns") or []
            )
            if not primary_key_columns:
                raise RuntimeError(
                    f"SQLite io_batches dependent table has no primary key: {table_name}"
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


def _restore_sqlite_io_batch_dependents(
    bind: sa.Connection,
    snapshots: list[tuple[str, list[str], list[str], list[tuple[object, ...]]]],
) -> None:
    """Restore raw SQLite values without UUID reflection coercion."""
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


def upgrade() -> None:
    if context.is_offline_mode():
        op.add_column(
            "io_batches",
            sa.Column("shipping_request_id", sa.String(length=32), nullable=True),
        )
        op.create_foreign_key(
            "fk_io_batches_shipping_request",
            "io_batches",
            "shipping_requests",
            ["shipping_request_id"],
            ["request_id"],
            ondelete="SET NULL",
        )
        op.create_index(
            "ix_io_batches_shipping_request_id",
            "io_batches",
            ["shipping_request_id"],
        )
        return

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("io_batches")}
    if "shipping_request_id" not in columns:
        op.add_column(
            "io_batches",
            sa.Column("shipping_request_id", sa.String(length=32), nullable=True),
        )
        inspector = sa.inspect(bind)

    foreign_keys = inspector.get_foreign_keys("io_batches")
    has_shipping_fk = any(
        foreign_key["referred_table"] == "shipping_requests"
        and foreign_key["constrained_columns"] == ["shipping_request_id"]
        for foreign_key in foreign_keys
    )
    if not has_shipping_fk:
        snapshots = _snapshot_sqlite_io_batch_dependents(bind)
        with op.batch_alter_table("io_batches") as batch:
            batch.create_foreign_key(
                "fk_io_batches_shipping_request",
                "shipping_requests",
                ["shipping_request_id"],
                ["request_id"],
                ondelete="SET NULL",
            )
        _restore_sqlite_io_batch_dependents(bind, snapshots)
        inspector = sa.inspect(bind)

    index_names = {index["name"] for index in inspector.get_indexes("io_batches")}
    if "ix_io_batches_shipping_request_id" not in index_names:
        op.create_index(
            "ix_io_batches_shipping_request_id",
            "io_batches",
            ["shipping_request_id"],
        )


def downgrade() -> None:
    raise RuntimeError("shipping IO context downgrade is disabled")
