"""Repair shipping BOM candidate columns created with incompatible schema types."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa

from app.models.base import UUIDString


revision: str = "20260807_0016"
down_revision: Union[str, None] = "20260807_0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "data-preserving"}

FINALIZATION_MODE_TYPE = sa.Enum(
    "KEEP_BASE",
    "REUSE_CANDIDATE",
    "CREATE_NEW",
    name="shipping_finalization_mode_enum",
)


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _snapshot_sqlite_shipping_dependents(
    bind: sa.Connection,
) -> list[tuple[str, list[str], list[str], list[tuple[object, ...]]]]:
    """Keep dependent rows while SQLite recreates shipping_requests."""
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


def _restore_sqlite_shipping_dependents(
    bind: sa.Connection,
    snapshots: list[tuple[str, list[str], list[str], list[tuple[object, ...]]]],
) -> None:
    """Restore raw SQLite values after the parent table rebuild."""
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


def _has_reuse_pf_foreign_key(inspector: sa.Inspector) -> bool:
    return any(
        foreign_key["constrained_columns"] == ["reuse_pf_item_id"]
        and foreign_key["referred_table"] == "items"
        and foreign_key["referred_columns"] == ["item_id"]
        for foreign_key in inspector.get_foreign_keys("shipping_requests")
    )


def _upgrade_postgresql_offline() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE shipping_finalization_mode_enum AS ENUM
                ('KEEP_BASE', 'REUSE_CANDIDATE', 'CREATE_NEW');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    op.execute(
        "ALTER TABLE shipping_requests "
        "ALTER COLUMN finalization_mode DROP DEFAULT"
    )
    op.execute(
        "ALTER TABLE shipping_requests "
        "ALTER COLUMN finalization_mode TYPE shipping_finalization_mode_enum "
        "USING finalization_mode::shipping_finalization_mode_enum"
    )
    op.execute(
        "ALTER TABLE shipping_requests "
        "ALTER COLUMN finalization_mode SET DEFAULT "
        "'KEEP_BASE'::shipping_finalization_mode_enum"
    )
    op.execute(
        "ALTER TABLE shipping_requests "
        "ALTER COLUMN reuse_pf_item_id TYPE VARCHAR(32) "
        "USING replace(reuse_pf_item_id, '-', '')"
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'fk_shipping_requests_reuse_pf_item'
                  AND conrelid = 'shipping_requests'::regclass
            ) THEN
                ALTER TABLE shipping_requests
                ADD CONSTRAINT fk_shipping_requests_reuse_pf_item
                FOREIGN KEY (reuse_pf_item_id)
                REFERENCES items (item_id)
                ON DELETE SET NULL;
            END IF;
        END $$;
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_shipping_requests_reuse_pf_item_id "
        "ON shipping_requests (reuse_pf_item_id)"
    )


def _requires_finalization_mode_repair(column: dict[str, object], dialect: str) -> bool:
    column_type = column["type"]
    if dialect == "postgresql":
        return not isinstance(column_type, sa.Enum)
    return getattr(column_type, "length", None) != 15


def _requires_reuse_pf_type_repair(column: dict[str, object]) -> bool:
    return getattr(column["type"], "length", None) != 32


def upgrade() -> None:
    if context.is_offline_mode():
        if context.get_context().dialect.name == "postgresql":
            _upgrade_postgresql_offline()
            return
        raise RuntimeError("shipping BOM candidate schema repair requires online inspection")

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {
        column["name"]: column
        for column in inspector.get_columns("shipping_requests")
    }
    needs_finalization_mode_repair = _requires_finalization_mode_repair(
        columns["finalization_mode"], bind.dialect.name
    )
    needs_reuse_pf_type_repair = _requires_reuse_pf_type_repair(
        columns["reuse_pf_item_id"]
    )
    needs_reuse_pf_foreign_key = not _has_reuse_pf_foreign_key(inspector)
    if bind.dialect.name == "postgresql":
        if needs_finalization_mode_repair:
            FINALIZATION_MODE_TYPE.create(bind, checkfirst=True)
            op.execute(
                "ALTER TABLE shipping_requests "
                "ALTER COLUMN finalization_mode DROP DEFAULT"
            )
            op.alter_column(
                "shipping_requests",
                "finalization_mode",
                existing_type=columns["finalization_mode"]["type"],
                type_=FINALIZATION_MODE_TYPE,
                existing_nullable=False,
                postgresql_using="finalization_mode::shipping_finalization_mode_enum",
            )
            op.execute(
                "ALTER TABLE shipping_requests "
                "ALTER COLUMN finalization_mode SET DEFAULT "
                "'KEEP_BASE'::shipping_finalization_mode_enum"
            )
        if needs_reuse_pf_type_repair:
            op.alter_column(
                "shipping_requests",
                "reuse_pf_item_id",
                existing_type=columns["reuse_pf_item_id"]["type"],
                type_=UUIDString(),
                existing_nullable=True,
                postgresql_using="replace(reuse_pf_item_id, '-', '')",
            )
        if needs_reuse_pf_foreign_key:
            op.create_foreign_key(
                "fk_shipping_requests_reuse_pf_item",
                "shipping_requests",
                "items",
                ["reuse_pf_item_id"],
                ["item_id"],
                ondelete="SET NULL",
            )
    elif (
        needs_finalization_mode_repair
        or needs_reuse_pf_type_repair
        or needs_reuse_pf_foreign_key
    ):
        dependent_rows = _snapshot_sqlite_shipping_dependents(bind)
        with op.batch_alter_table("shipping_requests") as batch:
            if needs_finalization_mode_repair:
                batch.alter_column(
                    "finalization_mode",
                    existing_type=columns["finalization_mode"]["type"],
                    type_=FINALIZATION_MODE_TYPE,
                    existing_nullable=False,
                )
            if needs_reuse_pf_type_repair:
                batch.alter_column(
                    "reuse_pf_item_id",
                    existing_type=columns["reuse_pf_item_id"]["type"],
                    type_=UUIDString(),
                    existing_nullable=True,
                )
            if needs_reuse_pf_foreign_key:
                batch.create_foreign_key(
                    "fk_shipping_requests_reuse_pf_item",
                    "items",
                    ["reuse_pf_item_id"],
                    ["item_id"],
                    ondelete="SET NULL",
                )
        _restore_sqlite_shipping_dependents(bind, dependent_rows)

    index_names = {
        index["name"] for index in sa.inspect(bind).get_indexes("shipping_requests")
    }
    if "ix_shipping_requests_reuse_pf_item_id" not in index_names:
        op.create_index(
            "ix_shipping_requests_reuse_pf_item_id",
            "shipping_requests",
            ["reuse_pf_item_id"],
        )


def downgrade() -> None:
    raise RuntimeError("shipping BOM candidate schema repair downgrade is disabled")
