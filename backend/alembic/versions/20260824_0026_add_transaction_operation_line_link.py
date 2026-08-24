"""Link transaction logs to their immutable IO operation lines."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260824_0026"
down_revision: Union[str, None] = "20260824_0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}

_COLUMN_NAME = "operation_line_id"
_INDEX_NAME = "ix_transaction_logs_operation_line_id"
_FOREIGN_KEY_NAME = "fk_transaction_logs_operation_line_id_io_lines"


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _snapshot_sqlite_dependents(
    bind: sa.Connection,
) -> list[tuple[str, list[str], list[str], list[tuple[object, ...]]]]:
    """Preserve dependent rows while SQLite recreates transaction_logs for the FK."""
    if bind.dialect.name != "sqlite":
        return []

    inspector = sa.inspect(bind)
    remaining = set(inspector.get_table_names())
    parents = {"transaction_logs"}
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
                    f"SQLite transaction_logs dependent table has no primary key: {table_name}"
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


def _restore_sqlite_dependents(
    bind: sa.Connection,
    snapshots: list[tuple[str, list[str], list[str], list[tuple[object, ...]]]],
) -> None:
    """Restore raw dependent values after SQLite table recreation."""
    for table_name, columns, primary_key_columns, rows in snapshots:
        if not rows:
            continue
        column_sql = ", ".join(_quote_identifier(column) for column in columns)
        placeholder_sql = ", ".join("?" for _ in columns)
        primary_key_sql = ", ".join(
            _quote_identifier(column) for column in primary_key_columns
        )
        update_columns = [column for column in columns if column not in primary_key_columns]
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
            "transaction_logs",
            sa.Column(_COLUMN_NAME, sa.String(length=32), nullable=True),
        )
        op.create_foreign_key(
            _FOREIGN_KEY_NAME,
            "transaction_logs",
            "io_lines",
            [_COLUMN_NAME],
            ["line_id"],
            ondelete="SET NULL",
        )
        op.create_index(_INDEX_NAME, "transaction_logs", [_COLUMN_NAME])
        return

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("transaction_logs")}
    if _COLUMN_NAME not in columns:
        op.add_column(
            "transaction_logs",
            sa.Column(_COLUMN_NAME, sa.String(length=32), nullable=True),
        )
        inspector = sa.inspect(bind)

    has_foreign_key = any(
        foreign_key["referred_table"] == "io_lines"
        and foreign_key["constrained_columns"] == [_COLUMN_NAME]
        for foreign_key in inspector.get_foreign_keys("transaction_logs")
    )
    if not has_foreign_key:
        snapshots = _snapshot_sqlite_dependents(bind)
        with op.batch_alter_table("transaction_logs") as batch_op:
            batch_op.create_foreign_key(
                _FOREIGN_KEY_NAME,
                "io_lines",
                [_COLUMN_NAME],
                ["line_id"],
                ondelete="SET NULL",
            )
        _restore_sqlite_dependents(bind, snapshots)
        inspector = sa.inspect(bind)

    index_names = {
        index["name"] for index in inspector.get_indexes("transaction_logs")
    }
    if _INDEX_NAME not in index_names:
        op.create_index(_INDEX_NAME, "transaction_logs", [_COLUMN_NAME])


def downgrade() -> None:
    raise RuntimeError("transaction operation-line link downgrade is disabled")
