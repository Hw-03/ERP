"""Remove the obsolete REQUESTED shipping status."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260821_0024"
down_revision: Union[str, None] = "20260820_0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {
    "kind": "data-change",
    "allowed_tables": ["shipping_requests"],
    "validator_sql": (
        "SELECT COUNT(*) FROM shipping_requests WHERE status = 'REQUESTED'"
    ),
    "validator_expected": 0,
}


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _snapshot_sqlite_shipping_dependents(
    bind: sa.Connection,
) -> list[tuple[str, list[str], list[str], list[tuple[object, ...]]]]:
    """Preserve direct and transitive children before SQLite rebuilds the parent."""
    remaining = {
        row[0]
        for row in bind.exec_driver_sql(
            "SELECT name FROM sqlite_master "
            "WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    }
    parents = {"shipping_requests"}
    snapshots: list[tuple[str, list[str], list[str], list[tuple[object, ...]]]] = []

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
            return snapshots
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
            selected_columns = ", ".join(
                _quote_identifier(column) for column in columns
            )
            rows = [
                tuple(row)
                for row in bind.exec_driver_sql(
                    f"SELECT {selected_columns} FROM {_quote_identifier(table_name)}"
                ).fetchall()
            ]
            snapshots.append((table_name, columns, primary_key_columns, rows))
        remaining.difference_update(children)
        parents.update(children)


def _restore_sqlite_shipping_dependents(
    bind: sa.Connection,
    snapshots: list[tuple[str, list[str], list[str], list[tuple[object, ...]]]],
) -> None:
    """Restore raw child values and links after the parent table rebuild."""
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
        conflict_sql = (
            "DO UPDATE SET "
            + ", ".join(
                f"{_quote_identifier(column)} = excluded.{_quote_identifier(column)}"
                for column in update_columns
            )
            if update_columns
            else "DO NOTHING"
        )
        bind.exec_driver_sql(
            f"INSERT INTO {_quote_identifier(table_name)} ({column_sql}) "
            f"VALUES ({placeholder_sql}) "
            f"ON CONFLICT ({primary_key_sql}) {conflict_sql}",
            rows,
        )


def _alter_status_default(existing_type: sa.types.TypeEngine) -> None:
    op.alter_column(
        "shipping_requests",
        "status",
        existing_type=existing_type,
        existing_nullable=False,
        server_default=sa.text("'PREPARING'"),
    )


def _postgresql_enum_replacement_statements() -> tuple[str, ...]:
    """Return one transactional sequence that removes REQUESTED from PostgreSQL."""
    return (
        """
        DO $$
        DECLARE
            expected_columns INTEGER;
            dependent_columns TEXT;
        BEGIN
            SELECT COUNT(*)
            INTO expected_columns
            FROM pg_attribute AS attribute
            JOIN pg_class AS relation ON relation.oid = attribute.attrelid
            JOIN pg_namespace AS relation_namespace
              ON relation_namespace.oid = relation.relnamespace
            JOIN pg_type AS status_type ON status_type.oid = attribute.atttypid
            JOIN pg_namespace AS type_namespace
              ON type_namespace.oid = status_type.typnamespace
            WHERE status_type.typname = 'shipping_request_status_enum'
              AND type_namespace.nspname = current_schema()
              AND relation_namespace.nspname = current_schema()
              AND relation.relkind IN ('r', 'p')
              AND relation.relname = 'shipping_requests'
              AND attribute.attname = 'status'
              AND attribute.attnum > 0
              AND NOT attribute.attisdropped;

            SELECT string_agg(
                format(
                    '%I.%I.%I',
                    relation_namespace.nspname,
                    relation.relname,
                    attribute.attname
                ),
                ', ' ORDER BY relation_namespace.nspname, relation.relname, attribute.attname
            )
            INTO dependent_columns
            FROM pg_attribute AS attribute
            JOIN pg_class AS relation ON relation.oid = attribute.attrelid
            JOIN pg_namespace AS relation_namespace
              ON relation_namespace.oid = relation.relnamespace
            JOIN pg_type AS status_type ON status_type.oid = attribute.atttypid
            JOIN pg_namespace AS type_namespace
              ON type_namespace.oid = status_type.typnamespace
            WHERE status_type.typname = 'shipping_request_status_enum'
              AND type_namespace.nspname = current_schema()
              AND relation.relkind IN ('r', 'p')
              AND attribute.attnum > 0
              AND NOT attribute.attisdropped
              AND NOT (
                  relation_namespace.nspname = current_schema()
                  AND relation.relname = 'shipping_requests'
                  AND attribute.attname = 'status'
              );

            IF expected_columns <> 1 THEN
                RAISE EXCEPTION
                    'shipping_request_status_enum is not bound to shipping_requests.status';
            END IF;
            IF dependent_columns IS NOT NULL THEN
                RAISE EXCEPTION
                    'shipping_request_status_enum is used by unexpected columns: %',
                    dependent_columns;
            END IF;
        END $$
        """,
        "UPDATE shipping_requests SET status = 'PREPARING' WHERE status = 'REQUESTED'",
        "ALTER TABLE shipping_requests ALTER COLUMN status DROP DEFAULT",
        "CREATE TYPE shipping_request_status_enum_0024 AS ENUM "
        "('PREPARING', 'PREPARED', 'PICKED_UP', 'CANCELLED')",
        "ALTER TABLE shipping_requests ALTER COLUMN status "
        "TYPE shipping_request_status_enum_0024 "
        "USING status::text::shipping_request_status_enum_0024",
        "DROP TYPE shipping_request_status_enum",
        "ALTER TYPE shipping_request_status_enum_0024 "
        "RENAME TO shipping_request_status_enum",
        "ALTER TABLE shipping_requests ALTER COLUMN status "
        "SET DEFAULT 'PREPARING'::shipping_request_status_enum",
    )


def upgrade() -> None:
    """Move legacy requests into active preparation and change the DB default."""
    dialect_name = context.get_context().dialect.name
    if dialect_name == "postgresql":
        for statement in _postgresql_enum_replacement_statements():
            op.execute(statement)
        return

    if context.is_offline_mode():
        raise RuntimeError(
            "shipping status default migration requires online inspection "
            "outside PostgreSQL"
        )

    bind = op.get_bind()
    op.execute(
        "UPDATE shipping_requests SET status = 'PREPARING' "
        "WHERE status = 'REQUESTED'"
    )
    status_column = next(
        column
        for column in sa.inspect(bind).get_columns("shipping_requests")
        if column["name"] == "status"
    )
    current_default = str(status_column.get("default") or "").strip("()'\"")
    if current_default != "PREPARING":
        if dialect_name == "sqlite":
            dependent_rows = _snapshot_sqlite_shipping_dependents(bind)
            with op.batch_alter_table("shipping_requests") as batch_op:
                batch_op.alter_column(
                    "status",
                    existing_type=status_column["type"],
                    existing_nullable=False,
                    server_default=sa.text("'PREPARING'"),
                )
            _restore_sqlite_shipping_dependents(bind, dependent_rows)
        else:
            _alter_status_default(status_column["type"])


def downgrade() -> None:
    raise RuntimeError(
        "REQUESTED와 PREPARING의 원래 데이터 의미를 복원할 수 없어 downgrade를 지원하지 않습니다."
    )
